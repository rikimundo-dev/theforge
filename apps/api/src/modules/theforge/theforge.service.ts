import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  buildLegacyEvidenceMarkdown,
  clipLegacySemanticSection,
  DEFAULT_SEMANTIC_QUERIES,
  getLegacyAskCodebaseOptions,
  getLegacySemanticSearchLimit,
  isLegacyEvidenceFirstEnabled,
} from "./theforge-evidence-context.util.js";
import type { IOrchestratorTheForgePort } from "./theforge-service.port.js";
import { appendMcpUiDebug, isMcpUiDebugActive } from "./mcp-ui-debug.context.js";
import { TheForgeContextCacheService } from "./theforge-context-cache.service.js";
import { parseMcpResponse } from "./mcp-http.util.js";
import {
  mergeAriadneCodebaseScope,
  resolveAriadneCodebaseMcpTarget,
  type AriadneCodebaseResolution,
} from "./ariadne-mcp-scope.util.js";
import { formatRawEvidenceObjectToMarkdown } from "./theforge-raw-evidence-markdown.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { getRequestUserId } from "../../common/request-user.store.js";

/** Repo (root) dentro de un proyecto multi-repo. */
export interface TheForgeProjectRoot {
  id: string;
  name?: string;
  branch?: string;
}

export interface TheForgeProject {
  id: string;
  name: string;
  /** Repos del proyecto (multi-root). Cada root.id es válido como projectId en herramientas. */
  roots?: TheForgeProjectRoot[];
  /** @deprecated Usar roots[].id y roots[].name. Conservado para compatibilidad con respuestas MCP. */
  rootPath?: string;
  /** @deprecated Usar roots[].branch */
  branch?: string;
}

/** Un archivo a modificar con su repo (multi-repo). */
export interface TheForgeFileToModify {
  path: string;
  repoId: string;
}

/** Scope opcional para acotar multi-root (SPEC-MCP-001). */
export interface TheForgeScope {
  repoIds?: string[];
  includePathPrefixes?: string[];
  excludePathGlobs?: string[];
}

/** Opciones opcionales para get_modification_plan (SPEC-MCP-001). */
export interface GetModificationPlanOptions {
  scope?: TheForgeScope;
  currentFilePath?: string;
}

/** Opciones opcionales para ask_codebase (SPEC-MCP-001). */
export interface AskCodebaseOptions {
  scope?: TheForgeScope;
  twoPhase?: boolean;
  /**
   * Por defecto en `askCodebase`: **`raw_evidence`** + `deterministicRetriever: true` (retrieve determinista, Ariadne).
   * `evidence_first`: JSON MDD → markdown vía normalizador MDD. `default`: prosa/markdown clásico sin esos flags.
   */
  responseMode?: "default" | "evidence_first" | "raw_evidence";
  /**
   * Con `raw_evidence` (default): **true** salvo `false` explícito. Reenviado al MCP según SPEC Ariadne.
   */
  deterministicRetriever?: boolean;
  currentFilePath?: string;
}

/** Respuesta de get_modification_plan (SPEC-MCP-001): paths con repoId y preguntas de negocio. */
export interface TheForgeModificationPlan {
  filesToModify: TheForgeFileToModify[];
  questionsToRefine: string[];
}

/**
 * Extrae el JSON del contenido de una herramienta MCP: puede ser JSON directo o markdown con bloque ```json ... ```.
 * @param text - Texto devuelto por la herramienta (p. ej. result.content[].text).
 * @returns Cadena JSON extraída.
 */
function extractJsonFromToolContent(text: string): string {
  const t = text.trim();
  if (t.startsWith("[")) return t;
  if (t.startsWith("{")) return t;
  const jsonBlock = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  return jsonBlock ? jsonBlock[1].trim() : t;
}

/** Claves del JSON MDD que el ingest puede devolver con `ask_codebase` + `responseMode: evidence_first` (Ariadne mcp_server_specs). */
const MDD_EVIDENCE_JSON_KEYS = [
  "summary",
  "openapi_spec",
  "entities",
  "api_contracts",
  "business_logic",
  "infrastructure",
  "risk_report",
  "evidence_paths",
] as const;

const MDD_EVIDENCE_SECTION_TITLE: Record<(typeof MDD_EVIDENCE_JSON_KEYS)[number], string> = {
  summary: "Resumen",
  openapi_spec: "OpenAPI / especificación",
  entities: "Entidades y modelo de datos",
  api_contracts: "Contratos API",
  business_logic: "Lógica de negocio",
  infrastructure: "Infraestructura",
  risk_report: "Riesgos",
  evidence_paths: "Rutas de evidencia",
};

function mddEvidencePayloadHasContent(o: Record<string, unknown>): boolean {
  for (const k of MDD_EVIDENCE_JSON_KEYS) {
    const v = o[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim().length > 0) return true;
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0) return true;
  }
  return false;
}

function unwrapMddEvidenceJson(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;
  const nested = root.mddDocument;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    if (mddEvidencePayloadHasContent(n)) return n;
  }
  if (mddEvidencePayloadHasContent(root)) return root;
  return null;
}

function formatMddEvidenceSectionValue(key: (typeof MDD_EVIDENCE_JSON_KEYS)[number], v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) {
    if (key === "evidence_paths") {
      return v
        .map((x) => {
          const s = String(x).trim();
          return s ? `- \`${s.replace(/`/g, "\\`")}\`` : "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return v.map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n");
  }
  return "```json\n" + JSON.stringify(v, null, 2).slice(0, 16000) + "\n```";
}

/**
 * Convierte JSON MDD de `evidence_first` a markdown legible para Legacy Analyzer / prompts.
 * Si no es JSON MDD, devuelve el texto original.
 */
function normalizeAskCodebaseEvidenceFirstContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const jsonStr = extractJsonFromToolContent(trimmed);
    const parsed = JSON.parse(jsonStr) as unknown;
    const payload = unwrapMddEvidenceJson(parsed);
    if (!payload) return text;

    const parts: string[] = ["## Evidencia (MDD estructurado — ingest / LLM)\n"];
    for (const key of MDD_EVIDENCE_JSON_KEYS) {
      const body = formatMddEvidenceSectionValue(key, payload[key]);
      if (!body) continue;
      parts.push(`### ${MDD_EVIDENCE_SECTION_TITLE[key]}\n\n${body}`);
    }
    return parts.join("\n\n").trim();
  } catch {
    return text;
  }
}

