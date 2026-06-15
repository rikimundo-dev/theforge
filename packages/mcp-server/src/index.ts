#!/usr/bin/env node
/**
 * @fileoverview **@theforge/mcp-server** — servidor MCP en TypeScript que expone la API REST de The Forge
 * (NestJS) como herramientas MCP. Autenticación M2M: `MCP_M2M_SECRET` → JWT con refresco ante `401`.
 *
 * **Transportes**
 * - HTTP (`StreamableHTTP`): despliegue detrás de Docker/Traefik; flag `--http`, puerto `PORT` (default 3100).
 * - Stdio: desarrollo local o integración como subproceso (sin args).
 *
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 * @license Apache-2.0
 */

import { parseAgentGovernanceScaffold } from "@theforge/shared-types";
import { generateTable, normalizeTable, normalizeAllTables, parseTable } from "@theforge/shared-types/markdown-table";
import { generateMermaid, normalizeMermaid, validateMermaid } from "@theforge/shared-types/mermaid";

// ── Config ────

const API_BASE = process.env.THEFORGE_API_URL ?? "http://theforge-api:3000";
const TIMEOUT_MS = Number(process.env.THEFORGE_MCP_TIMEOUT) || 120_000;
const PORT = Number(process.env.PORT) || 3000;
const USE_HTTP = process.argv.includes("--http");

// ── Local Types ────────────────────────────────────────────────────────

interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
}

interface JSONRPCRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: number | string | null;
}

interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: JSONRPCError;
  id?: number | string | null;
}

// ── JWT Auth Client ────────────────────────────────────────────────────

let jwtToken: string | null = null;
let lastClientSecret: string = "";
let tokenExpiresAt: number = 0;

async function login(secret?: string): Promise<string> {
  const s = secret || lastClientSecret;
  if (!s) {
    throw new Error("MCP_M2M_SECRET header required — usa el secret de Settings en TheForge");
  }
  // Si el token sigue siendo válido (>5 min de margen), reusarlo
  if (jwtToken && lastClientSecret === s && Date.now() < tokenExpiresAt - 300_000) {
    return jwtToken;
  }
  lastClientSecret = s;
  try {
    const res = await fetch(`${API_BASE}/auth/mcp-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: s }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MCP login failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { accessToken: string };
    jwtToken = data.accessToken;
    // JWT típicamente expira en 1h; asumir 55 min para margen
    tokenExpiresAt = Date.now() + 55 * 60 * 1000;
    return jwtToken;
  } catch (err) {
    jwtToken = null;
    tokenExpiresAt = 0;
    throw err;
  }
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (jwtToken) h["Authorization"] = `Bearer ${jwtToken}`;
  return h;
}

// ── HTTP Client (with auto-retry on 401) ───────────────────────────────

async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 401 → re-login y reintentar una vez
    if (res.status === 401 && !retried) {
      await login();
      return apiFetch(method, path, body, true);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${TIMEOUT_MS}ms: ${method} ${path}`);
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error(`Network error connecting to API at ${API_BASE}${path}: ${err.message}`);
    }
    throw err;
  }
}

function apiGet(path: string): Promise<unknown> {
  return apiFetch("GET", path);
}
function apiPost(path: string, body?: unknown): Promise<unknown> {
  return apiFetch("POST", path, body);
}
function apiPatch(path: string, body?: unknown): Promise<unknown> {
  return apiFetch("PATCH", path, body);
}
function apiDelete(path: string): Promise<unknown> {
  return apiFetch("DELETE", path);
}

function summarizeAgentGovernanceField(raw: unknown): {
  exists: boolean;
  wordCount: number;
  content: string | null;
} {
  const text = typeof raw === "string" ? raw : "";
  const scaffold = text.trim() ? parseAgentGovernanceScaffold(text) : null;
  if (scaffold) {
    const wordCount = scaffold.files.reduce(
      (acc, file) => acc + (file.content.trim() ? file.content.trim().split(/\s+/).length : 0),
      0,
    );
    return { exists: true, wordCount, content: text };
  }
  return {
    exists: text.trim().length > 0,
    wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
    content: text.trim().length > 0 ? text : null,
  };
}

// ── Tool Definitions (45 tools) ────────────────────────────────────────

/**
 * Manifiesto MCP: 45 herramientas que reflejan la API REST The Forge (proyectos, entregables, análisis,
 * orquestador, sesiones, flujo legacy e integración Ariadne). Cada `name` debe existir como método en
 * {@link handlers}.
 *
 * @see {@link ./mcp-tools.doc.ts} tabla completa nombre → verbo HTTP.
 * @constant {Tool[]}
 */
