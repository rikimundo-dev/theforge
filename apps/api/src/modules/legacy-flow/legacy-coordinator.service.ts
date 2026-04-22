import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ComplexityLevel } from "@theforge/database";
import {
  DELIVERABLES_BY_COMPLEXITY,
  type DeliverableKind,
  type GenerateCodebaseDocRequest,
} from "@theforge/shared-types";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import type { TheForgeFileToModify } from "../theforge/theforge.service.js";
import { TheForgeService } from "../theforge/theforge.service.js";
import {
  DEFAULT_SEMANTIC_QUERIES,
  askCodebaseOptionsForCodebaseDoc,
  gatherLegacyIndexSignals,
  getLegacyAskCodebaseOptions,
  getLegacySemanticSearchLimit,
  isLegacyEvidenceFirstEnabled,
  clipLegacySemanticSection,
  clipLegacySemanticSectionForCodebaseDoc,
  legacyAnalyzerIndicatesEmptyIndex,
  legacyIndexHasUsableGraphEvidence,
} from "../theforge/theforge-evidence-context.util.js";
import { inferLegacyGraphNodeNameFromFunctionsFileText } from "./legacy-graph-node-name.util.js";
import { AgentSupervisorService } from "../agent-supervisor/agent-supervisor.service.js";
import { runLegacyStagedDiscoveryMddAgent } from "./legacy-staged-discovery-agent.js";
import { GraphMemoryService } from "../ai-analysis/graph-memory/graph-memory.service.js";
import { evaluateLegacyIndexSddGate } from "./legacy-index-sdd-alignment.util.js";
import { pickPrimaryStage } from "../projects/stage-helpers.js";
import { AiService } from "../ai/ai.service.js";
import { LegacyReviewerService } from "./legacy-reviewer.service.js";
import { loadLegacyKnowledgePack } from "./knowledge-loader.js";
import { cleanDocumentContent } from "../sessions/document-content.util.js";
import { UX_UI_GUIDE_PROMPT } from "../ai/prompts/ux-ui-guide-prompt.js";
import {
  isLegacyCodebaseDocMcpDebugUiEnabled,
  runWithMcpUiDebug,
  type McpUiDebugEntry,
} from "../theforge/mcp-ui-debug.context.js";
import { normalizeRawEvidenceJsonBlocksInMarkdown } from "../theforge/theforge-raw-evidence-markdown.js";

const KNOWLEDGE = loadLegacyKnowledgePack();

/** Modo clásico `generate-codebase-doc`: síntesis única si las 4 rondas `ask_codebase` vienen vacías (p. ej. timeout por serie secuencial). */
const CODEBASE_DOC_FALLBACK_SYNTHESIS_PROMPT =
  "Documenta el repositorio indexado en Ariadne (ámbito actual). Responde en **español** en markdown con subapartados claros: " +
  "**Propósito** del repo en el producto; **stack y tooling** (solo lo que inferas del índice: React, Vite, npm, etc.); " +
  "**Estructura de carpetas**; **pantallas o rutas principales**; **datos y API** — si en este repo no hay modelos/Prisma y el backend está en otro servicio, dilo explícitamente. " +
  "No inventes archivos ni endpoints. Mínimo unas 400 palabras. Si algo no consta en el índice, dilo.";

const CODEBASE_DOC_CLASSIC_Q = {
  q1:
    "List exhaustively: all data models, entities, tables and their fields; all API routes and services; main UI components and screens; configuration and env. This is for documentation generation — be thorough.",
  q2:
    "Describe architecture: folder structure, modules, how backend and frontend connect, existing patterns and conventions. Include file paths for key areas.",
  q3:
    "What is the EXACT tech stack and directory structure of this project? List only what exists in the codebase: backend runtime and framework (e.g. Node/Express, Node/NestJS, Python/Django), frontend framework (e.g. React, Vue), database, build tools. If the project has multiple repositories, list them and their main folders. Do NOT assume or invent; only state what the codebase contains.",
  q4:
    "What are the main business rules, validations, naming conventions, and key patterns used across the codebase? Include any domain-specific logic, constants, or shared utilities.",
} as const;

/** Prefacio cuando solo se pudo rellenar la §5 (grafo); las síntesis ask_codebase quedaron vacías. */
const CODEBASE_DOC_SEMANTIC_ONLY_PREFACE =
  "> **Por qué ves solo el índice semántico (§5):** en esta ejecución **`ask_codebase` no devolvió texto** para las secciones 1–4 ni para la síntesis de respaldo (suele ser **timeout** del MCP: sube `THEFORGE_MCP_TIMEOUT_MS` en el API, p. ej. `180000`–`300000`; revisa logs Nest/ingest o carga concurrente). El modo clásico usa **4× `ask_codebase` secuenciales** por defecto (`LEGACY_CODEBASE_DOC_PARALLEL_ASK=0`); si reactivas paralelo (`=1`), aumenta timeout. Lo que sigue **no es un resumen deliberado**: es la salida combinada de **`semantic_search`** por cada repo multi-root, con límite por query (`LEGACY_SEMANTIC_SEARCH_LIMIT`) y recorte global (`LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS`). En descubrimiento escalonado, `LEGACY_STAGED_DISCOVERY_SEMANTIC_FLOOR` evita `limit` demasiado bajo en herramientas. Activa `LEGACY_CODEBASE_DOC_MCP_DEBUG_UI` para ver las llamadas MCP o vuelve a generar cuando el orchestrator responda.";