/**
 * Convierte JSON típico de `responseMode: raw_evidence` (Ariadne ingest) a markdown legible para prompts Nest.
 * Si el cuerpo ya parece MDD `evidence_first`, reutiliza el normalizador MDD.
 */
function normalizeAskCodebaseRawEvidenceContent(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const mddTry = normalizeAskCodebaseEvidenceFirstContent(text);
  if (mddTry.startsWith("## Evidencia (MDD estructurado")) return mddTry;
  try {
    const jsonStr = extractJsonFromToolContent(trimmed);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return text;
    return formatRawEvidenceObjectToMarkdown(parsed);
  } catch {
    return text;
  }
}

function truncateForMcpDebug(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [DEBUG_MCP truncado, ${s.length} caracteres total; amplía DEBUG_MCP_MAX_RESPONSE_CHARS si hace falta]`;
}

function debugMcpRequestMaxChars(): number {
  const n = parseInt(process.env.DEBUG_MCP_MAX_REQUEST_CHARS ?? "65536", 10);
  return Number.isFinite(n) && n > 0 ? n : 65536;
}

function debugMcpResponseMaxChars(): number {
  const n = parseInt(process.env.DEBUG_MCP_MAX_RESPONSE_CHARS ?? "32768", 10);
  return Number.isFinite(n) && n > 0 ? n : 32768;
}

/**
 * Servicio de integración con el MCP TheForge (AriadneSpecs).
 * Expone listado de proyectos (multi-root), plan de modificación, ask_codebase y herramientas de refactor seguro (SPEC-MCP-001).
 * Requiere THEFORGE_MCP_URL para estar “configurado”; MCP_AUTH_TOKEN (o MCP_X_M2M_TOKEN) si el MCP exige auth.
 */
@Injectable()
export class TheForgeService implements OnModuleInit, IOrchestratorTheForgePort {
  private readonly logger = new Logger(TheForgeService.name);

  /** Cache de `list_known_projects` para resolver id proyecto ↔ roots sin un POST por cada tool call. */
  private projectsCatalogCache: { at: number; projects: TheForgeProject[] } | null = null;

  constructor(
    private readonly contextCache: TheForgeContextCacheService,
    private readonly prisma: PrismaService,
  ) {
  }

  onModuleInit(): void {
    // Refrescar config desde BD
    this.refreshAriadneConfig().catch(() => {});
    if (this.isConfigured()) return;
    this.logger.warn(
      "[TheForge] THEFORGE_MCP_URL vacío: MCP desactivado. Comprueba env dentro del contenedor theforge-api (env_file .env o variables del servicio en Dokploy; evita compose que fije la clave a string vacío).",
    );
  }

  private get baseUrl(): string {
    const url = process.env.THEFORGE_MCP_URL?.trim();
    if (url) return url;
    const legacyUrl = process.env.ARIADNE_MCP_URL?.trim();
    if (legacyUrl) return legacyUrl;
    return this.ariadneConfig?.url ?? "";
  }

  /** Cache en memoria del config de Ariadne (refrescado cada llamada por simplicidad). */
  private cachedAriadneConfig: { url: string; token: string } | null = null;

  private get ariadneConfig(): { url: string; token: string } | null {
    if (!this.prisma) return null;
    // Lectura lazy — se carga bajo demanda
    return this.cachedAriadneConfig;
  }

  /** Refresca la config desde BD */
  private async refreshAriadneConfig(): Promise<void> {
    try {
      const rows = await this.prisma.appConfig.findMany({
        where: { key: { in: ["ariadne_mcp_url", "ariadne_mcp_token"] } },
      });
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      this.cachedAriadneConfig = {
        url: map.ariadne_mcp_url ?? "",
        token: map.ariadne_mcp_token ?? "",
      };
    } catch {
      this.cachedAriadneConfig = null;
    }
  }

  /**
   * Timeout HTTP al **MCP externo de TheForge** (JSON-RPC). No confundir con un MCP servidor propio.
   * Herramientas rápidas (`semantic_search`, `get_file_content`, …): este valor.
   * @see docs/notebooklm/MCP-ARQUITECTURA-THEFORGE.md
   */
  private theforgeMcpTimeoutMs(): number {
    const n = parseInt(process.env.THEFORGE_MCP_TIMEOUT_MS ?? "60000", 10);
    return Number.isFinite(n) && n > 0 ? n : 60000;
  }

  /**
   * Timeout solo para **`tools/call` → `ask_codebase`** (ingest/orchestrator pueden tardar minutos).
   * `THEFORGE_MCP_ASK_CODEBASE_TIMEOUT_MS` explícito; si no, default **900000** (15 min) para no abortar
   * el cliente Nest mientras el MCP sigue vivo (`THEFORGE_MCP_TIMEOUT_MS` sigue valiendo para el resto).
   */
  private theforgeMcpAskCodebaseTimeoutMs(): number {
    const raw = process.env.THEFORGE_MCP_ASK_CODEBASE_TIMEOUT_MS?.trim();
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const fallback = 900000;
    return fallback;
  }

  /** `DEBUG_MCP=1` o `true`: loguea JSON-RPC enviado y respuesta cruda del MCP Ariadne (TheForge). */
  private isDebugMcp(): boolean {
    const v = process.env.DEBUG_MCP?.trim().toLowerCase();
    if (!v) return false;
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  /**
   * POST JSON-RPC al endpoint TheForge (MCP ajeno) con abort por timeout. Headers según Streamable HTTP + AriadneSpecs.
   * @param opts.timeoutMs — Override del abort (p. ej. `ask_codebase` largo).
   */
  private async postTheForgeMcp(body: object, opts?: { timeoutMs?: number }): Promise<Response> {
    const t0 = Date.now();
    const ctrl = new AbortController();
    const timeoutMs = opts?.timeoutMs ?? this.theforgeMcpTimeoutMs();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-03-26",
    };
    let resolvedUrl = this.baseUrl;
    // Obtener URL + token del usuario autenticado (cada usuario configura su propio MCP de Ariadne)
    try {
      const userId = getRequestUserId();
      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { ariadneMcpUrl: true, ariadneMcpToken: true },
        });
        if (user?.ariadneMcpToken) {
          headers["X-M2M-Token"] = user.ariadneMcpToken;
        }
        if (user?.ariadneMcpUrl?.trim()) {
          resolvedUrl = user.ariadneMcpUrl.trim();
        }
      }
    } catch {
      // Sin contexto de usuario (cron, background sin request) → usar fallback global
    }
    const hasAuth = !!headers["X-M2M-Token"];
    this.logger.log(`[TheForge] MCP POST ${resolvedUrl} | auth=${hasAuth ? "X-M2M-Token (user)" : "sin auth"}`);

    if (this.isDebugMcp()) {
      let reqStr: string;
      try {
        reqStr = JSON.stringify(body);
      } catch {
        reqStr = String(body);
      }
      this.logger.log(`[DEBUG_MCP] request (${reqStr.length} chars):\n${truncateForMcpDebug(reqStr, debugMcpRequestMaxChars())}`);
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        signal: ctrl.signal,
        headers,
        body: JSON.stringify(body),
      });

      if (isMcpUiDebugActive()) {
        try {
          const rawUi = await response.clone().text();
          const b = body as { method?: unknown; params?: { name?: unknown } };
          const rpcMethod = typeof b.method === "string" ? b.method : "unknown";
          const toolName = typeof b.params?.name === "string" ? b.params.name : undefined;
          let reqStr = "";
          try {
            reqStr = JSON.stringify(body);
          } catch {
            reqStr = String(body);
          }
          appendMcpUiDebug({
            at: new Date().toISOString(),
            rpcMethod,
            toolName,
            requestJson: truncateForMcpDebug(reqStr, 16000),
            responseHttpStatus: response.status,
            responseBodyPreview: truncateForMcpDebug(rawUi, 16000),
            durationMs: Date.now() - t0,
          });
        } catch {
          /* no bloquear flujo MCP */
        }
      }

      if (this.isDebugMcp()) {
        try {
          const raw = await response.clone().text();
          this.logger.log(
            `[DEBUG_MCP] response HTTP ${response.status} ${Date.now() - t0}ms (${raw.length} chars):\n${truncateForMcpDebug(raw, debugMcpResponseMaxChars())}`,
          );
        } catch (e) {
          this.logger.warn(`[DEBUG_MCP] no se pudo leer clone de respuesta: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      this.logger.debug(`[TheForge] MCP HTTP ${response.status} ${Date.now() - t0}ms`);
      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[TheForge] MCP fetch error after ${Date.now() - t0}ms: ${msg}`);
      throw err;
    } finally {
      clearTimeout(to);
    }
  }

  /** Llama a una herramienta MCP por nombre y argumentos; devuelve el text del result.content o null. */
  private async callToolInternal(toolName: string, args: Record<string, unknown>): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: `theforge-${toolName}-${Date.now()}`,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      });
      if (!response.ok) return null;
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
        error?: { message: string };
      } | null;
      if (!data || data.error) {
        if (data?.error) this.logger.warn(`[TheForge] ${toolName} error: ${data.error.message}`);
        return null;
      }
      if (data.result?.isError) {
        const errText = data.result?.content?.find((c) => c.type === "text")?.text;
        this.logger.warn(`[TheForge] ${toolName} tool error: ${errText ?? "(no message)"}`);
        return null;
      }
      const text = data.result?.content?.find((c) => c.type === "text")?.text ?? null;
      return typeof text === "string" ? text : null;
    } catch (err) {
      this.logger.error(`[TheForge] ${toolName} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Versión pública de callTool para servicios externos que no son TheForgeService. */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string | null> {
    return this.callToolInternal(toolName, args);
  }

  /** Obtiene el navigation map de un proyecto Ariadne (generate_navigation_map). */
  async fetchNavigationMap(theforgeId: string): Promise<string | null> {
    return this.callToolInternal("generate_navigation_map", {
      projectId: theforgeId,
      scope: "full",
    });
  }

  /**
   * Indica si el cliente TheForge está configurado.
   * @returns true si THEFORGE_MCP_URL está definido. El token es opcional (solo si el servidor MCP requiere auth).
   */
  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  private projectsCatalogCacheTtlMs(): number {
    const n = parseInt(process.env.THEFORGE_LIST_PROJECTS_CACHE_MS ?? "60000", 10);
    return Number.isFinite(n) && n >= 0 ? n : 60000;
  }

  /**
   * Catálogo MCP (con TTL) para mapear `theforgeProjectId` persistido → `roots[].id` + `scope.repoIds`.
   */
  private async getProjectsCatalog(): Promise<TheForgeProject[]> {
    if (!this.isConfigured()) return [];
    const ttl = this.projectsCatalogCacheTtlMs();
    const now = Date.now();
    if (ttl > 0 && this.projectsCatalogCache && now - this.projectsCatalogCache.at < ttl) {
      return this.projectsCatalogCache.projects;
    }
    const projects = await this.fetchListKnownProjectsFromMcp();
    this.projectsCatalogCache = { at: now, projects };
    return projects;
  }

  private async resolveStoredToMcp(storedTheforgeId: string): Promise<AriadneCodebaseResolution> {
    const catalog = await this.getProjectsCatalog();
    return resolveAriadneCodebaseMcpTarget(storedTheforgeId, catalog);
  }

  /**
   * Repo UUID para anclar paths cuando no hay `repoId` por archivo (p. ej. fallback JSON de `start`).
   * Con catálogo multi-root, evita usar el **workspace** `id` como `repoId` (no válido en Falkor por repo).
   */
  async getDefaultRepoIdForStoredProject(storedTheforgeId: string): Promise<string> {
    const raw = storedTheforgeId.trim();
    if (!this.isConfigured() || !raw) return raw;
    const ident = await this.resolveStoredToMcp(raw);
    const g = ident.graphProjectId.trim();
    const w = ident.workspaceProjectId.trim();
    return g || w || raw;
  }

  /**
   * Contexto amplio del codebase para generación de entregables (Blueprint, API, etc.).
   * Incluye modelos/rutas, arquitectura y stack + estructura real para no inventar plataformas.
   * @param projectId - ID de proyecto o repo en TheForge.
   */
  async getContextForDeliverables(projectId: string): Promise<string> {
    if (!this.isConfigured()) return "";
    const c4Block = await this.fetchC4ContextBlock(projectId);
    if (isLegacyEvidenceFirstEnabled()) {
      try {
        if (this.contextCache.isEnabled()) {
          const probeLimit = Math.min(48, getLegacySemanticSearchLimit());
          const probe = await this.semanticSearch(DEFAULT_SEMANTIC_QUERIES[0], projectId, probeLimit);
          const fp = this.contextCache.fingerprintFromSemanticSlice(projectId, probe);
          const key = this.contextCache.cacheKey(projectId, fp);
          const hit = this.contextCache.get(key);
          if (hit) {
            this.logger.log(`[TheForge] getContextForDeliverables: cache hit (${projectId.slice(0, 8)}…)`);
            return this.mergeC4WithDeliverableContext(c4Block, hit);
          }
          const built = await buildLegacyEvidenceMarkdown(this, projectId, { includeSynthesis: true });
          if (built.trim()) {
            this.contextCache.set(key, built);
            return this.mergeC4WithDeliverableContext(c4Block, built);
          }
        } else {
          const built = await buildLegacyEvidenceMarkdown(this, projectId, { includeSynthesis: true });
          if (built.trim()) return this.mergeC4WithDeliverableContext(c4Block, built);
        }
      } catch (err) {
        this.logger.warn(
          `[TheForge] getContextForDeliverables: evidencia-primero falló, modo clásico. ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const parts: string[] = [];
    const lim = getLegacySemanticSearchLimit();
    const legacyAsk = getLegacyAskCodebaseOptions();
    const [q1, q2, q3, searchModels, searchApi, searchUi] = await Promise.all([
      this.askCodebase(
        "List exhaustively: all data models, entities, tables and their fields; all API routes and services; main UI components and screens; configuration and env. This is for documentation generation — be thorough.",
        projectId,
        legacyAsk,
      ),
      this.askCodebase(
        "Describe architecture: folder structure, modules, how backend and frontend connect, existing patterns and conventions. Include file paths for key areas.",
        projectId,
        legacyAsk,
      ),
      this.askCodebase(
        "What is the EXACT tech stack and directory structure of this project? List only what exists in the codebase: backend runtime and framework (e.g. Node/Express, Node/NestJS, Python/Django), frontend framework (e.g. React, Vue), database, build tools. If the project has multiple repositories, list them and their main folders. Do NOT assume or invent; only state what the codebase contains.",
        projectId,
        legacyAsk,
      ),
      this.semanticSearch("data models entities database schema", projectId, lim),
      this.semanticSearch("API routes endpoints controllers", projectId, lim),
      this.semanticSearch("UI components screens pages", projectId, lim),
    ]);
    if (q1.trim()) parts.push("Modelos, rutas y configuración:\n" + q1.trim());
    if (q2.trim()) parts.push("Arquitectura y carpetas:\n" + q2.trim());
    if (q3.trim()) parts.push("Stack y estructura real (solo lo que existe):\n" + q3.trim());
    const searchParts: string[] = [];
    if (searchModels.trim()) searchParts.push("Búsqueda semántica modelos: " + clipLegacySemanticSection(searchModels.trim()));
    if (searchApi.trim()) searchParts.push("Búsqueda semántica API: " + clipLegacySemanticSection(searchApi.trim()));
    if (searchUi.trim()) searchParts.push("Búsqueda semántica UI: " + clipLegacySemanticSection(searchUi.trim()));
    if (searchParts.length > 0) parts.push("Índice semántico:\n" + searchParts.join("\n"));
    return this.mergeC4WithDeliverableContext(c4Block, parts.join("\n\n---\n\n"));
  }

  /**
   * Modelo C4 agregado (MCP `get_c4_model` → API Nest GraphService). Requiere JWT Nest en el **proceso** MCP, no en el cliente The Forge.
   */
  async getC4Model(projectId: string): Promise<string> {
    if (!this.isConfigured()) return "";
    const ident = await this.resolveStoredToMcp(projectId);
    /** C4 agregado a nivel proyecto (GraphService); alinear con `ask_codebase` → `workspaceProjectId`, no solo un shard/repo. */
    const out = await this.callToolInternal("get_c4_model", { projectId: ident.workspaceProjectId });
    return (out ?? "").trim();
  }

  private isC4ContextEnabled(): boolean {
    const v = process.env.LEGACY_C4_CONTEXT?.trim().toLowerCase();
    if (v === undefined || v === "") return true;
    return !["0", "false", "off", "no"].includes(v);
  }

  private c4ContextMaxChars(): number {
    const n = parseInt(process.env.LEGACY_C4_MAX_CHARS ?? "5000", 10);
    return Number.isFinite(n) && n > 0 ? n : 5000;
  }

  private async fetchC4ContextBlock(projectId: string): Promise<string> {
    if (!this.isC4ContextEnabled()) return "";
    try {
      const raw = await this.getC4Model(projectId);
      return raw;
    } catch (err) {
      this.logger.warn(
        `[TheForge] get_c4_model omitido: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "";
    }
  }

  /** Antepone C4 al contexto de entregables (Blueprint); prioridad ante el recorte global del prompt. */
  private mergeC4WithDeliverableContext(c4Markdown: string, rest: string): string {
    const c4 = (c4Markdown ?? "").trim();
    if (!c4) return rest;
    const max = this.c4ContextMaxChars();
    const clipped =
      c4.length > max ? c4.slice(0, max) + "\n… [recortado por LEGACY_C4_MAX_CHARS]" : c4;
    return (
      "## Modelo C4 (sistemas, contenedores, comunicación)\n\n" +
      "_Fuente: índice Ariadne / GraphService (`get_c4_model`). Usa como verdad de contenedores y relaciones `COMMUNICATES_WITH` entre sistemas._\n\n" +
      clipped +
      "\n\n---\n\n" +
      rest
    );
  }

  /**
   * Lista los proyectos indexados en TheForge (herramienta MCP list_known_projects).
   * Usa caché en memoria (TTL `THEFORGE_LIST_PROJECTS_CACHE_MS`, default 60000 ms; `0` = sin caché).
   */
  async listKnownProjects(): Promise<TheForgeProject[]> {
    if (!this.isConfigured()) {
      this.logger.warn("[TheForge] listKnownProjects: no configurado (THEFORGE_MCP_URL vacío)");
      return [];
    }
    this.logger.log(`[TheForge] listKnownProjects → getProjectsCatalog (${this.baseUrl})`);
    return this.getProjectsCatalog();
  }

  private async fetchListKnownProjectsFromMcp(): Promise<TheForgeProject[]> {
    this.logger.log(`[TheForge] fetchListKnownProjectsFromMcp: POST ${this.baseUrl}`);
    try {
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: "list-projects-1",
        method: "tools/call",
        params: {
          name: "list_known_projects",
          arguments: {},
        },
      });
      this.logger.log(`[TheForge] listKnownProjects: respuesta HTTP ${response.status} ${response.statusText}`);
      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`[TheForge] listKnownProjects: body=${body.slice(0, 500)}`);
        return [];
      }
      const raw = await response.text();
      this.logger.log(`[TheForge] listKnownProjects: raw response (first 2000 chars): ${raw.slice(0, 2000)}`);
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
        error?: { message: string };
      };
      this.logger.log(`[TheForge] listKnownProjects: parsed data keys=${data ? Object.keys(data as object).join(",") : "null"}, hasResult=${!!data?.result}, hasError=${!!(data as { error?: unknown })?.error}`);
      if (!data) {
        this.logger.warn("[TheForge] listKnownProjects: no se pudo extraer JSON de la respuesta");
        return [];
      }
      if (data.error) {
        this.logger.warn(`[TheForge] listKnownProjects: MCP error=${data.error.message}`);
        return [];
      }
      if (data.result?.isError) {
        const errText = data.result?.content?.find((c) => c.type === "text")?.text;
        this.logger.warn(`[TheForge] listKnownProjects: tool error: ${errText ?? "(no message)"}`);
        return [];
      }
      const content = data.result?.content;
      this.logger.log(`[TheForge] listKnownProjects: result.content length=${content?.length ?? 0}, items=${content?.map((c) => c.type).join(",") ?? "none"}`);
      if (!content?.length) {
        this.logger.log("[TheForge] listKnownProjects: result.content vacío o ausente");
        return [];
      }
      const text = content.find((c) => c.type === "text")?.text;
      this.logger.log(`[TheForge] listKnownProjects: text length=${text?.length ?? 0}, preview=${(text ?? "").slice(0, 500)}`);
      if (!text) {
        this.logger.log("[TheForge] listKnownProjects: no hay content type=text en result");
        return [];
      }
      const jsonStr = extractJsonFromToolContent(text);
      this.logger.log(`[TheForge] listKnownProjects: extracted JSON (full): ${jsonStr}`);
      const parsed = JSON.parse(jsonStr) as unknown;
      if (!Array.isArray(parsed)) {
        this.logger.warn(`[TheForge] listKnownProjects: respuesta no es array (typeof=${typeof parsed}), preview=${String(parsed).slice(0, 200)}`);
        return [];
      }
      this.logger.log(`[TheForge] listKnownProjects: parsed array length=${parsed.length}, each item keys: ${parsed.map((p: unknown) => (p != null && typeof p === "object" ? Object.keys(p as object).join(",") : "?")).join(" | ")}`);
      const projects: TheForgeProject[] = parsed
        .filter((p): p is Record<string, unknown> => p != null && typeof p === "object" && typeof (p as { id?: unknown }).id === "string" && typeof (p as { name?: unknown }).name === "string")
        .map((p) => {
          const roots = (p as { roots?: unknown }).roots;
          const arr = Array.isArray(roots)
            ? roots
              .filter((r): r is TheForgeProjectRoot => r != null && typeof r === "object" && typeof (r as { id?: unknown }).id === "string")
              .map((r) => ({ id: (r as { id: string }).id, name: (r as { name?: string }).name, branch: (r as { branch?: string }).branch }))
            : undefined;
          return {
            id: p.id as string,
            name: p.name as string,
            roots: arr?.length ? arr : undefined,
            rootPath: (p as { rootPath?: string }).rootPath,
            branch: (p as { branch?: string }).branch,
          } as TheForgeProject;
        });
      this.logger.log(`[TheForge] listKnownProjects: OK, ${projects.length} proyecto(s). Full payload: ${JSON.stringify(projects)}`);
      return projects;
    } catch (err) {
      this.logger.error(`[TheForge] listKnownProjects failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Obtiene el plan de modificación basado solo en el grafo (herramienta MCP get_modification_plan).
   * Garantiza filesToModify = rutas reales del proyecto; questionsToRefine = solo preguntas de negocio.
   * @param userDescription - Descripción de la modificación que quiere el usuario.
   * @param projectId - `theforgeProjectId` guardado (id de proyecto Ariadne o `roots[].id`); se normaliza vía `list_known_projects`.
   * @param opts - scope (repoIds, …), currentFilePath (SPEC-MCP-001). El scope se fusiona con el derivado del catálogo multi-root.
   */
  async getModificationPlan(
    userDescription: string,
    projectId: string,
    opts?: GetModificationPlanOptions,
  ): Promise<TheForgeModificationPlan | null> {
    if (!this.isConfigured()) return null;
    try {
      const ident = await this.resolveStoredToMcp(projectId);
      const scope = mergeAriadneCodebaseScope(ident.scopeForScopedTools, opts?.scope);
      const args: Record<string, unknown> = {
        userDescription: userDescription.trim(),
        projectId: ident.workspaceProjectId,
      };
      if (opts?.currentFilePath?.trim()) args.currentFilePath = opts.currentFilePath.trim();
      if (scope && Object.keys(scope).length > 0) args.scope = scope;
      const response = await this.postTheForgeMcp({
        jsonrpc: "2.0",
        id: "get-modification-plan-1",
        method: "tools/call",
        params: { name: "get_modification_plan", arguments: args },
      });
      if (!response.ok) return null;
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
        error?: { message: string };
      } | null;
      if (!data || data.error) {
        if (data?.error) this.logger.warn(`[TheForge] get_modification_plan error: ${data.error.message}`);
        return null;
      }
      if (data.result?.isError) {
        const errText = data.result?.content?.find((c) => c.type === "text")?.text;
        this.logger.warn(`[TheForge] get_modification_plan tool error: ${errText ?? "(no message)"}`);
        return null;
      }
      const text = data.result?.content?.find((c) => c.type === "text")?.text ?? "";
      if (!text || typeof text !== "string") return null;
      const jsonStr = extractJsonFromToolContent(text);
      const parsed = JSON.parse(jsonStr) as { filesToModify?: unknown; questionsToRefine?: unknown };
      const rawFiles = Array.isArray(parsed?.filesToModify) ? parsed.filesToModify : [];
      const filesToModify: TheForgeFileToModify[] = rawFiles.map((f) => {
        if (typeof f === "object" && f != null && typeof (f as { path?: unknown }).path === "string") {
          const o = f as { path: string; repoId?: string };
          return { path: o.path, repoId: typeof o.repoId === "string" ? o.repoId : "" };
        }
        return { path: String(f), repoId: "" };
      }).filter((f) => f.path.length > 0);
      const questionsToRefine = Array.isArray(parsed?.questionsToRefine) ? parsed.questionsToRefine.filter((q) => typeof q === "string") : [];
      return { filesToModify, questionsToRefine };
    } catch (err) {
      this.logger.error(`[TheForge] getModificationPlan failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Realiza una pregunta en lenguaje natural sobre el código indexado (herramienta MCP ask_codebase).
   * @param question - Pregunta en texto libre sobre el codebase.
   * @param projectId - `theforgeProjectId` persistido; `projectId` MCP = **workspace** Ariadne; `scope.repoIds` = todos los roots del proyecto si hay catálogo (ver `resolveAriadneCodebaseMcpTarget`).
   * @param opts - scope, twoPhase, currentFilePath (SPEC-MCP-001).
   * @returns Respuesta de texto del MCP o cadena vacía si falla.
   */
  async askCodebase(question: string, projectId: string, opts?: AskCodebaseOptions): Promise<string> {
    if (!this.isConfigured()) return "";
    try {
      /** Defaults Ariadne: retrieve determinista + JSON evidencia (SPEC `ask_codebase`). Override con `opts`. */
      const merged: AskCodebaseOptions = {
        twoPhase: true,
        responseMode: "raw_evidence",
        deterministicRetriever: true,
        ...opts,
      };
      const ident = await this.resolveStoredToMcp(projectId);
      const scope = mergeAriadneCodebaseScope(ident.scopeForScopedTools, merged.scope);
      const args: Record<string, unknown> = {
        question,
        projectId: ident.workspaceProjectId,
        twoPhase: merged.twoPhase ?? true,
      };
      if (merged.currentFilePath?.trim()) args.currentFilePath = merged.currentFilePath.trim();
      if (scope && Object.keys(scope).length > 0) args.scope = scope;
      if (merged.responseMode && merged.responseMode !== "default") {
        args.responseMode = merged.responseMode;
      }
      if (merged.responseMode === "raw_evidence" && merged.deterministicRetriever !== false) {
        args.deterministicRetriever = true;
      }
      const response = await this.postTheForgeMcp(
        {
          jsonrpc: "2.0",
          id: "ask-codebase-1",
          method: "tools/call",
          params: { name: "ask_codebase", arguments: args },
        },
        { timeoutMs: this.theforgeMcpAskCodebaseTimeoutMs() },
      );
      if (!response.ok) return "";
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
        error?: { message: string };
      } | null;
      if (!data || data.error) {
        if (data?.error) this.logger.warn(`TheForge ask_codebase error: ${data.error.message}`);
        return "";
      }
      if (data.result?.isError) {
        const errText = data.result?.content?.find((c) => c.type === "text")?.text;
        this.logger.warn(`TheForge ask_codebase tool error: ${errText ?? "(no message)"}`);
        return "";
      }
      let text = data.result?.content?.find((c) => c.type === "text")?.text ?? "";
      if (typeof text !== "string") return "";
      if (merged.responseMode === "evidence_first") {
        text = normalizeAskCodebaseEvidenceFirstContent(text);
      } else if (merged.responseMode === "raw_evidence") {
        text = normalizeAskCodebaseRawEvidenceContent(text);
      }
      return text;
    } catch (err) {
      this.logger.error(`TheForge askCodebase failed: ${err instanceof Error ? err.message : String(err)}`);
      return "";
    }
  }

  /**
   * Documentación legacy de partida — modo único MCP (`generate_legacy_documentation`).
   * Evidencia MDD determinista desde Falkor (sin los 4 modos ask_codebase + síntesis Nest).
   */
  async generateLegacyDocumentation(
    projectId: string,
    opts?: Pick<AskCodebaseOptions, "scope" | "currentFilePath">,
  ): Promise<string> {
    if (!this.isConfigured()) return "";
    try {
      const ident = await this.resolveStoredToMcp(projectId);
      const scope = mergeAriadneCodebaseScope(ident.scopeForScopedTools, opts?.scope);
      const args: Record<string, unknown> = { projectId: ident.workspaceProjectId };
      if (opts?.currentFilePath?.trim()) args.currentFilePath = opts.currentFilePath.trim();
      if (scope && Object.keys(scope).length > 0) args.scope = scope;
      const response = await this.postTheForgeMcp(
        {
          jsonrpc: "2.0",
          id: "generate-legacy-doc-1",
          method: "tools/call",
          params: { name: "generate_legacy_documentation", arguments: args },
        },
        { timeoutMs: this.theforgeMcpAskCodebaseTimeoutMs() },
      );
      if (!response.ok) return "";
      const raw = await response.text();
      const data = parseMcpResponse(raw) as {
        result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
        error?: { message: string };
      } | null;
      if (!data || data.error || data.result?.isError) return "";
      const text = data.result?.content?.find((c) => c.type === "text")?.text ?? "";
      if (!text.trim()) return "";
      try {
        const jsonStr = extractJsonFromToolContent(text.trim());
        const envelope = JSON.parse(jsonStr) as {
          format?: string;
          answer?: string;
          mddDocument?: unknown;
        };
        if (envelope.format === "legacy_mdd_v1" && typeof envelope.answer === "string") {
          return normalizeAskCodebaseEvidenceFirstContent(envelope.answer);
        }
      } catch {
        /* fall through */
      }
      return normalizeAskCodebaseEvidenceFirstContent(text);
    } catch (err) {
      this.logger.error(
        `TheForge generateLegacyDocumentation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "";
    }
  }

  /**
   * Extrae tokens de diseño del codebase (herramienta MCP extract_design_tokens).
   * @param projectId - `theforgeProjectId` persistido.
   * @returns JSON con tokens de diseño (tailwindTokens, cssTokens, etc.) o string vacío si falla.
   */
  async extractDesignTokens(projectId: string): Promise<string> {
    if (!this.isConfigured()) return "";
    try {
      const ident = await this.resolveStoredToMcp(projectId);
      const args: Record<string, unknown> = { projectId: ident.graphProjectId };
      const out = await this.callToolInternal("extract_design_tokens", args);
      return out ?? "";
    } catch (err) {
      this.logger.error(`[TheForge] extractDesignTokens failed: ${err instanceof Error ? err.message : String(err)}`);
      return "";
    }
  }

  /**
   * Obtiene el contenido de un archivo del repo/proyecto (herramienta MCP get_file_content).
   * `projectId` se normaliza al id de repo indexado cuando el valor guardado es el id de workspace Ariadne.
   */
  async getFileContent(
    path: string,
    projectId: string,
    ref?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const ident = await this.resolveStoredToMcp(projectId);
    const args: Record<string, unknown> = { path: path.trim(), projectId: ident.graphProjectId };
    if (ref?.trim()) args.ref = ref.trim();
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_file_content", args);
    return out ?? "";
  }

  /**
   * Analiza qué se rompería si se modifica un nodo (herramienta MCP get_legacy_impact).
   * Útil para incluir impacto en el contexto del MDD de cambio.
   */
  async getLegacyImpact(
    nodeName: string,
    projectId: string,
    currentFilePath?: string,
  ): Promise<string> {
    const ident = await this.resolveStoredToMcp(projectId);
    const args: Record<string, unknown> = { nodeName: nodeName.trim(), projectId: ident.graphProjectId };
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_legacy_impact", args);
    return out ?? "";
  }

  /**
   * Validación obligatoria antes de editar (herramienta MCP validate_before_edit).
   * Devuelve impacto + contrato en un solo llamado. Usar antes de modificar un nodo/archivo.
   * @returns Texto con impacto y contrato, o vacío si la herramienta no está disponible.
   */
  async validateBeforeEdit(nodeName: string, projectId: string, currentFilePath?: string): Promise<string> {
    const ident = await this.resolveStoredToMcp(projectId);
    const args: Record<string, unknown> = { nodeName: nodeName.trim(), projectId: ident.graphProjectId };
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("validate_before_edit", args);
    return out ?? "";
  }

  /**
   * Extrae props y firma de un componente (herramienta MCP get_contract_specs).
   * Para que el MDD/código respete la estructura existente.
   */
  async getContractSpecs(
    componentName: string,
    projectId?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { componentName: componentName.trim() };
    if (projectId?.trim()) {
      const ident = await this.resolveStoredToMcp(projectId.trim());
      args.projectId = ident.graphProjectId;
    }
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_contract_specs", args);
    return out ?? "";
  }

  /**
   * Recopila contratos de API reales desde el MCP de Ariadne para la generación del documento de Contratos de API.
   * 1. Busca en el grafo (semantic_search) controladores, rutas y servicios
   * 2. Extrae nombres de nodos con patrones de identificadores reales
   * 3. Para cada nombre válido, llama a get_contract_specs
   * 4. Devuelve markdown con la evidencia o fallback a búsqueda semántica
   */
  async gatherContractSpecsForApi(projectId: string): Promise<string> {
    if (!this.isConfigured()) return "";
    try {
      // Paso 1: Buscar controladores, rutas y servicios en el grafo
      const [searchControllers, searchRoutes, searchAPIs] = await Promise.all([
        this.semanticSearch("controllers handlers routes services endpoints", projectId, 10),
        this.semanticSearch("API routes REST endpoints controllers express nestjs", projectId, 10),
        this.semanticSearch("components services interfaces types", projectId, 10),
      ]);

      const allSearchResults = [
        searchControllers?.trim() || "",
        searchRoutes?.trim() || "",
        searchAPIs?.trim() || "",
      ].filter(Boolean).join("\n\n---\n\n");

      if (!allSearchResults) return "";

      // Paso 2: Extraer nombres válidos de componentes del texto de búsqueda semántica
      // Los nombres reales en el grafo suelen ser PascalCase (clases) o camelCase (funciones)
      const names = new Set<string>();

      // Patrón 1: Nombres PascalCase con sufijos conocidos (clases/componentes/controladores/screens, etc.)
      const pascalMatches = allSearchResults.match(/\b[A-Z][a-zA-Z0-9]+(?:Controller|Service|Handler|Component|Route|Resource|Api|Helper|Util|Manager|Factory|Adapter|Provider|Module|Guard|Interceptor|Pipe|Filter|Middleware|Resolver|Directive|Screen|Page|View|Layout|Widget|Form|Modal|Card|List|Table|Button|Input|Select|Dropdown|Menu|Nav|Header|Footer|Section|Container|Wrapper|Provider|Context|Hook|Store|Action|Reducer|Selector|Thunk|Saga|Endpoint|Client|Server|Config|Plugin|Extension)\b/g);
      if (pascalMatches) pascalMatches.forEach(n => names.add(n));

      // Patrón 2: Nombres PascalCase genéricos (2+ palabras mayúsculas) — ej: UserProfile, OrderDetails
      const genericPascal = allSearchResults.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g);
      if (genericPascal) genericPascal.forEach(n => { if (n.length >= 4 && n.length <= 60) names.add(n); });

      // Tomar máximo 5 nombres, priorizando los que tienen sufijos conocidos
      const sortedNames = [...names].sort((a, b) => {
        const aScore = /(?:Controller|Service|Handler|Component|Route|Api|Resource|Module|Resolver|Screen|Page|View)$/.test(a) ? 1 : 0;
        const bScore = /(?:Controller|Service|Handler|Component|Route|Api|Resource|Module|Resolver|Screen|Page|View)$/.test(b) ? 1 : 0;
        return bScore - aScore;
      });
      const topNames = sortedNames.slice(0, 5);

      if (topNames.length === 0) {
        // Fallback: devolver la búsqueda semántica como contexto útil
        return `## Rutas y componentes identificados en el codebase\n\n${allSearchResults.slice(0, 6000)}`;
      }

      // Paso 3: Obtener contract specs para los nombres encontrados
      const parts: string[] = [];
      for (const name of topNames) {
        try {
          const specs = await this.getContractSpecs(name, projectId);
          if (specs?.trim()) {
            parts.push(`### \`${name}\` (get_contract_specs)\n\n${specs.trim()}`);
          }
        } catch {
          // Si falla para un componente, continuamos con el siguiente
        }
      }

      if (parts.length === 0) {
        // Fallback: devolver la búsqueda semántica como contexto
        return `## Rutas y componentes identificados en el codebase\n\n${allSearchResults.slice(0, 6000)}`;
      }

      return parts.join("\n\n---\n\n");
    } catch (err) {
      this.logger.warn(`[TheForge] gatherContractSpecsForApi falló: ${err instanceof Error ? err.message : String(err)}`);
      return "";
    }
  }

  /**
   * Firma, tipos y endpoints asociados a un símbolo (herramienta MCP get_implementation_details).
   * Preferible a búsqueda semántica genérica cuando ya conoces el nombre del símbolo en el índice.
   */
  async getImplementationDetails(
    symbolName: string,
    projectId?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { symbolName: symbolName.trim() };
    if (projectId?.trim()) {
      const ident = await this.resolveStoredToMcp(projectId.trim());
      args.projectId = ident.graphProjectId;
    }
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_implementation_details", args);
    return out ?? "";
  }

  /**
   * Recupera el árbol de dependencias de un componente (herramienta MCP get_component_graph).
   * depth por defecto 2. Evita asumir que un componente es aislado.
   */
  async getComponentGraph(
    componentName: string,
    projectId: string,
    depth: number = 2,
    currentFilePath?: string,
  ): Promise<string> {
    const ident = await this.resolveStoredToMcp(projectId);
    const args: Record<string, unknown> = {
      componentName: componentName.trim(),
      projectId: ident.graphProjectId,
      depth: Number.isFinite(depth) ? depth : 2,
    };
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_component_graph", args);
    return out ?? "";
  }

  /**
   * Resuelve etiqueta legible para un `roots[].id` usando el catálogo MCP (multi-root).
   */
  private repoLabelFromCatalog(catalog: TheForgeProject[], repoId: string): string {
    for (const p of catalog) {
      const r = p.roots?.find((x) => x.id === repoId);
      if (r?.name?.trim()) return r.name.trim();
    }
    return `repo:${repoId.slice(0, 8)}…`;
  }

  /**
   * Búsqueda semántica en el grafo (herramienta MCP semantic_search).
   * Encuentra componentes, funciones y archivos por palabra clave. Útil para documentación y refinamiento del plan.
   *
   * **Multi-root:** el MCP no acepta `scope`; cuando el proyecto tiene varios `roots[]`, se lanza **una llamada por repo**
   * (mismos términos) y se concatenan con separadores y título por repo — mismo criterio de cobertura que `ask_codebase` + `scope.repoIds`.
   */
  async semanticSearch(
    query: string,
    projectId: string,
    limit?: number,
  ): Promise<string> {
    if (!this.isConfigured()) return "";
    const trimmed = projectId.trim();
    if (!trimmed) {
      this.logger.warn("[TheForge] semanticSearch: projectId es obligatorio para la herramienta MCP semantic_search.");
      return "";
    }
    const ident = await this.resolveStoredToMcp(trimmed);
    const catalog = await this.getProjectsCatalog();
    const lim = typeof limit === "number" && limit > 0 ? limit : getLegacySemanticSearchLimit();
    const q = query.trim();
    const fromScope = ident.scopeForScopedTools?.repoIds?.length
      ? [...new Set(ident.scopeForScopedTools.repoIds.map((x) => x.trim()).filter(Boolean))]
      : [];
    const repoIds = fromScope.length > 0 ? fromScope : [ident.graphProjectId].filter(Boolean);
    if (repoIds.length === 0) return "";

    if (repoIds.length === 1) {
      const args: Record<string, unknown> = { query: q, projectId: repoIds[0], limit: lim };
      const out = await this.callToolInternal("semantic_search", args);
      return out ?? "";
    }

    const perRepo = Math.max(4, Math.ceil(lim / repoIds.length));
    const chunks = await Promise.all(
      repoIds.map(async (rid) => {
        const out = await this.callToolInternal("semantic_search", { query: q, projectId: rid, limit: perRepo });
        const text = (out ?? "").trim();
        if (!text) return "";
        const label = this.repoLabelFromCatalog(catalog, rid);
        return `#### ${label} (\`${rid.slice(0, 8)}…\`)\n\n${text}`;
      }),
    );
    return chunks.filter(Boolean).join("\n\n---\n\n");
  }

  /**
   * Lista funciones y componentes definidos en un archivo (herramienta MCP get_functions_in_file).
   * Enriquece el contexto para documentación y MDD de cambio.
   */
  async getFunctionsInFile(
    path: string,
    projectId?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { path: path.trim() };
    if (projectId?.trim()) {
      const ident = await this.resolveStoredToMcp(projectId.trim());
      args.projectId = ident.graphProjectId;
    }
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_functions_in_file", args);
    return out ?? "";
  }

  /**
   * Obtiene la definición exacta (archivo, líneas) de un símbolo (herramienta MCP get_definitions).
   * Útil para documentar dónde vive cada clase/función.
   */
  async getDefinitions(
    symbol: string,
    projectId?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { symbolName: symbol.trim() };
    if (projectId?.trim()) {
      const ident = await this.resolveStoredToMcp(projectId.trim());
      args.projectId = ident.graphProjectId;
    }
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_definitions", args);
    return out ?? "";
  }

  /**
   * Obtiene todas las referencias a un símbolo en el codebase (herramienta MCP get_references).
   * Complementa get_definitions para documentar impacto y usos.
   */
  async getReferences(
    symbol: string,
    projectId?: string,
    currentFilePath?: string,
  ): Promise<string> {
    const args: Record<string, unknown> = { symbolName: symbol.trim() };
    if (projectId?.trim()) {
      const ident = await this.resolveStoredToMcp(projectId.trim());
      args.projectId = ident.graphProjectId;
    }
    if (currentFilePath?.trim()) args.currentFilePath = currentFilePath.trim();
    const out = await this.callToolInternal("get_references", args);
    return out ?? "";
  }
}