const TOOLS: Tool[] = [
  // ── Projects ──
  {
    name: "list_projects",
    description: "Lista todos los proyectos registrados en TheForge",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_project",
    description: "Obtiene un proyecto por su ID",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "ID del proyecto" } },
      required: ["projectId"],
    },
  },
  {
    name: "create_project",
    description: "Crea un nuevo proyecto (NEW=greenfield, LEGACY=existente)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del proyecto" },
        projectType: { type: "string", enum: ["NEW", "LEGACY"], description: "Tipo de proyecto" },
        hasUxTeam: { type: "boolean", description: "Equipo UX disponible" },
        theforgeProjectId: { type: "string", description: "UUID del proyecto en TheForge/Ariadne (requerido si LEGACY)" },
      },
      required: ["name"],
    },
  },
  {
    name: "delete_project",
    description: "Elimina un proyecto",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_project_deliverables",
    description:
      "Devuelve un resumen estructurado de todos los documentos de la cascada (Spec, Blueprint, API Contracts, Architecture, Use Cases, User Stories, Logic Flows, Infra, UX/UI Guide, DBGA, Agent Governance). Cada doc incluye 'exists', 'wordCount' y 'content' completo si existe. agentGovernanceContent es JSON scaffold (rules/skills/AGENTS.md). Los docs de stage (BRD, To-Be, As-Is, MDD) están en get_project_stages.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "ID del proyecto" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_project_stages",
    description: "Lista las etapas (stages) de un proyecto. Incluye projectDocuments (resumen de documentos de la cascada del Project).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_conformance",
    description: "Reporte de conformidad del proyecto contra el MDD",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        useLlm: { type: "boolean", description: "Usar LLM para el análisis" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "patch_project",
    description: "Actualiza campos del proyecto (mddContent, dbgaContent, blueprintContent, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        fields: {
          type: "object",
          description: "Campos a actualizar (mddContent, dbgaContent, blueprintContent, specContent, etc.)",
          additionalProperties: true,
        },
      },
      required: ["projectId", "fields"],
    },
  },
  {
    name: "generate_benchmark",
    description: "Genera benchmark / análisis de mercado para un proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        userIdea: { type: "string", description: "Idea del usuario" },
        urls: { type: "array", items: { type: "string" }, description: "URLs de referencia" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "phase0_deep_research",
    description: "Ejecuta investigación profunda Fase 0: benchmark + DBGA",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        userIdea: { type: "string" },
        urls: { type: "array", items: { type: "string" } },
        includeBenchmark: { type: "boolean" },
      },
      required: ["projectId", "userIdea"],
    },
  },
  {
    name: "suggest_brd_tobe_from_dbga",
    description: "Genera borradores BRD y To-Be desde DBGA (greenfield)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        stageId: { type: "string", description: "ID de etapa opcional" },
      },
      required: ["projectId"],
    },
  },
  // ── Deliverables ──
  {
    name: "generate_deliverables",
    description: "Cascada completa de entregables: SPEC, Arquitectura, Casos de uso, Historias, Blueprint, API, Infra, Tasks",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "generate_spec",
    description: "Genera el documento SPEC del proyecto",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "generate_blueprint",
    description: "Genera el Implementation Blueprint",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: { type: "boolean", description: "Solo previsualizar" },
        gapsFeedback: { type: "string", description: "Feedback para cubrir gaps" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_architecture",
    description: "Genera el documento de arquitectura",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: { type: "boolean" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_api_contracts",
    description: "Genera los contratos de API",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: { type: "boolean" },
        gapsFeedback: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_use_cases",
    description: "Genera los casos de uso",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: { type: "boolean" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_user_stories",
    description: "Genera las historias de usuario",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: { type: "boolean" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_logic_flows",
    description: "Genera los flujos de lógica de negocio",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        gapsFeedback: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_infra",
    description: "Genera el documento de infraestructura",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: { type: "boolean" },
        gapsFeedback: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "generate_agent_governance",
    description:
      "Genera el scaffold de Gobernanza IA (AGENTS.md, rules, skills, mcp.json.example) desde MDD + Blueprint + complejidad",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        preview: {
          type: "boolean",
          description: "Si true, no persiste; devuelve { content } con el JSON scaffold",
        },
        queue: {
          type: "boolean",
          description: "Si true y la cola de entregables está activa, encola el job async",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_agent_governance_export",
    description:
      "Devuelve el scaffold de Gobernanza IA reconciliado para export/ZIP (sin re-llamar al LLM)",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "confirm_complexity",
    description: "Confirma la complejidad propuesta del proyecto",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "reassess_complexity",
    description: "Re-evalúa la complejidad del proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        note: { type: "string", description: "Nota opcional para contextualizar" },
      },
      required: ["projectId"],
    },
  },
  // ── AI Analysis ──
  {
    name: "start_analysis",
    description: "Inicia un análisis DBGA (Domain-Based Goal Analysis) desde una idea",
    inputSchema: {
      type: "object",
      properties: {
        idea: { type: "string", description: "La idea del proyecto a analizar" },
        projectId: { type: "string", description: "ID del proyecto opcional (para persistir estado)" },
      },
      required: ["idea"],
    },
  },
  {
    name: "get_estimation",
    description: "Métricas de estimación: semáforo + horas + costo MXN",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        stageId: { type: "string", description: "ID de etapa opcional" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_mdd_thread",
    description: "Obtiene el threadId del flujo MDD activo",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        stageId: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_adrs",
    description: "Decisiones arquitectónicas (ADRs) del proyecto",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "review_mdd",
    description: "Revisa consistencia del MDD y re-deriva diagramas",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        mddContent: { type: "string", description: "Contenido MDD opcional" },
      },
      required: ["projectId"],
    },
  },
  // ── AI Orchestrator ──
  {
    name: "orchestrator_chat",
    description: "Chat con el orquestador IA con contexto completo del proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        message: { type: "string", description: "Mensaje del usuario" },
        sessionId: { type: "string" },
        mddContent: { type: "string" },
        activeTab: { type: "string" },
        stageId: { type: "string" },
        dbgaContent: { type: "string" },
        uxUiGuideContent: { type: "string" },
        brdContent: { type: "string" },
        toBeManualContent: { type: "string" },
      },
      required: ["projectId", "message"],
    },
  },
  {
    name: "orchestrator_welcome",
    description: "Mensaje de bienvenida del orquestador para un proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        sessionId: { type: "string" },
        activeTab: { type: "string" },
        stageId: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orchestrator_clear_chat",
    description: "Limpia el historial de chat del proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        sessionId: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  // ── Sessions ──
  {
    name: "create_session",
    description: "Crea una nueva sesión de chat en un proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string", description: "Título de la sesión" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "get_project_sessions",
    description: "Lista las sesiones de un proyecto",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "get_session",
    description: "Obtiene una sesión por ID",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
  },
  {
    name: "chat_in_session",
    description: "Envía un mensaje en una sesión existente con contexto completo",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        message: { type: "string" },
        activeTab: { type: "string" },
        stageId: { type: "string" },
        mddContent: { type: "string" },
      },
      required: ["sessionId", "message"],
    },
  },
  // ── Legacy Flow ──
  {
    name: "legacy_start",
    description: "Inicia flujo legacy: envía descripción a AriadneSpecs para obtener archivos y preguntas",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto (debe ser tipo LEGACY)" },
        description: { type: "string", description: "Descripción de la modificación deseada" },
      },
      required: ["projectId", "description"],
    },
  },
  {
    name: "legacy_answer",
    description: "Responde preguntas del flujo legacy",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        answers: {
          type: "object",
          description: "Mapa índice → respuesta (ej. { \"0\": \"10\", \"1\": \"30\" })",
          additionalProperties: { type: "string" },
        },
      },
      required: ["projectId", "answers"],
    },
  },
  {
    name: "legacy_generate_mdd",
    description:
      "Genera MDD legacy (persiste en stage). Respuesta ligera por defecto; includeContent=true devuelve markdown completo.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        stageId: { type: "string" },
        includeContent: {
          type: "boolean",
          description: "Si true, añade ?includeContent=true (respuesta grande; preferir get_project después)",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "legacy_generate_codebase_doc",
    description: "Genera documentación del codebase vía AriadneSpecs MCP",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        responseMode: {
          type: "string",
          enum: ["default", "evidence_first", "raw_evidence", "ingest_mdd"],
          description: "Modo de generación: default (descubrimiento escalonado), evidence_first, raw_evidence, ingest_mdd (MDD completo del orquestador)",
        },
        stageId: { type: "string", description: "ID de etapa opcional" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "legacy_generate_deliverables",
    description: "Cascada de entregables del flujo legacy",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "legacy_update_codebase_doc",
    description: "Actualiza manualmente la documentación del codebase",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        codebaseDoc: { type: "string", description: "Contenido Markdown" },
      },
      required: ["projectId", "codebaseDoc"],
    },
  },
  {
    name: "legacy_generate_as_is_manual",
    description: "Genera mapa As-Is desde codebaseDoc",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "legacy_suggest_brd_tobe",
    description: "Genera borradores BRD y To-Be desde codebaseDoc (legacy)",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
  },
  {
    name: "legacy_resolve_index_sdd_conflict",
    description: "Resuelve conflicto entre índice MCP y SDD",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        choice: {
          type: "string",
          enum: ["trust_index", "trust_sdd", "proceed_with_warnings"],
          description: "Cómo resolver el conflicto",
        },
      },
      required: ["projectId", "choice"],
    },
  },
  // ── Legacy Flow — Nuevos servicios (ChangeInterview, Navigation Impact, Transición) ──
  {
    name: "legacy_interview_start",
    description: "Inicia entrevista conversacional legacy: envía descripción, recibe preguntas contextuales basadas en navigation map del proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto (debe ser tipo LEGACY)" },
        description: { type: "string", description: "Descripción del cambio en lenguaje natural" },
        stageId: { type: "string", description: "ID de etapa opcional para persistir resultado" },
      },
      required: ["projectId", "description"],
    },
  },
  {
    name: "legacy_interview_chat",
    description: "Continúa la entrevista conversacional: envía mensaje del usuario y recibe respuesta con preguntas contextuales",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID del start" },
        message: { type: "string", description: "Mensaje del usuario" },
      },
      required: ["sessionId", "message"],
    },
  },
  {
    name: "legacy_interview_confirm",
    description: "Confirma y persiste el ChangeScope de la entrevista actual",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID del start" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "legacy_interview_status",
    description: "Obtiene el estado actual de la entrevista: mensajes, ChangeScope y rutas afectadas",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID del start" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "legacy_resolve_change_to_files",
    description: "Dada una descripción de cambio, resuelve los archivos exactos a modificar usando el navigation map del proyecto",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto" },
        description: { type: "string", description: "Descripción del cambio" },
        stageId: { type: "string", description: "Etapa base opcional" },
      },
      required: ["projectId", "description"],
    },
  },
  {
    name: "legacy_check_navigation_impact",
    description: "Evalúa si modificar un componente afecta múltiples rutas en el mapa de navegación. Detecta componentes compartidos",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto" },
        componentPath: { type: "string", description: "Ruta del componente a modificar (ej. src/shared/AddressForm.tsx)" },
        stageId: { type: "string", description: "Etapa base opcional" },
      },
      required: ["projectId", "componentPath"],
    },
  },
  {
    name: "legacy_transition_status",
    description: "Verifica si un proyecto NEW puede transicionar a flujo legacy (consulta AriadneSpecs para saber si el código está indexado)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "legacy_execute_transition",
    description: "Ejecuta la transición a flujo legacy: crea stage baseline con navigation map inicial del código existente",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto" },
      },
      required: ["projectId"],
    },
  },
  // ── Phase 0 → Phase 1 Automation ──
  {
    name: "generate_phase0",
    description:
      "Flujo completo de cero a primer borrador: crea proyecto (NEW), ejecuta análisis DBGA + deep research, genera MDD + BRD y los sube al proyecto. Retorna projectId con contenido listo para revisar y perfeccionar.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del proyecto" },
        idea: { type: "string", description: "Descripción de la idea u oportunidad de negocio" },
        urls: { type: "array", items: { type: "string" }, description: "URLs de referencia (opcional)" },
        hasUxTeam: { type: "boolean", description: "Equipo UX disponible (default: false)" },
      },
      required: ["name", "idea"],
    },
  },
  {
    name: "merge_projects",
    description:
      "Fusiona 2 o más proyectos en Paso 0 (DBGA): sintetiza borrador Fase 0, opcional benchmark, suite de sub-productos, archivado de fuentes y auditoría automática.",
    inputSchema: {
      type: "object",
      properties: {
        sourceProjectIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs de proyectos fuente (mínimo 2)",
        },
        name: { type: "string", description: "Nombre si targetMode=new" },
        targetMode: { type: "string", enum: ["new", "existing"], description: "Default: new" },
        targetProjectId: { type: "string", description: "Requerido si targetMode=existing" },
        deleteSources: {
          type: "string",
          enum: ["keep", "archive", "delete"],
          description: "Qué hacer con las fuentes (excepto destino)",
        },
        resetDownstream: { type: "boolean", description: "Limpiar MDD y entregables en destino (default true)" },
        createSuite: { type: "boolean", description: "Vincular fuentes como sub-productos" },
        includeBenchmark: { type: "boolean", description: "Incluir benchmark/deep research en la fusión" },
        autoAudit: { type: "boolean", description: "Lanzar auditoría Paso 0 tras fusionar" },
        preview: { type: "boolean", description: "Solo vista previa, sin persistir" },
      },
      required: ["sourceProjectIds"],
    },
  },
  // ── TheForge Integration ──
  {
    name: "set_aem_content",
    description: "Actualiza el contenido AEM (Análisis y Estrategia de Mercado) del proyecto. Usado por aplicaciones externas de análisis de mercado.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        content: { type: "string", description: "Contenido AEM en Markdown" },
      },
      required: ["projectId", "content"],
    },
  },
  {
    name: "get_change_log",
    description: "Obtiene la bitácora de cambios de un proyecto (quién modificó qué y cuándo).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto" },
        limit: { type: "number", description: "Máximo de entradas (default 50)" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "list_theforge_projects",
    description: "Lista proyectos indexados en TheForge/Ariadne (multi-root)",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_project_tables",
    description: "Obtiene definiciones de tablas SQL del §3 (Modelo de Datos) del MDD de un proyecto de referencia. Opcional: filtrar solo las tablas especificadas en tableNames.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID del proyecto del que extraer las tablas" },
        tableNames: {
          type: "array",
          items: { type: "string" },
          description: "Lista opcional de nombres de tablas a filtrar (ej. ['usuarios', 'pagos']). Si se omite, devuelve todas.",
        },
      },
      required: ["projectId"],
    },
  },
  // ── Utility Tools (formato consistente, single source of truth) ──
  {
    name: "generate_markdown_table",
    description: "Genera una tabla markdown normalizada a partir de datos estructurados. Úsalo cada vez que necesites INSERTAR una tabla markdown nueva en un documento — headers, rows, alignment opcional. Es la ÚNICA fuente de verdad para tablas markdown, evita que cada LLM genere sintaxis diferente.",
    inputSchema: {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: {
            oneOf: [
              { type: "string", description: "Nombre del header (alignment=left)" },
              {
                type: "object",
                properties: {
                  header: { type: "string" },
                  align: { type: "string", enum: ["left", "center", "right"] },
                  minWidth: { type: "number" },
                },
                required: ["header"],
              },
            ],
          },
          description: "Encabezados de columna. Ej: ['Nombre', {header:'Edad', align:'right'}, 'Rol']",
        },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "Filas de datos. Cada fila debe tener el mismo número de celdas que columns.",
        },
        caption: { type: "string", description: "Título/texto opcional antes de la tabla" },
      },
      required: ["columns", "rows"],
    },
  },
  {
    name: "normalize_markdown_table",
    description: "Corrige una tabla markdown EXISTENTE (generada por un LLM) para que cumpla con el formato estandar: sin línea en blanco tras el separador, columnas padding uniforme, sin filas vacías, alignment detectado automáticamente.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", description: "La tabla markdown a normalizar (puede incluir ```mermaid``` fences)" },
      },
      required: ["table"],
    },
  },
  {
    name: "generate_mermaid",
    description: "Genera un diagrama Mermaid VÁLIDO a partir de datos estructurados. Soporta: flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, stateDiagram, pie, gitGraph. Úsalo cada vez que necesites INSERTAR un diagrama Mermaid nuevo — es la ÚNICA fuente de verdad para sintaxis Mermaid.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["flowchart", "sequenceDiagram", "classDiagram", "erDiagram", "gantt", "stateDiagram", "pie", "gitGraph"],
          description: "Tipo de diagrama Mermaid",
        },
        options: {
          type: "object",
          description: "Opciones específicas del tipo de diagrama. Para flowchart: { direction, nodes: [{id, label, shape}], edges: [{from, to, label, type}], subgraphs }. Para sequenceDiagram: { participants: string[], messages: [{from, to, label, type}] }.",
          properties: {
            direction: { type: "string", description: "Solo para flowchart: TD, LR, BT, RL" },
            title: { type: "string", description: "Título del diagrama" },
          },
        },
      },
      required: ["type", "options"],
    },
  },
  {
    name: "normalize_mermaid",
    description: "Valida y corrige un diagrama Mermaid EXISTENTE (generado por un LLM). Detecta errores comunes: IDs con espacios, bloques alt/opt sin cerrar, subgraphs sin end, quotes inconsistentes, y los arregla automáticamente.",
    inputSchema: {
      type: "object",
      properties: {
        mermaid: { type: "string", description: "El diagrama Mermaid a normalizar (con o sin ```mermaid``` fences)" },
      },
      required: ["mermaid"],
    },
  },
];