/** Respuesta de `generate-codebase-doc` cuando el API tiene trazas MCP (debug UI). */
export type GenerateCodebaseDocResponse = { codebaseDoc: string; mcpDebugTrace?: McpUiDebugEntry[] };

export type LegacyIndexSddResolutionChoice = "trust_index" | "trust_sdd" | "proceed_with_warnings";

export interface LegacyFlowState {
  description?: string;
  /** Archivos a modificar; cada uno con path y repoId (multi-repo). Compatible con formato antiguo string[]. */
  filesToModify?: TheForgeFileToModify[] | string[];
  questions?: string[];
  /** Respuestas sugeridas por TheForge (codebase); el usuario puede editarlas */
  suggestedAnswers?: Record<string, string>;
  answers?: Record<string, string>;
  /** Documentación de partida del codebase (opcional, generada vía MCP antes del flujo de modificación). */
  codebaseDoc?: string;
  /** Tras 409 LEGACY_INDEX_SDD_MISMATCH: el usuario confirma cómo proceder (índice vs SDD). */
  legacyIndexSddResolution?: {
    choice: LegacyIndexSddResolutionChoice;
    resolvedAt: string;
  };
}

const COORDINATOR_SYSTEM =
  "Eres el coordinador del flujo legacy. Orquestas análisis del código (TheForge), preguntas al usuario y generación de documentos (MDD, SPEC, etc.). " +
  "Usa el conocimiento base para mantener coherencia y cascada specification-driven.\n\nConocimiento base:\n---\n" +
  KNOWLEDGE +
  "\n---";

function mddTheforgeContextMaxChars(): number {
  const n = parseInt(process.env.LEGACY_MDD_THEFORGE_CONTEXT_MAX_CHARS ?? "24000", 10);
  return Number.isFinite(n) && n > 0 ? n : 24000;
}

function envFlag(name: string, defaultTrue: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return defaultTrue;
  return !["0", "false", "off", "no"].includes(v);
}

/** Cruza índice Ariadne con Falkor SDD antes de LLM (default: activo). Desactivar: LEGACY_SDD_INDEX_GATE=0. */
function isLegacySddIndexGateEnabled(): boolean {
  return envFlag("LEGACY_SDD_INDEX_GATE", true);
}