// ── Handler Map ────────────────────────────────────────────────────────

type Handler = (args: Record<string, unknown>) => Promise<string>;

/**
 * Mapa nombre MCP → función async que serializa JSON de respuesta API. Las claves deben coincidir con
 * {@link TOOLS}. Errores de red o 4xx/5xx se propagan al `catch` de `CallTool`.
 *
 * @see {@link ./mcp-tools.doc.ts}
 */
const handlers: Record<string, Handler> = {
  // Projects
  async list_projects() {
    return JSON.stringify(await apiGet("/projects"));
  },
  async get_project(args) {
    return JSON.stringify(await apiGet(`/projects/${args.projectId}`));
  },
  async create_project(args) {
    return JSON.stringify(
      await apiPost("/projects", {
        name: args.name,
        projectType: args.projectType ?? "NEW",
        hasUxTeam: args.hasUxTeam ?? false,
        theforgeProjectId: args.theforgeProjectId ?? undefined,
      }),
    );
  },
  async delete_project(args) {
    return JSON.stringify(await apiDelete(`/projects/${args.projectId}`));
  },
  async get_project_stages(args) {
    const projectId = args.projectId as string;
    const [stagesResult, projectResult] = await Promise.all([
      apiGet(`/projects/${projectId}/stages`),
      apiGet(`/projects/${projectId}`).catch(() => null),
    ]);
    const result = stagesResult as Record<string, unknown>;
    // Attach project document summary so agents see what cascade docs exist
    if (projectResult && typeof projectResult === "object") {
      const p = projectResult as Record<string, unknown>;
      const docFields = [
        "specContent", "architectureContent", "blueprintContent",
        "apiContractsContent", "useCasesContent", "userStoriesContent",
        "logicFlowsContent", "infraContent", "tasksContent",
        "uxUiGuideContent", "dbgaContent", "phase0SummaryContent",
        "aemContent", "agentGovernanceContent",
      ];
      const projectDocuments: Record<string, { exists: boolean; wordCount: number }> = {};
      for (const field of docFields) {
        const content = p[field];
        if (field === "agentGovernanceContent") {
          const summary = summarizeAgentGovernanceField(content);
          projectDocuments[field] = {
            exists: summary.exists,
            wordCount: summary.wordCount,
          };
          continue;
        }
        const text = typeof content === "string" ? content : "";
        projectDocuments[field] = {
          exists: text.trim().length > 0,
          wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
        };
      }
      (result as any).projectDocuments = projectDocuments;
    }
    return JSON.stringify(result);
  },
  async get_project_deliverables(args) {
    const projectId = args.projectId as string;
    const project = await apiGet(`/projects/${projectId}`) as Record<string, unknown>;
    const docFields: { key: string; label: string }[] = [
      { key: "specContent", label: "Spec" },
      { key: "architectureContent", label: "Architecture" },
      { key: "blueprintContent", label: "Blueprint" },
      { key: "apiContractsContent", label: "API Contracts" },
      { key: "useCasesContent", label: "Use Cases" },
      { key: "userStoriesContent", label: "User Stories" },
      { key: "logicFlowsContent", label: "Logic Flows" },
      { key: "infraContent", label: "Infrastructure" },
      { key: "tasksContent", label: "Tasks" },
      { key: "uxUiGuideContent", label: "UX/UI Guide" },
      { key: "dbgaContent", label: "DBGA" },
      { key: "phase0SummaryContent", label: "Phase 0 Summary" },
      { key: "aemContent", label: "AEM" },
      { key: "agentGovernanceContent", label: "Agent Governance / Gobernanza IA" },
    ];
    const deliverables: Record<string, { label: string; exists: boolean; wordCount: number; content: string | null }> = {};
    for (const { key, label } of docFields) {
      const content = project[key];
      if (key === "agentGovernanceContent") {
        const summary = summarizeAgentGovernanceField(content);
        deliverables[key] = { label, ...summary };
        continue;
      }
      const text = typeof content === "string" ? content : "";
      deliverables[key] = {
        label,
        exists: text.trim().length > 0,
        wordCount: text.trim() ? text.trim().split(/\s+/).length : 0,
        content: text.trim().length > 0 ? text : null,
      };
    }
    return JSON.stringify({
      projectId,
      projectName: project.name ?? null,
      deliverables,
      totalDocs: Object.values(deliverables).filter((d) => d.exists).length,
      note: "Los documentos de stage (BRD, To-Be, As-Is, MDD) están en get_project_stages, no en este tool.",
    });
  },
  async get_conformance(args) {
    return JSON.stringify(
      await apiGet(`/projects/${args.projectId}/conformance?useLlm=${args.useLlm === true ? "true" : "false"}`),
    );
  },
  async patch_project(args) {
    const { projectId, fields } = args as { projectId: string; fields: Record<string, unknown> };
    return JSON.stringify(await apiPatch(`/projects/${projectId}`, fields));
  },
  async generate_benchmark(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/generate-benchmark`, {
        userIdea: args.userIdea ?? "",
        urls: (args.urls as string[]) ?? [],
      }),
    );
  },
  async phase0_deep_research(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/phase0-deep-research`, {
        userIdea: args.userIdea ?? "",
        urls: (args.urls as string[]) ?? [],
        includeBenchmark: args.includeBenchmark ?? false,
      }),
    );
  },
  async suggest_brd_tobe_from_dbga(args) {
    const body: Record<string, unknown> = {};
    if (args.stageId) body.stageId = args.stageId;
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/suggest-brd-tobe-from-dbga`, body));
  },
  // Deliverables
  async generate_deliverables(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/generate-deliverables`));
  },
  async generate_spec(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/generate-spec`));
  },
  async generate_blueprint(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/generate-blueprint`, {
      preview: args.preview ?? false,
      gapsFeedback: (args.gapsFeedback as string) ?? "",
    }));
  },
  async generate_architecture(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/generate-architecture`, {
      preview: args.preview ?? false,
    }));
  },
  async generate_api_contracts(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/generate-api-contracts`, {
        preview: args.preview ?? false,
        gapsFeedback: (args.gapsFeedback as string) ?? "",
      }),
    );
  },
  async generate_use_cases(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/generate-use-cases`, {
      preview: args.preview ?? false,
    }));
  },
  async generate_user_stories(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/generate-user-stories`, {
      preview: args.preview ?? false,
    }));
  },
  async generate_logic_flows(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/generate-logic-flows`, {
        gapsFeedback: (args.gapsFeedback as string) ?? "",
      }),
    );
  },
  async generate_infra(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/generate-infra`, {
        preview: args.preview ?? false,
        gapsFeedback: (args.gapsFeedback as string) ?? "",
      }),
    );
  },
  async generate_agent_governance(args) {
    const queue = args.queue === true ? "?queue=true" : "";
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/generate-agent-governance${queue}`, {
        preview: args.preview ?? false,
      }),
    );
  },
  async get_agent_governance_export(args) {
    return JSON.stringify(await apiGet(`/projects/${args.projectId}/agent-governance-export`));
  },
  async confirm_complexity(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/confirm-complexity`));
  },
  async reassess_complexity(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/reassess-complexity`, {
        note: (args.note as string) ?? "",
      }),
    );
  },
  // AI Analysis
  async start_analysis(args) {
    const body: Record<string, unknown> = { idea: args.idea };
    if (args.projectId) body.projectId = args.projectId;
    return JSON.stringify(await apiPost("/ai-analysis/start", body));
  },
  async get_estimation(args) {
    let path = `/ai-analysis/estimation?projectId=${args.projectId}`;
    if (args.stageId) path += `&stageId=${args.stageId}`;
    return JSON.stringify(await apiGet(path));
  },
  async get_mdd_thread(args) {
    let path = `/ai-analysis/mdd/thread?projectId=${args.projectId}`;
    if (args.stageId) path += `&stageId=${args.stageId}`;
    return JSON.stringify(await apiGet(path));
  },
  async get_adrs(args) {
    return JSON.stringify(await apiGet(`/ai-analysis/mdd/adrs?projectId=${args.projectId}`));
  },
  async review_mdd(args) {
    const body: Record<string, unknown> = { projectId: args.projectId };
    if (args.mddContent) body.mddContent = args.mddContent;
    return JSON.stringify(await apiPost("/ai-analysis/mdd/review", body));
  },
  // Orchestrator
  async orchestrator_chat(args) {
    return JSON.stringify(
      await apiPost("/ai-orchestrator/chat", {
        projectId: args.projectId,
        message: args.message,
        sessionId: (args.sessionId as string) ?? "",
        mddContent: (args.mddContent as string) ?? null,
        activeTab: (args.activeTab as string) ?? "",
        stageId: (args.stageId as string) ?? "",
        dbgaContent: (args.dbgaContent as string) ?? null,
        uxUiGuideContent: (args.uxUiGuideContent as string) ?? null,
        brdContent: (args.brdContent as string) ?? null,
        toBeManualContent: (args.toBeManualContent as string) ?? null,
      }),
    );
  },
  async orchestrator_welcome(args) {
    return JSON.stringify(
      await apiPost("/ai-orchestrator/welcome", {
        projectId: args.projectId,
        sessionId: (args.sessionId as string) ?? "",
        activeTab: (args.activeTab as string) ?? "",
        stageId: (args.stageId as string) ?? "",
      }),
    );
  },
  async orchestrator_clear_chat(args) {
    return JSON.stringify(
      await apiPost("/ai-orchestrator/clear-chat", {
        projectId: args.projectId,
        sessionId: (args.sessionId as string) ?? "",
      }),
    );
  },
  // Sessions
  async create_session(args) {
    return JSON.stringify(
      await apiPost("/sessions", {
        projectId: args.projectId,
        title: (args.title as string) ?? "Nueva sesión",
      }),
    );
  },
  async get_project_sessions(args) {
    return JSON.stringify(await apiGet(`/sessions/project/${args.projectId}`));
  },
  async get_session(args) {
    return JSON.stringify(await apiGet(`/sessions/${args.sessionId}`));
  },
  async chat_in_session(args) {
    return JSON.stringify(
      await apiPost(`/sessions/${args.sessionId}/chat`, {
        message: args.message,
        activeTab: (args.activeTab as string) ?? "",
        stageId: (args.stageId as string) ?? "",
        mddContent: (args.mddContent as string) ?? null,
      }),
    );
  },
  // Legacy
  async legacy_start(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/legacy/start`, {
        description: args.description,
      }),
    );
  },
  async legacy_answer(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/legacy/answer`, {
        answers: args.answers,
      }),
    );
  },
  async legacy_generate_mdd(args) {
    const query = args.includeContent === true ? "?includeContent=true" : "";
    const body: Record<string, unknown> = {};
    if (args.stageId) body.stageId = args.stageId;
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/legacy/generate-mdd${query}`, body),
    );
  },
  async legacy_generate_codebase_doc(args) {
    const body: Record<string, unknown> = {};
    if (args.responseMode !== undefined) body.responseMode = args.responseMode;
    if (args.stageId !== undefined) body.stageId = args.stageId;
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/legacy/generate-codebase-doc`, body),
    );
  },
  async legacy_generate_deliverables(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/generate-deliverables`));
  },
  async legacy_update_codebase_doc(args) {
    return JSON.stringify(
      await apiPatch(`/projects/${args.projectId}/legacy/codebase-doc`, {
        codebaseDoc: args.codebaseDoc,
      }),
    );
  },
  async legacy_generate_as_is_manual(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/generate-as-is-manual`));
  },
  async legacy_suggest_brd_tobe(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/suggest-brd-tobe-from-codebase-doc`));
  },
  async legacy_resolve_index_sdd_conflict(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/legacy/resolve-index-sdd-conflict`, {
        choice: args.choice,
      }),
    );
  },
  // Legacy — Nuevos servicios
  async legacy_interview_start(args) {
    const body: Record<string, unknown> = { description: args.description };
    if (args.stageId !== undefined) body.stageId = args.stageId;
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/interview/start`, body));
  },
  async legacy_interview_chat(args) {
    return JSON.stringify(
      await apiPost(`/projects/${args.projectId}/legacy/interview/${args.sessionId}/chat`, {
        message: args.message,
      }),
    );
  },
  async legacy_interview_confirm(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/interview/${args.sessionId}/confirm`));
  },
  async legacy_interview_status(args) {
    return JSON.stringify(await apiGet(`/projects/${args.projectId}/legacy/interview/${args.sessionId}`));
  },
  async legacy_resolve_change_to_files(args) {
    const body: Record<string, unknown> = { description: args.description };
    if (args.stageId !== undefined) body.stageId = args.stageId;
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/resolve-change-to-files`, body));
  },
  async legacy_check_navigation_impact(args) {
    const body: Record<string, unknown> = { componentPath: args.componentPath };
    if (args.stageId !== undefined) body.stageId = args.stageId;
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/check-navigation-impact`, body));
  },
  async legacy_transition_status(args) {
    return JSON.stringify(await apiGet(`/projects/${args.projectId}/legacy/transition-status`));
  },
  async legacy_execute_transition(args) {
    return JSON.stringify(await apiPost(`/projects/${args.projectId}/legacy/execute-transition`));
  },
  // Phase 0 → Phase 1: Zero to first draft
  async generate_phase0(args) {
    const name = args.name as string;
    const idea = args.idea as string;
    const urls = (args.urls as string[]) ?? [];
    const hasUxTeam = (args.hasUxTeam as boolean) ?? false;

    // Step 1: Crear proyecto NEW
    console.error("[theforge-mcp] [generate_phase0] Paso 1: Creando proyecto...");
    const project = await apiPost("/projects", {
      name,
      projectType: "NEW",
      hasUxTeam,
    }) as { id: string };
    const projectId = project.id;

    // Step 2: Iniciar análisis DBGA
    console.error("[theforge-mcp] [generate_phase0] Paso 2: Iniciando DBGA...");
    await apiPost("/ai-analysis/start", { idea, projectId });

    // Step 3: Deep research + MDD generation
    console.error("[theforge-mcp] [generate_phase0] Paso 3: Deep research + MDD...");
    const deepResult = await apiPost(`/projects/${projectId}/phase0-deep-research`, {
      userIdea: idea,
      urls,
      includeBenchmark: true,
    }) as Record<string, unknown>;

    // Step 3b: Sync phase0SummaryContent → dbgaContent (el deep research guarda en phase0, pero suggest-brd-tobe lee dbga)
    console.error("[theforge-mcp] [generate_phase0] Paso 3b: Sincronizando phase0 → dbgaContent...");
    const projectBeforeSync = await apiGet(`/projects/${projectId}`) as Record<string, unknown>;
    const phase0 = (projectBeforeSync.phase0SummaryContent as string || "").trim();
    const dbga = (projectBeforeSync.dbgaContent as string || "").trim();
    if (phase0.length >= 300 && dbga.length < 300) {
      await apiPatch(`/projects/${projectId}`, { dbgaContent: phase0 });
      console.error("[theforge-mcp] [generate_phase0] dbgaContent actualizado desde phase0SummaryContent");
    }

    // Step 4: Generar BRD + To-Be desde DBGA
    console.error("[theforge-mcp] [generate_phase0] Paso 4: Generando BRD + To-Be...");
    const brdTobeResult = await apiPost(`/projects/${projectId}/suggest-brd-tobe-from-dbga`) as Record<string, unknown>;

    // Step 5: Leer el proyecto para obtener mddContent y brdContent
    console.error("[theforge-mcp] [generate_phase0] Paso 5: Obteniendo contenido generado...");
    const fullProject = await apiGet(`/projects/${projectId}`) as Record<string, unknown>;

    const summary = {
      projectId,
      projectName: name,
      deepResearch: deepResult ?? "completed",
      brdTobe: brdTobeResult ?? "completed",
      mddContent: fullProject.mddContent ? "generado ✓" : "no generado",
      brdContent: fullProject.brdContent ? "generado ✓" : "no generado",
      message: "MDD y BRD generados. Revisa y perfecciona en la UI.",
    };

    return JSON.stringify(summary);
  },
  async merge_projects(args) {
    const sourceProjectIds = args.sourceProjectIds as string[];
    if (!Array.isArray(sourceProjectIds) || sourceProjectIds.length < 2) {
      throw new Error("merge_projects requiere sourceProjectIds con al menos 2 IDs");
    }
    const body: Record<string, unknown> = {
      sourceProjectIds,
      targetMode: (args.targetMode as string) ?? "new",
      deleteSources: (args.deleteSources as string) ?? "keep",
      resetDownstream: args.resetDownstream !== false,
      createSuite: args.createSuite === true,
      autoAudit: args.autoAudit !== false,
      preview: args.preview === true,
      sourceOptions: {
        includeDbga: true,
        includePhase0Json: true,
        includeBenchmark: args.includeBenchmark === true,
      },
    };
    if (typeof args.name === "string") body.name = args.name;
    if (typeof args.targetProjectId === "string") body.targetProjectId = args.targetProjectId;
    const result = await apiPost("/projects/merge", body);
    return JSON.stringify(result, null, 2);
  },
  // TheForge
  async set_aem_content(args) {
    const { projectId, content } = args as { projectId: string; content: string };
    return JSON.stringify(await apiPatch(`/projects/${projectId}`, { aemContent: content }));
  },
  // ChangeLog
  async get_change_log(args) {
    const { projectId, limit } = args as { projectId: string; limit?: number };
    let path = `/projects/${projectId}/change-log`;
    if (limit != null) path += `?limit=${limit}`;
    return JSON.stringify(await apiGet(path));
  },
  // TheForge
  async list_theforge_projects() {
    return JSON.stringify(await apiGet("/theforge/projects"));
  },
  async get_project_tables(args) {
    const { projectId, tableNames } = args as { projectId: string; tableNames?: string[] };
    const project = await apiGet(`/projects/${projectId}`) as Record<string, unknown>;
    const mddContent = (project.mddContent as string ?? "").trim();
    if (!mddContent) {
      return JSON.stringify({ error: "El proyecto no tiene contenido MDD", tables: [] });
    }
    // Extraer sección 3 (Modelo de Datos) - buscar CREATE TABLE
    const section3Match = mddContent.match(/##\s+(?:3\.\s+)?Modelo\s+(?:de\s+)?Datos[^#]*(?:CREATE\s+TABLE[\s\S]*?)(?=\n##\s+(?:4|5|6|7)\.|\n##\s+(?:Seguridad|Infraestructura|Contratos|Lógica)|\z)/i);
    const sqlBlock = section3Match?.[0] ?? "";
    if (!sqlBlock.trim()) {
      return JSON.stringify({ error: "No se encontró la sección 3 (Modelo de Datos) en el MDD", tables: [] });
    }
    // Extraer todas las sentencias CREATE TABLE
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
    const allTables: { name: string; sql: string; columns: string[] }[] = [];
    let tableMatch: RegExpExecArray | null;
    while ((tableMatch = tableRegex.exec(sqlBlock)) !== null) {
      const name = tableMatch[1]!;
      const body = tableMatch[2]!.trim();
      const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
      allTables.push({ name, sql: tableMatch[0]!, columns: lines.slice(0, 20) }); // max 20 col preview
    }
    let tables = allTables;
    if (Array.isArray(tableNames) && tableNames.length > 0) {
      const filterSet = new Set(tableNames.map(n => n.toLowerCase()));
      tables = allTables.filter(t => filterSet.has(t.name.toLowerCase()));
    }
    return JSON.stringify({
      projectId,
      projectName: project.name ?? "",
      total: allTables.length,
      filtered: tables.length,
      tables: tables.map(t => ({ name: t.name, sql: t.sql })),
    });
  },
  // ── Utility Tools ──
  async generate_markdown_table(args) {
    const { columns, rows, caption } = args as { columns: any[]; rows: string[][]; caption?: string };
    return generateTable({ columns, rows, caption });
  },
  async normalize_markdown_table(args) {
    const { table } = args as { table: string };
    return normalizeTable(table);
  },
  async generate_mermaid(args) {
    const { type, options } = args as { type: string; options: any };
    return generateMermaid({ type, options } as any);
  },
  async normalize_mermaid(args) {
    const { mermaid } = args as { mermaid: string };
    const normalized = normalizeMermaid(mermaid);
    const errors = validateMermaid(normalized);
    return JSON.stringify({ normalized, errors, hasErrors: errors.length > 0 });
  },
};

// ── JSON-RPC Request Handler ───────────────────────────────────────────

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  const result = await handler(args ?? {});
  return { content: [{ type: "text", text: result }] };
}

/**
 * Process a single JSON-RPC 2.0 request and return a response.
 */
async function handleJSONRPC(request: JSONRPCRequest): Promise<JSONRPCResponse> {
  const { method, params, id } = request;

  try {
    switch (method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "theforge-mcp", version: "0.1.0" },
          },
        };
      }

      case "notifications/initialized": {
        // No-op notification
        return {
          jsonrpc: "2.0",
          result: {},
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: TOOLS },
        };
      }

      case "tools/call": {
        const { name, arguments: args } = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        if (!name) {
          return { jsonrpc: "2.0", id, error: { code: -32602, message: "Missing tool name" } };
        }
        try {
          const toolResult = await handleToolCall(name, args ?? {});
          return { jsonrpc: "2.0", id, result: toolResult };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [{ type: "text", text: `Error: ${message}` }],
            },
          };
        }
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: `Internal error: ${message}` },
    };
  }
}

/**
 * Reads the full body from an IncomingMessage.
 */
async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

// ── Server Setup ───────────────────────────────────────────────────────

// ── Bootstrap ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.error(`[theforge-mcp] MCP server listo para recibir requests (auth por header MCP_M2M_SECRET)`);

  if (USE_HTTP) {
    // ── Plain HTTP Server with JSON-RPC 2.0 handling ──
    const { createServer, IncomingMessage, ServerResponse } = await import("node:http");
    const httpServer = createServer(async (req, res) => {
      // CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Session-ID, MCP_M2M_SECRET");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
      if (req.method === "GET" && (urlPath === "/health" || urlPath === "/health/")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "theforge-mcp" }));
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
        return;
      }

      // Read body
      const body = await readBody(req);

      // Auth: extraer MCP_M2M_SECRET del header del cliente
      const clientSecret = (req.headers["mcp_m2m_secret"] as string) || "";
      if (!clientSecret) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "MCP_M2M_SECRET header required — usa el secret de Settings en TheForge" },
            id: null,
          }),
        );
        return;
      }
      try {
        await login(clientSecret);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }),
        );
        return;
      }

      try {
        const json: JSONRPCRequest = JSON.parse(body);
        const response = await handleJSONRPC(json);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[theforge-mcp] Error parsing request: ${message}`);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: `Parse error: ${message}` },
          id: null,
        } as JSONRPCResponse));
      }
    });

    httpServer.listen(PORT, "0.0.0.0", () => {
      console.error(`[theforge-mcp] HTTP escuchando en 0.0.0.0:${PORT}`);
    });
  } else {
    // ── Stdio Transport (JSON-RPC 2.0 over stdin/stdout) ──
    const { randomUUID } = await import("node:crypto");
    console.error("[theforge-mcp] Iniciando en modo stdio");

    const readline = await import("node:readline");
    const rl = readline.createInterface({ input: process.stdin });

    rl.on("line", async (line) => {
      line = line.trim();
      if (!line) return;

      try {
        const request: JSONRPCRequest = JSON.parse(line);
        const response = await handleJSONRPC(request);
        // Only send a response if there's an id (notifications don't get responses)
        if (response.id !== undefined && response.id !== null) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[theforge-mcp] Stdio error: ${message}`);
        process.stderr.write(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: `Parse error: ${message}` },
          id: null,
        } as JSONRPCResponse) + "\n");
      }
    });
  }
}

main().catch((err) => {
  console.error("[theforge-mcp] Fatal:", err);
  process.exit(1);
});