/** Modo clásico doc. partida: 4× `ask_codebase` en paralelo (más riesgo de timeout en MCP). Default: secuencial. */
function isCodebaseDocClassicParallelAsk(): boolean {
  const v = process.env.LEGACY_CODEBASE_DOC_PARALLEL_ASK?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Extrae una cadena JSON de un texto que puede ser JSON directo o markdown con bloque de código.
 * @param text - Texto que puede contener JSON o ```json ... ```.
 * @returns Cadena JSON extraída.
 */
function extractJsonFromText(text: string): string {
  const t = text.trim();
  if (t.startsWith("[")) return t;
  if (t.startsWith("{")) return t;
  const jsonBlock = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  return jsonBlock ? jsonBlock[1].trim() : t;
}

/** Normaliza filesToModify del estado (puede ser string[] legacy) a TheForgeFileToModify[]. */
function normalizeFilesToModify(raw: LegacyFlowState["filesToModify"], defaultRepoId: string): TheForgeFileToModify[] {
  if (!raw?.length) return [];
  return raw.map((f) =>
    typeof f === "string" ? { path: f, repoId: defaultRepoId } : { path: f.path, repoId: f.repoId ?? "" },
  );
}

/**
 * Coordinador del flujo legacy: orquesta TheForge (archivos + preguntas), respuestas del usuario,
 * generación del MDD de cambio y cascada de entregables (SPEC → Arquitectura → … → Tasks).
 */
@Injectable()
export class LegacyCoordinatorService {
  private readonly logger = new Logger(LegacyCoordinatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly theforge: TheForgeService,
    private readonly ai: AiService,
    private readonly reviewer: LegacyReviewerService,
    private readonly graphMemory: GraphMemoryService,
    private readonly agentSupervisor: AgentSupervisorService,
  ) {}

  /**
   * Obtiene el proyecto y valida que sea legacy y tenga theforgeProjectId.
   * @param projectId - ID del proyecto en TheForge.
   * @returns Proyecto y theforgeId; lanza si no existe, no es LEGACY o no tiene theforgeProjectId.
   */
  private async getLegacyProject(projectId: string) {
    const project = await this.projects.findOne(projectId);
    const pt = (project as { projectType?: string }).projectType;
    if (pt !== "LEGACY") {
      throw new BadRequestException("El flujo legacy solo aplica a proyectos con projectType LEGACY.");
    }
    const theforgeId = (project as { theforgeProjectId?: string | null }).theforgeProjectId;
    if (!theforgeId?.trim()) {
      throw new BadRequestException("El proyecto legacy debe tener theforgeProjectId configurado.");
    }
    return { project, theforgeId };
  }

  private hasLegacyIndexSddResolution(state: LegacyFlowState): boolean {
    const r = state.legacyIndexSddResolution;
    return typeof r?.choice === "string" && typeof r?.resolvedAt === "string" && r.resolvedAt.length > 0;
  }

  /**
   * Consulta Falkor SDD (etapa) y cruza con señales del índice Ariadne; lanza 409 si hay discrepancia grave
   * y el usuario no ha resuelto en legacyFlowState.
   */
  private async assertLegacyIndexSddGate(
    projectId: string,
    theforgeId: string,
    legacyState: LegacyFlowState,
    options?: { semanticQueries?: readonly string[] },
  ): Promise<void> {
    if (!isLegacySddIndexGateEnabled()) return;
    if (this.hasLegacyIndexSddResolution(legacyState)) return;

    const row = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { stages: true },
    });
    const stageId = row?.stages?.length ? pickPrimaryStage(row.stages)?.id : undefined;
    if (!stageId?.trim()) return;

    const snapshot = await this.graphMemory.getSddStageSnapshot(projectId, stageId);
    if (!snapshot) return;

    const gathered = await gatherLegacyIndexSignals(this.theforge, theforgeId, {
      semanticQueries: options?.semanticQueries,
    });
    const hasUsable = legacyIndexHasUsableGraphEvidence(gathered.semanticChunks, gathered.chosenPaths);
    const indexBlobLower = [gathered.mergedSemantic, ...gathered.chosenPaths, ...gathered.semanticChunks]
      .join("\n")
      .toLowerCase();

    const gate = evaluateLegacyIndexSddGate(
      {
        semanticChunks: gathered.semanticChunks,
        chosenPaths: gathered.chosenPaths,
        indexBlobLower,
      },
      snapshot,
      hasUsable,
    );

    if (!gate.blocking) return;

    throw new ConflictException({
      code: "LEGACY_INDEX_SDD_MISMATCH",
      message: gate.summary,
      gate,
    });
  }

  /**
   * Genera documentación de partida del codebase vía MCP (opcional, ideal como primer paso).
   * Consulta exhaustivamente modelos, arquitectura, stack, reglas de negocio y convenciones.
   * @param projectId - ID del proyecto.
   * @returns Contenido Markdown de la documentación o null si TheForge no está configurado.
   */
  async generateCodebaseDoc(
    projectId: string,
    req?: GenerateCodebaseDocRequest,
  ): Promise<GenerateCodebaseDocResponse | null> {
    if (isLegacyCodebaseDocMcpDebugUiEnabled()) {
      const { result, trace } = await runWithMcpUiDebug(() => this.generateCodebaseDocCore(projectId, req));
      if (!result) return null;
      return { ...result, mcpDebugTrace: trace };
    }
    return this.generateCodebaseDocCore(projectId, req);
  }

  /** Generación de doc. partida (sin ALS de debug). */
  private async generateCodebaseDocCore(
    projectId: string,
    req?: GenerateCodebaseDocRequest,
  ): Promise<{ codebaseDoc: string } | null> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    if (!this.theforge.isConfigured()) return null;

    const legacyState =
      ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    await this.assertLegacyIndexSddGate(projectId, theforgeId, legacyState);

    let codebaseDoc = "";
    const codebaseDocAskOpts = askCodebaseOptionsForCodebaseDoc(req?.responseMode);

    if (isLegacyEvidenceFirstEnabled()) {
      try {
        const body = await runLegacyStagedDiscoveryMddAgent({
          theforge: this.theforge,
          projectId,
          theforgeProjectId: theforgeId,
          agentSupervisor: this.agentSupervisor,
          mode: "initial",
          askCodebaseOptions: codebaseDocAskOpts,
          logger: this.logger,
        });
        const trimmed = body.trim();
        if (trimmed && legacyAnalyzerIndicatesEmptyIndex(trimmed)) {
          this.logger.warn(
            `generateCodebaseDoc: descubrimiento escalonado devolvió «sin datos en índice» (evidencia insuficiente). ` +
              `No se persiste ese texto; se intenta modo clásico ask_codebase. theforgeId=${theforgeId} — confirma UUID/repo en Ariadne.`,
          );
        } else if (trimmed) {
          codebaseDoc = "# MDD inicial (Legacy) — documentación de partida\n\n" + trimmed;
        } else {
          this.logger.warn(
            `generateCodebaseDoc: descubrimiento escalonado devolvió vacío (sin texto tras herramientas). ` +
              `Siguiente paso: modo clásico ask_codebase. theforgeId=${theforgeId.slice(0, 8)}…`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `generateCodebaseDoc: descubrimiento escalonado falló, modo clásico. ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!codebaseDoc) {
      const parts: string[] = [];
      const semanticLim = getLegacySemanticSearchLimit();
      const legacyAsk = codebaseDocAskOpts;
      let r1: string;
      let r2: string;
      let r3: string;
      let r4: string;
      if (isCodebaseDocClassicParallelAsk()) {
        [r1, r2, r3, r4] = await Promise.all([
          this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q1, theforgeId, legacyAsk),
          this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q2, theforgeId, legacyAsk),
          this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q3, theforgeId, legacyAsk),
          this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q4, theforgeId, legacyAsk),
        ]);
      } else {
        r1 = await this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q1, theforgeId, legacyAsk);
        r2 = await this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q2, theforgeId, legacyAsk);
        r3 = await this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q3, theforgeId, legacyAsk);
        r4 = await this.theforge.askCodebase(CODEBASE_DOC_CLASSIC_Q.q4, theforgeId, legacyAsk);
      }
      if (r1.trim()) parts.push("## 1. Modelos, rutas y configuración\n\n" + r1.trim());
      if (r2.trim()) parts.push("## 2. Arquitectura y carpetas\n\n" + r2.trim());
      if (r3.trim()) parts.push("## 3. Stack y estructura\n\n" + r3.trim());
      if (r4.trim()) parts.push("## 4. Reglas de negocio y convenciones\n\n" + r4.trim());

      let synthesisFallback = "";
      if (!r1.trim() && !r2.trim() && !r3.trim() && !r4.trim()) {
        this.logger.warn(
          "generateCodebaseDoc: las cuatro rondas ask_codebase (clásico) vinieron vacías; síntesis única de respaldo (revisa THEFORGE_MCP_TIMEOUT_MS si persiste).",
        );
        const fb = await this.theforge.askCodebase(CODEBASE_DOC_FALLBACK_SYNTHESIS_PROMPT, theforgeId, legacyAsk);
        synthesisFallback = fb?.trim() ?? "";
        if (synthesisFallback) {
          parts.unshift("## 1–4. Panorama del codebase (síntesis)\n\n" + synthesisFallback);
        }
      }

      const hasAskProse =
        [r1, r2, r3, r4].some((x) => x.trim()) || synthesisFallback.length > 0;

      const [searchModels, searchApi, searchUi] = await Promise.all([
        this.theforge.semanticSearch("data models entities database schema tables", theforgeId, semanticLim),
        this.theforge.semanticSearch("API routes endpoints controllers services", theforgeId, semanticLim),
        this.theforge.semanticSearch("UI components screens pages views", theforgeId, semanticLim),
      ]);
      const searchParts: string[] = [];
      const clipSem = (chunk: string) => clipLegacySemanticSectionForCodebaseDoc(chunk);
      if (searchModels.trim()) {
        searchParts.push("Modelos/entidades (búsqueda semántica):\n" + clipSem(searchModels));
      }
      if (searchApi.trim()) searchParts.push("API/rutas (búsqueda semántica):\n" + clipSem(searchApi));
      if (searchUi.trim()) {
        searchParts.push("Componentes/pantallas (búsqueda semántica):\n" + clipSem(searchUi));
      }
      if (searchParts.length > 0) parts.push("## 5. Índice semántico del grafo\n\n" + searchParts.join("\n\n"));

      let docBody = parts.length > 0 ? parts.join("\n\n---\n\n") : "";
      if (docBody && !hasAskProse) {
        docBody = `${CODEBASE_DOC_SEMANTIC_ONLY_PREFACE}\n\n${docBody}`;
      }
      codebaseDoc = docBody.length > 0 ? "# Documentación del Codebase (partida)\n\n" + docBody : "";
    }

    if (codebaseDoc.trim()) {
      codebaseDoc = normalizeRawEvidenceJsonBlocksInMarkdown(codebaseDoc);
    }

    const state = ((await this.projects.findOne(projectId)) as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {};
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: { ...state, codebaseDoc } as object },
    });
    return { codebaseDoc };
  }

  /**
   * Tras un 409 LEGACY_INDEX_SDD_MISMATCH, el usuario elige cómo proceder (índice MCP vs SDD en Falkor).
   */
  async resolveIndexSddConflict(
    projectId: string,
    choice: LegacyIndexSddResolutionChoice,
  ): Promise<{ ok: boolean; legacyIndexSddResolution: LegacyFlowState["legacyIndexSddResolution"] }> {
    await this.getLegacyProject(projectId);
    const allowed: LegacyIndexSddResolutionChoice[] = ["trust_index", "trust_sdd", "proceed_with_warnings"];
    if (!allowed.includes(choice)) {
      throw new BadRequestException(`choice debe ser uno de: ${allowed.join(", ")}`);
    }
    const project = await this.projects.findOne(projectId);
    const state = ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    const legacyIndexSddResolution: LegacyFlowState["legacyIndexSddResolution"] = {
      choice,
      resolvedAt: new Date().toISOString(),
    };
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: { ...state, legacyIndexSddResolution } as object },
    });
    return { ok: true, legacyIndexSddResolution };
  }

  /**
   * Actualiza la documentación de partida del codebase (edición manual).
   * @param projectId - ID del proyecto.
   * @param codebaseDoc - Contenido Markdown.
   * @returns { codebaseDoc: string }.
   */
  async updateCodebaseDoc(projectId: string, codebaseDoc: string): Promise<{ codebaseDoc: string }> {
    await this.getLegacyProject(projectId);
    const state = ((await this.projects.findOne(projectId)) as { legacyFlowState?: LegacyFlowState | null })
      .legacyFlowState ?? {};
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: { ...state, codebaseDoc } as object },
    });
    return { codebaseDoc };
  }

  /**
   * Inicia el flujo legacy: consulta AriadneSpecs MCP (get_modification_plan o ask_codebase), obtiene archivos y preguntas,
   * pide sugerencias de respuestas al codebase y persiste todo en legacyFlowState.
   * @param projectId - ID del proyecto.
   * @param description - Descripción de la modificación que quiere el usuario.
   * @returns Lista de archivos a modificar, preguntas para afinar y respuestas sugeridas (opcional).
   */
  async start(projectId: string, description: string): Promise<{ filesToModify: TheForgeFileToModify[]; questions: string[]; suggestedAnswers?: Record<string, string> }> {
    const { theforgeId } = await this.getLegacyProject(projectId);
    const desc = (description ?? "").trim();
    if (!desc) throw new BadRequestException("description is required");

    let filesToModify: TheForgeFileToModify[] = [];
    let questions: string[] = [];

    const plan = await this.theforge.getModificationPlan(desc, theforgeId);
    if (plan) {
      filesToModify = plan.filesToModify;
      questions = plan.questionsToRefine;
    } else {
      // Fallback: cuando get_modification_plan no responde o devuelve error
      const question =
        `The user wants to make the following change to this codebase:\n\n"${desc}"\n\n` +
        `Analyze the ACTUAL indexed codebase (graph/files) for this project. Respond with a JSON object only: { "filesToModify": string[], "questions": string[] }.\n` +
        `- filesToModify: List ONLY real file paths that EXIST in this indexed project. Do NOT invent file names (e.g. no .java if the project has no Java).\n` +
        `- questions: ONLY business/functional clarifying questions. Do NOT ask "are there other components to consider?".`;
      const legacyAsk = getLegacyAskCodebaseOptions();
      const raw = await this.theforge.askCodebase(question, theforgeId, legacyAsk);
      if (raw.trim()) {
        try {
          const jsonStr = extractJsonFromText(raw);
          const parsed = JSON.parse(jsonStr) as { filesToModify?: unknown; questions?: unknown };
          const paths = Array.isArray(parsed?.filesToModify) ? parsed.filesToModify.filter((f) => typeof f === "string") : [];
          const defaultRepoId = await this.theforge.getDefaultRepoIdForStoredProject(theforgeId);
          filesToModify = paths.map((path) => ({ path: path as string, repoId: defaultRepoId }));
          questions = Array.isArray(parsed?.questions) ? parsed.questions.filter((q) => typeof q === "string") : [];
        } catch {
          questions = [raw.slice(0, 500)];
        }
      }
      questions = questions.filter((q) => !/otro(s)?\s+componente(s)?|componente(s)?\s+que\s+deba(n)?\s+considerar|other\s+component(s)?/i.test(q));
    }

    const reviewed = await this.reviewer.reviewStartResult(desc, filesToModify, questions);
    filesToModify = reviewed.filesToModify;
    questions = reviewed.questions;

    let suggestedAnswers: Record<string, string> = {};
    if (questions.length > 0) {
      const legacyAsk = getLegacyAskCodebaseOptions();
      const answerPrompt =
        `Change requested: "${desc.slice(0, 400)}"\n\n` +
        `Based ONLY on the codebase, answer these questions briefly (one short paragraph or bullet list per question). ` +
        `If the code does not contain the answer, use empty string for that key. ` +
        `Respond with a JSON object only, with string keys "0", "1", "2", ... (index of each question):\n\n` +
        questions.map((q, i) => `${i}. ${q}`).join("\n");
      const answerRaw = await this.theforge.askCodebase(answerPrompt, theforgeId, legacyAsk);
      if (answerRaw.trim()) {
        try {
          const answerStr = extractJsonFromText(answerRaw);
          const parsed = JSON.parse(answerStr) as Record<string, unknown>;
          for (let i = 0; i < questions.length; i++) {
            const v = parsed[String(i)];
            if (typeof v === "string" && v.trim()) suggestedAnswers[String(i)] = v.trim();
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    const state: LegacyFlowState = {
      description: desc,
      filesToModify,
      questions,
      suggestedAnswers: Object.keys(suggestedAnswers).length > 0 ? suggestedAnswers : undefined,
    };
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: state as object },
    });
    return { filesToModify, questions, suggestedAnswers: Object.keys(suggestedAnswers).length > 0 ? suggestedAnswers : undefined };
  }

  /**
   * Registra las respuestas del usuario a las preguntas del flujo. Persiste en legacyFlowState.answers.
   * @param projectId - ID del proyecto.
   * @param answers - Mapa índice de pregunta → respuesta (p. ej. { "0": "10", "1": "30" }).
   * @returns { ok: true } si se guardó correctamente.
   */
  async answer(projectId: string, answers: Record<string, string>): Promise<{ ok: boolean }> {
    const { project } = await this.getLegacyProject(projectId);
    const state = ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    const next: LegacyFlowState = { ...state, answers: answers && Object.keys(answers).length > 0 ? answers : undefined };
    await this.prisma.project.update({
      where: { id: projectId },
      data: { legacyFlowState: next as object },
    });
    return { ok: true };
  }

  /**
   * Genera el MDD de cambio a partir de la descripción, archivos, respuestas del usuario y contexto AriadneSpecs (múltiples ask_codebase).
   * Persiste el resultado en mddContent del proyecto.
   * @param projectId - ID del proyecto.
   * @returns Contenido Markdown del MDD generado.
   */
  async generateMdd(projectId: string): Promise<{ mddContent: string }> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const state = ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    const description = state.description ?? "";
    const files = normalizeFilesToModify(state.filesToModify, theforgeId);
    const answers = state.answers ?? {};
    const answersText = Object.entries(answers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const descTermsGate = description.slice(0, 160).replace(/[^\w\s]/g, " ").trim();
    const gateSemanticQueries =
      descTermsGate.length > 2
        ? [`${descTermsGate} modules services handlers components routes`, ...DEFAULT_SEMANTIC_QUERIES]
        : [...DEFAULT_SEMANTIC_QUERIES];
    await this.assertLegacyIndexSddGate(projectId, theforgeId, state, { semanticQueries: gateSemanticQueries });

    // Múltiples consultas a TheForge para contexto amplio (evidencia del índice + ask_codebase + refactor seguro)
    const theforgeParts: string[] = [];
    if (description && isLegacyEvidenceFirstEnabled()) {
      try {
        const changeEvidence = await runLegacyStagedDiscoveryMddAgent({
          theforge: this.theforge,
          projectId,
          theforgeProjectId: theforgeId,
          agentSupervisor: this.agentSupervisor,
          mode: "change",
          changeDescription: description,
          logger: this.logger,
        });
        if (changeEvidence.trim()) {
          theforgeParts.push(
            "Evidencia TheForge — descubrimiento escalonado (MDD AS-IS / foco cambio):\n\n" + changeEvidence.trim(),
          );
        }
      } catch (err) {
        this.logger.warn(
          `generateMdd: descubrimiento escalonado falló; se continúa sin ese bloque. ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (description) {
      const legacyAsk = getLegacyAskCodebaseOptions();
      // Búsqueda semántica con términos del cambio para descubrir archivos/símbolos relacionados
      const descTerms = description.slice(0, 200).replace(/[^\w\s]/g, " ");
      const searchRelated = await this.theforge.semanticSearch(descTerms, theforgeId, getLegacySemanticSearchLimit());
      if (searchRelated?.trim()) {
        theforgeParts.push("Código relacionado (búsqueda semántica):\n" + clipLegacySemanticSection(searchRelated.trim()));
      }

      const q1 = await this.theforge.askCodebase(
        `For this change: "${description.slice(0, 400)}". List what ALREADY EXISTS in the codebase: data models/entities (tables, fields), API endpoints or services, and UI screens or components that touch clients, discounts, prices, price lists, campaigns, or profitability. Be exhaustive.`,
        theforgeId,
        legacyAsk,
      );
      if (q1.trim()) theforgeParts.push("Existe en el codebase:\n" + q1.trim());
      const q2 = await this.theforge.askCodebase(
        `For the same change: "${description.slice(0, 400)}". What architecture patterns, module structure, and file organization does the app use in the areas affected? Which files import or depend on client, discount, or pricing logic?`,
        theforgeId,
        legacyAsk,
      );
      if (q2.trim()) theforgeParts.push("Arquitectura y dependencias:\n" + q2.trim());
      const q3 = await this.theforge.askCodebase(
        `Summarize any business rules, validations, or edge cases already implemented in the codebase for: clients, discounts, price lists, campaigns, or profitability. Include where they live (file or module).`,
        theforgeId,
        legacyAsk,
      );
      if (q3.trim()) theforgeParts.push("Reglas y edge cases existentes:\n" + q3.trim());
    }
    // Validación antes de editar (validate_before_edit = impacto + contrato); fallback a get_legacy_impact
    // + get_definitions (ubicación exacta); get_functions_in_file alimenta el nombre de nodo para el grafo
    for (let i = 0; i < Math.min(3, files.length); i++) {
      const f = files[i]!;
      const repoId = f.repoId || theforgeId;
      const funcs = await this.theforge.getFunctionsInFile(f.path, repoId, f.path);
      const nodeName = inferLegacyGraphNodeNameFromFunctionsFileText(funcs, f.path);
      const [impactBlock, defs] = await Promise.all([
        this.theforge.validateBeforeEdit(nodeName, repoId, f.path).then((b) => b || this.theforge.getLegacyImpact(nodeName, repoId, f.path)),
        this.theforge.getDefinitions(nodeName, repoId, f.path),
      ]);
      if (impactBlock?.trim()) theforgeParts.push(`Validación antes de editar "${f.path}" (nodo grafo: \`${nodeName}\`):\n` + impactBlock.trim());
      if (defs?.trim()) theforgeParts.push(`Definición de "${nodeName}" (archivo:líneas):\n` + defs.trim());
      if (funcs?.trim()) theforgeParts.push(`Funciones/componentes en ${f.path}:\n` + funcs.trim());
    }
    // Contenido de los primeros 2 archivos a modificar (get_file_content) para contexto exacto
    for (let i = 0; i < Math.min(2, files.length); i++) {
      const f = files[i]!;
      const content = await this.theforge.getFileContent(f.path, f.repoId || theforgeId, undefined, f.path);
      if (content.trim()) theforgeParts.push(`Contenido de ${f.path}:\n` + content.slice(0, 3000) + (content.length > 3000 ? "\n…" : ""));
    }
    const theforgeContext = theforgeParts.join("\n\n---\n\n");
    const filesLine = files.length > 0
      ? "Archivos a modificar (path" + (files.some((x) => x.repoId) ? ", repoId" : "") + "):\n" +
        files.map((f) => (f.repoId ? `${f.path} (repoId: ${f.repoId})` : f.path)).join("\n") + "\n\n"
      : "";
    const prompt =
      "Genera un documento MDD de cambio (Markdown) para un proyecto legacy. Según Specification-Driven Development, el MDD es la **Constitución del cambio** y debe tener **exactamente 7 secciones** en este orden: 1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, 4. Contratos de API, 5. Lógica y Edge Cases, 6. Seguridad, 7. Infraestructura. Aplica cada sección al **cambio** descrito (qué se modifica en contexto, stack, modelo, API, lógica, seguridad e infra).\n\n" +
      "**Prioridad:** Recupera y usa en su totalidad el conocimiento del codebase (TheForge) que se te proporciona antes de elaborar el documento. Usa TODO ese contexto; infiere todas las modificaciones necesarias en módulos, entidades, APIs y pantallas existentes que el cambio afecte; no te limites al requerimiento literal. El MDD debe reflejar el conocimiento real de la aplicación indexada (qué hay hoy y qué debe cambiar).\n\n" +
      "Descripción del cambio:\n---\n" +
      description +
      "\n---\n\n" +
      filesLine +
      (answersText ? "Respuestas del usuario:\n---\n" + answersText + "\n---\n\n" : "") +
      (theforgeContext
        ? "Contexto del codebase (TheForge) — incluye evidencia del índice, validaciones, definiciones exactas, funciones por archivo y búsqueda semántica. Usar TODO para inferir impacto completo. No inventes rutas ni APIs que no aparezcan en este contexto.\n---\n" +
          theforgeContext.slice(0, mddTheforgeContextMaxChars()) +
          "\n---"
        : "");
    const mddDraft = await this.ai.generateResponse(prompt, [], { systemPrompt: COORDINATOR_SYSTEM });
    const mddContent = await this.reviewer.reviewMdd(description, mddDraft?.trim() ?? "");
    const cleaned = cleanDocumentContent(mddContent);
    await this.projects.update(projectId, { mddContent: cleaned });
    return { mddContent: cleaned };
  }

  /**
   * Genera entregables según `Project.complexity` y `DELIVERABLES_BY_COMPLEXITY` (despacho dinámico).
   * Legacy inyecta contexto AriadneSpecs en cada llamada. No ejecuta generadores fuera de la lista (ahorra tokens).
   */
  async generateDeliverables(projectId: string): Promise<{ ok: boolean }> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!row) throw new NotFoundException("Project not found");
    if (row.complexityPending != null) {
      throw new BadRequestException(
        "Hay una propuesta de complejidad pendiente de confirmación. Confirma o rechaza en el Workshop antes de generar entregables.",
      );
    }

    const codebaseDoc = String((project as { legacyFlowState?: LegacyFlowState }).legacyFlowState?.codebaseDoc ?? "").trim();
    const mddContent = String(project.mddContent ?? "").trim();
    const mdd =
      mddContent || (codebaseDoc ? `[Ingeniería inversa: documento del codebase existente. Genera entregables que describan el sistema AS-IS.]\n\n${codebaseDoc}` : "");
    if (!mdd) throw new BadRequestException("Genera la documentación de partida (MDD Inicial) o el MDD de cambio antes de generar entregables.");

    const legacyState =
      ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    await this.assertLegacyIndexSddGate(projectId, theforgeId, legacyState);

    const theforgeContext = await this.theforge.getContextForDeliverables(theforgeId);
    const legacyOpts = theforgeContext ? { theforgeContext } : undefined;

    const update = async (data: Record<string, unknown>) => {
      await this.prisma.project.update({ where: { id: projectId }, data: data as object });
    };

    const load = async () => {
      const p = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!p) throw new NotFoundException("Project not found");
      return p;
    };

    let p = await load();
    const isReverseEngineering = !mddContent && !!codebaseDoc;
    const complexity = isReverseEngineering ? ComplexityLevel.HIGH : (row.complexity ?? ComplexityLevel.HIGH);
    const deliverablesToRun = DELIVERABLES_BY_COMPLEXITY[complexity];

    const ensureBlueprint = async (): Promise<string> => {
      let bp = String(p.blueprintContent ?? "").trim();
      if (bp.length > 48) return bp;
      bp = await this.ai.generateBlueprint(mdd, undefined, legacyOpts);
      await update({ blueprintContent: cleanDocumentContent(bp) });
      p = await load();
      return String(p.blueprintContent ?? "").trim();
    };

    const runStep = async (kind: DeliverableKind): Promise<void> => {
      switch (kind) {
        case "mdd_canonical":
          return;
        case "spec": {
          const specContent = await this.ai.generateSpec(mdd, null, "mdd", legacyOpts);
          await update({ specContent: cleanDocumentContent(specContent) });
          p = await load();
          return;
        }
        case "architecture": {
          const architectureContent = await this.ai.generateArchitecture(
            mdd,
            p.blueprintContent ?? undefined,
            legacyOpts,
          );
          await update({ architectureContent: cleanDocumentContent(architectureContent) });
          p = await load();
          return;
        }
        case "use_cases": {
          const useCasesContent = await this.ai.generateUseCases(mdd, p.specContent, legacyOpts);
          await update({ useCasesContent: cleanDocumentContent(useCasesContent) });
          p = await load();
          return;
        }
        case "blueprint": {
          const blueprintContent = await this.ai.generateBlueprint(mdd, undefined, legacyOpts);
          await update({ blueprintContent: cleanDocumentContent(blueprintContent) });
          p = await load();
          return;
        }
        case "api_contracts": {
          const bp = await ensureBlueprint();
          const apiContractsContent = await this.ai.generateApiContracts(mdd, bp, undefined, legacyOpts);
          await update({ apiContractsContent: cleanDocumentContent(apiContractsContent) });
          p = await load();
          return;
        }
        case "logic_flows": {
          const logicFlowsContent = await this.ai.generateLogicFlows(mdd, undefined, legacyOpts);
          await update({ logicFlowsContent: cleanDocumentContent(logicFlowsContent) });
          p = await load();
          return;
        }
        case "ux_ui_guide": {
          const bp = String(p.blueprintContent ?? "").trim() || (await ensureBlueprint());
          let uxPrompt =
            "Genera la Guía UX/UI en markdown según el system prompt. MDD:\n---\n" +
            mdd.slice(0, 8000) +
            "\n---\n\nBlueprint:\n---\n" +
            bp.slice(0, 4000) +
            "\n---";
          if (theforgeContext) {
            uxPrompt =
              "**Contexto del codebase (TheForge) — priorizar y usar antes de elaborar:**\n---\n" +
              theforgeContext.slice(0, mddTheforgeContextMaxChars()) +
              "\n---\n\n**Regla obligatoria (legacy):** No inventes nada. Apégate al MDD y únicamente al conocimiento del codebase (TheForge) proporcionado arriba.\n\n**Instrucción:** Usa TODO el conocimiento anterior para alinear la guía con lo que ya existe. A continuación, MDD y Blueprint.\n\n" +
              uxPrompt;
          }
          const uxUiGuideContent = await this.ai.generateResponse(uxPrompt, [], {
            systemPrompt: UX_UI_GUIDE_PROMPT,
            activeTab: "ux-ui-guide",
            projectTypeForUxGuide: "LEGACY",
          });
          const uxClean = (uxUiGuideContent ?? "").replace(/\n---FIN_UX_UI---.*/s, "").trim();
          await update({ uxUiGuideContent: cleanDocumentContent(uxClean) });
          p = await load();
          return;
        }
        case "user_stories": {
          const userStoriesContent = await this.ai.generateUserStories(
            mdd,
            p.specContent,
            p.useCasesContent,
            legacyOpts,
          );
          await update({ userStoriesContent: cleanDocumentContent(userStoriesContent) });
          p = await load();
          return;
        }
        case "tasks": {
          const bp = p.blueprintContent?.trim();
          const tasksContent = await this.ai.generateTasks(mdd, bp || undefined, legacyOpts);
          await update({ tasksContent: cleanDocumentContent(tasksContent) });
          p = await load();
          return;
        }
        case "infra": {
          const bp = await ensureBlueprint();
          const infraContent = await this.ai.generateInfra(mdd, bp, undefined, legacyOpts);
          await update({ infraContent: cleanDocumentContent(infraContent) });
          p = await load();
          return;
        }
        default: {
          const _exhaustive: never = kind;
          return _exhaustive;
        }
      }
    };

    for (const kind of deliverablesToRun) {
      await runStep(kind);
    }

    return { ok: true };
  }
}
