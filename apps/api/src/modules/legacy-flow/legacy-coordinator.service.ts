import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ComplexityLevel, type Project as DbProject } from "@theforge/database";
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
  gatherLegacyIndexSignals,
  getLegacyAskCodebaseOptions,
  getLegacySemanticSearchLimit,
  isLegacyEvidenceFirstEnabled,
  clipLegacySemanticSection,
  legacyAnalyzerIndicatesEmptyIndex,
  legacyIndexHasUsableGraphEvidence,
  type LegacyIndexSignalsGathered,
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
import {
  parseAgentGovernanceResponse,
  serializeAgentGovernanceScaffold,
} from "../ai/utils/agent-governance.util.js";
import { suggestAgentGovernanceArtifacts } from "../ai/utils/suggest-agent-governance-artifacts.js";
import {
  brdGenerationErrorMessage,
  extractBrdFromLlmResponse,
  type BrdExtractFailure,
} from "../ai/utils/brd-extract.util.js";
import { truncateSourceDocForBrdPrompt } from "../ai/utils/dbga-prompt-context.util.js";
import {
  BRD_GENERATION_SYSTEM,
  buildBrdUserPrompt,
} from "../ai/prompts/brd-generation-prompt.js";
import { AIFactory } from "../ai/ai.factory.js";
import { getRequestUserId } from "../../common/request-user.store.js";
import { UX_UI_GUIDE_PROMPT } from "../ai/prompts/ux-ui-guide-prompt.js";
import {
  isLegacyCodebaseDocMcpDebugUiEnabled,
  runWithMcpUiDebug,
  type McpUiDebugEntry,
} from "../theforge/mcp-ui-debug.context.js";
import { normalizeRawEvidenceJsonBlocksInMarkdown } from "../theforge/theforge-raw-evidence-markdown.js";
import { trySectionMergeDeliverable } from "./legacy-section-merge-deliverables.runner.js";
import type { LegacySectionMergeTrace } from "./legacy-section-merge.types.js";
import { LegacyDeliverablesStrategyService } from "./legacy-deliverables-strategy/legacy-deliverables-strategy.service.js";
import type {
  LegacyDeliverablesStrategyContext,
  LegacyDeliverablesStrategyResolution,
} from "./legacy-deliverables-strategy/legacy-deliverables-strategy.types.js";
import {
  composeBrdPreamble,
} from "../ai-analysis/utils/brd-tobe-gate.util.js";

const KNOWLEDGE = loadLegacyKnowledgePack();

/** Respuesta de `generate-codebase-doc` cuando el API tiene trazas MCP (debug UI). */
export type GenerateCodebaseDocResponse = { codebaseDoc: string; mcpDebugTrace?: McpUiDebugEntry[] };

export type LegacyIndexSddResolutionChoice = "trust_index" | "trust_sdd" | "proceed_with_warnings";

/** Paso de la cascada legacy de entregables (telemetría / depuración). */
export type LegacyDeliverablesDebugStepKind =
  | "preflight"
  | "index_sdd_gate"
  | "theforge_context"
  | DeliverableKind;

export interface LegacyDeliverablesDebugStep {
  kind: LegacyDeliverablesDebugStepKind;
  /** ISO al finalizar el paso */
  at: string;
  durationMs: number;
  ok: boolean;
  /** Caracteres del campo persistido en `Project` tras el paso (si aplica). */
  outChars?: number;
  detail?: string;
  error?: string;
}

/** Trazabilidad de la última ejecución de `POST …/legacy/generate-deliverables` (persistida + respuesta HTTP). */
export interface LegacyDeliverablesDebugReport {
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  /** Pasos entregables con salida > 48 chars (heurística “hubo cuerpo”). */
  deliverablesWithBody?: number;
  mddSource: "mddContent" | "codebaseDoc_fallback" | "none";
  mddChars: number;
  codebaseDocChars: number;
  mddContentChars: number;
  theforgeContextChars: number;
  theforgeConfigured: boolean;
  complexityEffective: ComplexityLevel;
  deliverablesOrder: DeliverableKind[];
  steps: LegacyDeliverablesDebugStep[];
  fatalError?: { message: string; stack?: string };
  /** Si el fallo fue 429 del proveedor LLM (p. ej. TPM Moonshot). */
  upstreamRateLimited?: boolean;
  /** Segundos sugeridos de espera (cabeceras `retry-after` / `msh-cooldown-seconds` del upstream). */
  retryAfterSeconds?: number;
  /** Caracteres del MDD realmente enviados al LLM tras `LEGACY_DELIVERABLES_MDD_MAX_CHARS`. */
  mddCharsSentToLlm?: number;
  /** Si se truncó el MDD para respetar el tope y mitigar 429 / límites de contexto. */
  mddClippedForLlm?: boolean;
  /** Cómo se preparó el texto MDD para la cascada LLM. */
  mddLlmStrategy?: "full" | "truncate" | "rollup";
  /** Ventanas del rollup (0 = MDD completo sin rollup). */
  mddRollupWindows?: number;
  /** Si el rollup falló y se aplicó fallback a truncado. */
  mddRollupFailed?: boolean;
  /** Trazas de generación por secciones MDD + verificación (`LEGACY_DELIVERABLES_SECTION_MERGE`). */
  sectionMergeTraces?: LegacySectionMergeTrace[];
  /** Una entrada por intento de entregable: política env, envelope y estimación de tokens (motor de estrategia). */
  strategyDecisions?: LegacyDeliverablesStrategyResolution[];
}

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
  /** Última traza de generación de entregables (legacy); sobreescrita en cada POST generate-deliverables. */
  lastDeliverablesDebug?: LegacyDeliverablesDebugReport;
}

const COORDINATOR_SYSTEM =
  "Eres el coordinador del flujo legacy. Orquestas análisis del código (TheForge), preguntas al usuario y generación de documentos (MDD, SPEC, etc.). " +
  "Usa el conocimiento base para mantener coherencia y cascada specification-driven.\n\n" +
  "Cuando el análisis deba anclarse a interfaces reales (manual To-Be, MDD de cambio, contratos UI o firmas backend), prioriza en el discurso y en las peticiones al pipeline el uso de herramientas deterministas del grafo TheForge — **`get_contract_specs`** (props de componentes UI) y **`get_implementation_details`** (firma/tipos/endpoints de símbolos backend) — frente a **`semantic_search`** genérico o inferencias sin nombre de símbolo concreto.\n\n" +
  "Conocimiento base:\n---\n" +
  KNOWLEDGE +
  "\n---";

function mddTheforgeContextMaxChars(): number {
  const n = parseInt(process.env.LEGACY_MDD_THEFORGE_CONTEXT_MAX_CHARS ?? "64000", 10);
  return Number.isFinite(n) && n > 0 ? n : 64000;
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

/** Logs Nest por paso en cascada entregables legacy. Activar: `LEGACY_DELIVERABLES_DEBUG=1`. */
function isLegacyDeliverablesDebugVerbose(): boolean {
  const v = process.env.LEGACY_DELIVERABLES_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pausa entre cada paso LLM de la cascada (mitiga TPM/RPM en Gemini/Moonshot).
 * Default 5000 ms. `0` o vacío desactiva (solo tras al menos un paso LLM previo).
 */
function legacyDeliverablesInterStepDelayMs(): number {
  const raw = process.env.LEGACY_DELIVERABLES_INTER_STEP_DELAY_MS?.trim();
  if (raw === undefined || raw === "") return 15000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 180_000);
}

/**
 * Cooldown único antes del primer `runStep` cuando el MDD inyectado es muy largo (p. ej. `codebaseDoc_fallback`).
 * Default: si `mddChars` > 80000 → espera 20000 ms una vez.
 */
function legacyDeliverablesLargeMddCooldownMs(mddChars: number): number {
  const thresholdRaw = process.env.LEGACY_DELIVERABLES_LARGE_MDD_THRESHOLD_CHARS?.trim();
  const threshold =
    thresholdRaw === undefined || thresholdRaw === ""
      ? 80_000
      : Math.max(0, parseInt(thresholdRaw, 10) || 0);
  if (threshold === 0 || mddChars <= threshold) return 0;
  const coolRaw = process.env.LEGACY_DELIVERABLES_LARGE_MDD_COOLDOWN_MS?.trim();
  const cool =
    coolRaw === undefined || coolRaw === ""
      ? 20_000
      : Math.max(0, parseInt(coolRaw, 10) || 0);
  return Math.min(cool, 180_000);
}

/**
 * Tope de caracteres del MDD inyectado en cada paso LLM de entregables legacy (además de system + TheForge).
 * Default 80000: doc. partida enorme ya no manda ~200k en una sola petición (principal causa de 429 Gemini).
 */
function legacyDeliverablesMddMaxCharsForLlm(): number {
  const raw = process.env.LEGACY_DELIVERABLES_MDD_MAX_CHARS?.trim();
  if (raw === undefined || raw === "") return 120_000;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 12_000) return 12_000;
  return Math.min(n, 500_000);
}

function clipMddForLegacyDeliverablesLlm(mdd: string, report: LegacyDeliverablesDebugReport): string {
  const max = legacyDeliverablesMddMaxCharsForLlm();
  if (mdd.length <= max) {
    report.mddCharsSentToLlm = mdd.length;
    report.mddClippedForLlm = false;
    report.mddLlmStrategy = report.mddLlmStrategy ?? "full";
    return mdd;
  }
  report.mddLlmStrategy = "truncate";
  report.mddClippedForLlm = true;
  const footer =
    "\n\n---\n\n> **Nota (The Forge — entregables legacy):** El documento superó `LEGACY_DELIVERABLES_MDD_MAX_CHARS` (" +
    String(max) +
    " caracteres). **Solo se envió el inicio** al modelo; el final fue omitido. Prioriza coherencia con lo visible; no inventes secciones omitidas.\n";
  const budget = Math.max(0, max - footer.length);
  const clipped = mdd.slice(0, budget) + footer;
  report.mddCharsSentToLlm = clipped.length;
  return clipped;
}

function isLegacyDeliverablesMddRollupEnabled(): boolean {
  const v = process.env.LEGACY_DELIVERABLES_MDD_ROLLUP?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

function legacyDeliverablesRollupChunkChars(): number {
  const n = parseInt(process.env.LEGACY_DELIVERABLES_ROLLUP_CHUNK_CHARS ?? "40000", 10);
  return Number.isFinite(n) && n >= 8000 ? Math.min(n, 120_000) : 40_000;
}

function legacyDeliverablesRollupMaxChunks(): number {
  const n = parseInt(process.env.LEGACY_DELIVERABLES_ROLLUP_MAX_CHUNKS ?? "32", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 64) : 32;
}

/** Trocea el MDD en ventanas (~chunkSize) cortando preferentemente en `\n## `. */
function splitMddForRollupChunks(mdd: string, chunkSize: number, maxChunks: number): string[] {
  if (mdd.length <= chunkSize) return [mdd];
  const chunks: string[] = [];
  let pos = 0;
  while (pos < mdd.length && chunks.length < maxChunks) {
    const hardEnd = Math.min(pos + chunkSize, mdd.length);
    if (hardEnd >= mdd.length) {
      const tail = mdd.slice(pos).trim();
      if (tail) chunks.push(tail);
      pos = mdd.length;
      break;
    }
    const window = mdd.slice(pos, hardEnd);
    const breakAt = window.lastIndexOf("\n## ");
    const cut = breakAt >= Math.floor(chunkSize * 0.35) ? pos + breakAt : hardEnd;
    const piece = mdd.slice(pos, cut).trim();
    if (piece) chunks.push(piece);
    pos = cut;
    while (pos < mdd.length && (mdd[pos] === "\n" || mdd[pos] === "\r")) pos++;
    if (piece.length === 0 && pos < mdd.length && pos < hardEnd) pos = hardEnd;
  }
  if (pos < mdd.length && chunks.length > 0) {
    chunks[chunks.length - 1] =
      (chunks[chunks.length - 1] ?? "") +
      "\n\n> **[The Forge]** Parte del MDD no entró en más ventanas (límite `LEGACY_DELIVERABLES_ROLLUP_MAX_CHUNKS`=" +
      String(maxChunks) +
      "). Continúa aproximadamente desde el carácter " +
      String(pos) +
      " del MDD original.\n";
  }
  return chunks;
}

const LEGACY_MDD_ROLLUP_EXTRACTOR_SYSTEM =
  "Eres analista SDD. Recibes UN fragmento del MDD (Markdown) de un proyecto.\n" +
  "Extrae SOLO hechos presentes en el texto (no inventes nada que no aparezca o no se deduzca con certeza razonable): " +
  "modelo de datos, entidades, campos; rutas/API/endpoints; reglas de negocio y validaciones; " +
  "flujos y casos límite; seguridad; infra y despliegue; stack y convenciones si constan.\n" +
  "Salida en **español**, markdown compacto con viñetas y `###` breves.\n" +
  "Si el fragmento casi no aporta hechos técnicos, responde exactamente en una línea: `Sin hechos técnicos densos en este fragmento.`\n" +
  "Límite aproximado: **4000 palabras** (~24k caracteres) — prioriza hechos concretos dentro del límite.";

function isLegacy429Like(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const o = err as { status?: number; statusCode?: number };
  if (o.status === 429 || o.statusCode === 429) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource exhausted") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit")
  );
}

/** Reintentos ante 429 / resource exhausted (Gemini, Moonshot, etc.). */
async function runWithLegacy429Retries<T>(
  run: () => Promise<T>,
  ctx: { logger: Logger; step: string },
): Promise<T> {
  const maxRaw = process.env.LEGACY_DELIVERABLES_LLM_429_MAX_RETRIES?.trim();
  const maxRetries =
    maxRaw === undefined || maxRaw === ""
      ? 5
      : Math.max(0, Math.min(12, parseInt(maxRaw, 10) || 0));
  const baseRaw = process.env.LEGACY_DELIVERABLES_LLM_429_BASE_DELAY_MS?.trim();
  const baseMs =
    baseRaw === undefined || baseRaw === ""
      ? 15_000
      : Math.max(500, parseInt(baseRaw, 10) || 15_000);

  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (!isLegacy429Like(err) || attempt >= maxRetries) throw err;
      const fromHeaderSec = readRetryAfterSecondsFromErrorHeaders(err);
      const waitMs =
        fromHeaderSec != null
          ? Math.min(180_000, Math.max(2_000, fromHeaderSec * 1000))
          : Math.min(180_000, baseMs * 2 ** attempt);
      attempt++;
      ctx.logger.warn(
        `[LegacyDeliverables] upstream 429-like → wait ${waitMs}ms then retry ${attempt}/${maxRetries} (step=${ctx.step})`,
      );
      await sleepMs(waitMs);
    }
  }
}

const DELIVERABLE_PROJECT_FIELD: Partial<Record<DeliverableKind, keyof DbProject>> = {
  spec: "specContent",
  architecture: "architectureContent",
  use_cases: "useCasesContent",
  blueprint: "blueprintContent",
  api_contracts: "apiContractsContent",
  logic_flows: "logicFlowsContent",
  ux_ui_guide: "uxUiGuideContent",
  user_stories: "userStoriesContent",
  agent_governance: "agentGovernanceContent",
  tasks: "tasksContent",
  infra: "infraContent",
};

function deliverableFieldCharCount(p: Record<string, unknown>, kind: DeliverableKind): number {
  const field = DELIVERABLE_PROJECT_FIELD[kind];
  if (!field) return 0;
  return String(p[field] ?? "").length;
}

function clipDebug(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function readRetryAfterSecondsFromErrorHeaders(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const headers = (err as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object") return null;
  const h = headers as Record<string, unknown>;
  for (const key of ["retry-after", "x-retry-after", "msh-cooldown-seconds", "Retry-After", "X-Retry-After"]) {
    const v = h[key];
    if (v == null) continue;
    const n = parseInt(String(v), 10);
    if (Number.isFinite(n) && n > 0) return Math.min(600, Math.max(1, n));
  }
  return null;
}

/** Si el proveedor LLM devolvió 429 / resource exhausted (OpenAI-compatible, Gemini, etc.). */
function upstreamLlmRateLimitHttpException(
  err: unknown,
  lastDeliverablesDebug: LegacyDeliverablesDebugReport,
): HttpException | null {
  if (!isLegacy429Like(err)) return null;
  const message =
    err instanceof Error && err.message.trim()
      ? err.message.trim()
      : "Proveedor LLM: límite de uso (429). Reintenta más tarde.";
  const retryAfterSeconds = readRetryAfterSecondsFromErrorHeaders(err) ?? 60;
  return new HttpException(
    {
      statusCode: 429,
      message,
      error: "Too Many Requests",
      code: "UPSTREAM_LLM_RATE_LIMIT",
      retryAfterSeconds,
      lastDeliverablesDebug,
    },
    429,
  );
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
    private readonly aiFactory: AIFactory,
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly theforge: TheForgeService,
    private readonly ai: AiService,
    private readonly reviewer: LegacyReviewerService,
    private readonly graphMemory: GraphMemoryService,
    private readonly agentSupervisor: AgentSupervisorService,
    private readonly legacyDeliverablesStrategy: LegacyDeliverablesStrategyService,
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

  /**
   * Etapa legacy para BRD/To-Be/As-Is: prioriza `isLegacy`; si no hay ninguna, etapa primaria del proyecto.
   */
  private async resolveLegacyGateStage(projectId: string) {
    const row = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { stages: { orderBy: { ordinal: "asc" } } },
    });
    if (!row?.stages?.length) return null;
    const legacyMarked = row.stages.filter((s) => s.isLegacy);
    const pool = legacyMarked.length > 0 ? legacyMarked : row.stages;
    const picked = pickPrimaryStage(pool);
    if (!picked?.id) return null;
    return this.prisma.stage.findUnique({ where: { id: picked.id } });
  }

  /**
   * Lee el estado de cambio legacy: prioriza stage.legacyChangeState (nuevo),
   * con fallback a project.legacyFlowState (legacy) para compatibilidad.
   */
  private getLegacyChangeState(stage: { legacyChangeState?: unknown } | null, project: { legacyFlowState?: unknown }): LegacyFlowState {
    if (stage?.legacyChangeState && typeof stage.legacyChangeState === "object") {
      return stage.legacyChangeState as LegacyFlowState;
    }
    return ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
  }

  /**
   * Persiste el estado de cambio legacy en stage.legacyChangeState Y project.legacyFlowState
   * (dual-write durante migración; luego se eliminará project.legacyFlowState).
   */
  async persistLegacyChangeState(projectId: string, stageId: string, state: LegacyFlowState): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.stage.update({
        where: { id: stageId },
        data: { legacyChangeState: state as object },
      }),
      this.prisma.project.update({
        where: { id: projectId },
        data: { legacyFlowState: state as object },
      }),
    ]);
  }

  // enforceLegacyBrdTobeGate eliminado — To-Be y As-Is removidos del sistema

  /**
   * Sincroniza la etapa legacy actual al grafo FalkorDB (nodo :LegacyStage).
   * No crítico — fallos se loguean como warning y no interrumpen el flujo.
   */
  private async syncCurrentLegacyStageToGraph(projectId: string, stageId: string): Promise<void> {
    try {
      const [stage, project] = await Promise.all([
        this.prisma.stage.findUnique({ where: { id: stageId } }),
        this.prisma.project.findUnique({
          where: { id: projectId },
          select: { theforgeProjectId: true },
        }),
      ]);
      if (!stage) {
        this.logger.warn(`[LegacyCoordinator] syncCurrentLegacyStage: stage ${stageId} no encontrada`);
        return;
      }
      // Buscar etapa base (ordinal anterior) para relación DERIVED_FROM
      let parentStageId: string | undefined;
      if (stage.ordinal > 1) {
        const baseline = await this.prisma.stage.findFirst({
          where: { projectId: stage.projectId, ordinal: stage.ordinal - 1 },
          select: { id: true },
        });
        if (baseline) parentStageId = baseline.id;
      }
      await this.graphMemory.syncLegacyStage({
        stageId: stage.id,
        projectId,
        ordinal: stage.ordinal,
        name: stage.name ?? "",
        description: (stage as { description?: string | null }).description ?? undefined,
        parentStageId,
        theforgeProjectId: project?.theforgeProjectId ?? undefined,
      });
    } catch (err) {
      this.logger.warn(
        `[LegacyCoordinator] syncCurrentLegacyStageToGraph falló (no crítico): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // generateAsIsManual eliminado — As-Is removido del sistema; usar legacyFlowState.codebaseDoc directamente

  /**
   * Borrador BRD a partir de `legacyFlowState.codebaseDoc` (Ariadne); persiste en la etapa sin aprobar.
   * (To-Be y As-Is eliminados — el MDD captura el diseño.)
   */
  async suggestBrdFromCodebaseDoc(projectId: string, stageIdHint?: string): Promise<{
    brdContent: string;
    stageId: string;
  }> {
    const { project } = await this.getLegacyProject(projectId);
    const gateStageResolved = stageIdHint?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageIdHint.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const state = this.getLegacyChangeState(gateStageResolved, project);
    const codebaseDoc = String(state.codebaseDoc ?? "").trim();
    if (codebaseDoc.length < 300) {
      throw new BadRequestException(
        "Se requiere documentación de partida del codebase (mín. ~300 caracteres). Ejecuta primero generate-codebase-doc.",
      );
    }
    let stage;
    if (stageIdHint?.trim()) {
      stage = await this.prisma.stage.findUnique({ where: { id: stageIdHint.trim() } });
      if (!stage) throw new BadRequestException(`Etapa ${stageIdHint} no encontrada.`);
    } else {
      stage = await this.resolveLegacyGateStage(projectId);
    }
    if (!stage?.id) {
      throw new BadRequestException("No hay etapa para persistir BRD.");
    }

    let baselineBrdBlock = "";
    if (stage.ordinal > 1) {
      try {
        const baselineOrdinal = stage.ordinal - 1;
        const baseline = await this.prisma.stage.findFirst({
          where: { projectId: stage.projectId, ordinal: baselineOrdinal },
          select: { brdContent: true },
        });
        if (baseline?.brdContent?.trim()) {
          baselineBrdBlock =
            "## Línea base — BRD de la etapa anterior (sistema sin el cambio actual)\n\n" +
            baseline.brdContent.trim().slice(0, 15000) +
            "\n\n---\n\n**Instrucción:** El BRD debe centrarse SOLO en el cambio respecto a esta línea base. " +
            "No redescribas el sistema completo.\n\n---\n\n";
        }
      } catch { /* non-critical */ }
    }
    const isInitialLegacyStage = !baselineBrdBlock;
    const { text: codebaseChunk, truncated: sourceTruncated } =
      truncateSourceDocForBrdPrompt(codebaseDoc);

    const brdPromptBase = buildBrdUserPrompt({
      mode: isInitialLegacyStage ? "legacy-as-is" : "legacy-change",
      sourceLabel: "DOCUMENTO",
      sourceDocument: codebaseChunk,
      baselineBrdBlock: baselineBrdBlock || undefined,
    });

    let brd = "";
    let lastFailure: BrdExtractFailure = "no_delimiter";
    let lastRawLength = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const formatReminder =
        attempt > 1
          ? "\n\n**IMPORTANTE:** El intento anterior no siguió el formato. Responde ÚNICAMENTE con:\n<<<BRD>>>\n(markdown BRD completo)\n<<<END_BRD>>>\nSin texto antes ni después de los delimitadores."
          : "";
      const raw = await this.ai.generateResponse(brdPromptBase + formatReminder, [], {
        systemPrompt: BRD_GENERATION_SYSTEM,
      });
      lastRawLength = (raw ?? "").length;
      const extracted = extractBrdFromLlmResponse(raw ?? "");
      if (extracted.ok) {
        brd = cleanDocumentContent(extracted.content);
        break;
      }
      lastFailure = extracted.failure;
      if (attempt < 2) {
        console.warn(
          `[suggestBrdFromCodebaseDoc] Intento BRD ${attempt}/2: ${extracted.failure} (raw ~${lastRawLength} chars), reintentando...`,
        );
      }
    }
    if (!brd) {
      throw new BadRequestException(
        brdGenerationErrorMessage(lastFailure, {
          dbgaTruncated: sourceTruncated,
          rawLength: lastRawLength,
        }),
      );
    }

    await this.prisma.stage.update({
      where: { id: stage.id },
      data: {
        brdContent: brd,
      },
    });
    await this.syncCurrentLegacyStageToGraph(projectId, stage.id).catch(() => {});
    return { brdContent: brd, stageId: stage.id };
  }

  private hasLegacyIndexSddResolution(state: LegacyFlowState): boolean {
    const r = state.legacyIndexSddResolution;
    return typeof r?.choice === "string" && typeof r?.resolvedAt === "string" && r.resolvedAt.length > 0;
  }

  /**
   * Consulta Falkor SDD (etapa) y cruza con señales del índice Ariadne; lanza 409 si hay discrepancia grave
   * y el usuario no ha resuelto en legacyFlowState.
   *
   * @returns Señales MCP ya obtenidas (`gatherLegacyIndexSignals`) cuando el gate corrió y pasó — el caller puede
   *          reutilizarlas (p. ej. §5 de doc. partida) y evitar repetir 3× `semantic_search` idénticas en coste MCP.
   */
  private async assertLegacyIndexSddGate(
    projectId: string,
    theforgeId: string,
    legacyState: LegacyFlowState,
    options?: { semanticQueries?: readonly string[] },
  ): Promise<LegacyIndexSignalsGathered | null> {
    if (!isLegacySddIndexGateEnabled()) return null;
    if (this.hasLegacyIndexSddResolution(legacyState)) return null;

    const row = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { stages: true },
    });
    const stageId = row?.stages?.length ? pickPrimaryStage(row.stages)?.id : undefined;
    if (!stageId?.trim()) return null;

    const snapshot = await this.graphMemory.getSddStageSnapshot(projectId, stageId);
    if (!snapshot) return null;

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

    if (!gate.blocking) return gathered;

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
    stageId?: string,
  ): Promise<GenerateCodebaseDocResponse | null> {
    if (isLegacyCodebaseDocMcpDebugUiEnabled()) {
      const { result, trace } = await runWithMcpUiDebug(() => this.generateCodebaseDocCore(projectId, req, stageId));
      if (!result) return null;
      return { ...result, mcpDebugTrace: trace };
    }
    return this.generateCodebaseDocCore(projectId, req, stageId);
  }

  /** Generación de doc. partida (sin ALS de debug). */
  private async generateCodebaseDocCore(
    projectId: string,
    req?: GenerateCodebaseDocRequest,
    stageId?: string,
  ): Promise<{ codebaseDoc: string } | null> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    if (!this.theforge.isConfigured()) return null;

    const resolvedStage = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : null;
    const legacyState = resolvedStage?.legacyChangeState
      ? (resolvedStage.legacyChangeState as LegacyFlowState)
      : ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;
    /** Gate índice ↔ SDD Falkor local (siempre antes de doc. partida). */
    await this.assertLegacyIndexSddGate(projectId, theforgeId, legacyState);

    if (req?.responseMode) {
      this.logger.warn(
        `generateCodebaseDoc: responseMode="${req.responseMode}" ignorado — doc. partida usa generate_legacy_documentation (modo único MCP).`,
      );
    }

    const scope = await this.theforge.resolveLegacyDocumentationScope(theforgeId);

    let codebaseDoc = "";
    const raw =
      (await this.theforge.generateLegacyDocumentation(theforgeId, { scope }))?.trim() ?? "";
    if (raw && legacyAnalyzerIndicatesEmptyIndex(raw)) {
      this.logger.warn(
        `generateCodebaseDoc: generate_legacy_documentation señaló índice vacío. theforgeId=${theforgeId}`,
      );
    } else if (raw) {
      codebaseDoc = "# MDD de partida (Ariadne — generate_legacy_documentation)\n\n" + raw;
    } else {
      this.logger.warn(
        `generateCodebaseDoc: generate_legacy_documentation devolvió vacío. theforgeId=${theforgeId.slice(0, 8)}…`,
      );
    }

    if (codebaseDoc.trim()) {
      codebaseDoc = normalizeRawEvidenceJsonBlocksInMarkdown(codebaseDoc);
    }

    const persistStage = stageId?.trim()
      ? (resolvedStage ?? await this.resolveLegacyGateStage(projectId))
      : await this.resolveLegacyGateStage(projectId);
    const projectFromDb = await this.projects.findOne(projectId);
    const state = this.getLegacyChangeState(persistStage, projectFromDb);
    const nextLegacy = { ...state, codebaseDoc } as LegacyFlowState;
    if (persistStage?.id) {
      await this.persistLegacyChangeState(projectId, persistStage.id, nextLegacy);
    } else {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { legacyFlowState: nextLegacy as object },
      });
    }
    return { codebaseDoc };
  }

  /**
   * Tras un 409 LEGACY_INDEX_SDD_MISMATCH, el usuario elige cómo proceder (índice MCP vs SDD en Falkor).
   */
  async resolveIndexSddConflict(
    projectId: string,
    choice: LegacyIndexSddResolutionChoice,
    stageId?: string,
  ): Promise<{ ok: boolean; legacyIndexSddResolution: LegacyFlowState["legacyIndexSddResolution"] }> {
    await this.getLegacyProject(projectId);
    const allowed: LegacyIndexSddResolutionChoice[] = ["trust_index", "trust_sdd", "proceed_with_warnings"];
    if (!allowed.includes(choice)) {
      throw new BadRequestException(`choice debe ser uno de: ${allowed.join(", ")}`);
    }
    const project = await this.projects.findOne(projectId);
    const gateStageForResolution = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const state = this.getLegacyChangeState(gateStageForResolution, project);
    const legacyIndexSddResolution: LegacyFlowState["legacyIndexSddResolution"] = {
      choice,
      resolvedAt: new Date().toISOString(),
    };
    const next = { ...state, legacyIndexSddResolution };
    if (gateStageForResolution?.id) {
      await this.persistLegacyChangeState(projectId, gateStageForResolution.id, next);
    } else {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { legacyFlowState: next as object },
      });
    }
    return { ok: true, legacyIndexSddResolution };
  }

  /**
   * Actualiza la documentación de partida del codebase (edición manual).
   * @param projectId - ID del proyecto.
   * @param codebaseDoc - Contenido Markdown.
   * @returns { codebaseDoc: string }.
   */
  async updateCodebaseDoc(projectId: string, codebaseDoc: string, stageId?: string): Promise<{ codebaseDoc: string }> {
    await this.getLegacyProject(projectId);
    const stage = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const project = await this.projects.findOne(projectId);
    const state = this.getLegacyChangeState(stage, project);
    const next = { ...state, codebaseDoc } as LegacyFlowState;
    if (stage?.id) {
      await this.persistLegacyChangeState(projectId, stage.id, next);
    } else {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { legacyFlowState: next as object },
      });
    }
    return { codebaseDoc };
  }

  /**
   * Inicia el flujo legacy: consulta AriadneSpecs MCP (get_modification_plan o ask_codebase), obtiene archivos y preguntas,
   * pide sugerencias de respuestas al codebase y persiste todo en legacyFlowState.
   * @param projectId - ID del proyecto.
   * @param description - Descripción de la modificación que quiere el usuario.
   * @returns Lista de archivos a modificar, preguntas para afinar y respuestas sugeridas (opcional).
   */
  async start(projectId: string, description: string, stageId?: string): Promise<{ filesToModify: TheForgeFileToModify[]; questions: string[]; suggestedAnswers?: Record<string, string> }> {
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
    const gateStageForStart = stageId?.trim()
      ? (await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })) ?? await this.resolveLegacyGateStage(projectId)
      : await this.resolveLegacyGateStage(projectId);
    if (gateStageForStart?.id) {
      await this.persistLegacyChangeState(projectId, gateStageForStart.id, state);
      await this.syncCurrentLegacyStageToGraph(projectId, gateStageForStart.id).catch(() => {});
    } else {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { legacyFlowState: state as object },
      });
    }
    return { filesToModify, questions, suggestedAnswers: Object.keys(suggestedAnswers).length > 0 ? suggestedAnswers : undefined };
  }

  /**
   * Registra las respuestas del usuario a las preguntas del flujo. Persiste en legacyFlowState.answers.
   * @param projectId - ID del proyecto.
   * @param answers - Mapa índice de pregunta → respuesta (p. ej. { "0": "10", "1": "30" }).
   */
  async answer(projectId: string, answers: Record<string, string>, stageId?: string): Promise<{ ok: boolean }> {
    const { project } = await this.getLegacyProject(projectId);
    const gateStageForAnswer = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const prev = this.getLegacyChangeState(gateStageForAnswer, project);
    const next: LegacyFlowState = { ...prev, answers };
    if (gateStageForAnswer?.id) {
      await this.persistLegacyChangeState(projectId, gateStageForAnswer.id, next);
      await this.syncCurrentLegacyStageToGraph(projectId, gateStageForAnswer.id).catch(() => {});
    } else {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { legacyFlowState: next as object },
      });
    }
    return { ok: true };
  }

  /**
   * Genera el MDD de cambio a partir de la descripción, archivos, respuestas del usuario y contexto AriadneSpecs (múltiples ask_codebase).
   * Persiste el resultado en mddContent del proyecto.
   * @param projectId - ID del proyecto.
   * @returns Contenido Markdown del MDD generado.
   */
  async generateMdd(projectId: string, stageId?: string): Promise<{ mddContent: string }> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const gateStage = stageId?.trim()
      ? (await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })) ?? await this.resolveLegacyGateStage(projectId)
      : await this.resolveLegacyGateStage(projectId);
    const state = this.getLegacyChangeState(gateStage, project);
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
    // enforceLegacyBrdTobeGate eliminado — To-Be y As-Is removidos
    const brdPre = gateStage?.brdContent ? composeBrdPreamble(gateStage.brdContent) : "";

    // Múltiples consultas a TheForge para contexto amplio (evidencia del índice + ask_codebase + refactor seguro)
    const theforgeParts: string[] = [];
  const isInitialMdd = !description.trim();
  // Fase 5: Buscar etapa base (ordinal anterior) para contexto incremental
  let baselineStage: { mddContent?: string | null } | null = null;
  if (!isInitialMdd && gateStage && gateStage.ordinal > 1) {
    const baselineOrdinal = gateStage.ordinal - 1;
    const stages = project?.stages ?? [];
    baselineStage = stages.find((s: { ordinal: number }) => s.ordinal === baselineOrdinal) ?? null;
    if (!baselineStage?.mddContent?.trim()) {
      // Si no está en el objeto project cargado, buscar en DB
      try {
        const dbStage = await this.prisma.stage.findFirst({
          where: { projectId: gateStage.projectId, ordinal: baselineOrdinal },
          select: { mddContent: true },
        });
        if (dbStage?.mddContent?.trim()) baselineStage = dbStage;
      } catch { /* non-critical */ }
    }
  }
  if (isLegacyEvidenceFirstEnabled()) {
      try {
        const changeEvidence = await runLegacyStagedDiscoveryMddAgent({
          aiFactory: this.aiFactory,
          userId: getRequestUserId(),
          theforge: this.theforge,
          projectId,
          theforgeProjectId: theforgeId,
          agentSupervisor: this.agentSupervisor,
          mode: isInitialMdd ? "initial" : "change",
          changeDescription: isInitialMdd ? undefined : description,
          logger: this.logger,
        });
        if (changeEvidence.trim()) {
          theforgeParts.push(
            (isInitialMdd
              ? "Evidencia TheForge — descubrimiento escalonado (MDD inicial del sistema):\n\n"
              : "Evidencia TheForge — descubrimiento escalonado (MDD AS-IS / foco cambio):\n\n") +
              changeEvidence.trim(),
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
    const codebaseDoc = ((state.codebaseDoc ?? "") as string).trim();
    const codebaseDocBlock = codebaseDoc.length >= 80
      ? "## Documentación de partida — MDD inicial del codebase (Ariadne)\n\n" +
        codebaseDoc.slice(0, 40000) +
        (codebaseDoc.length > 40000 ? "\n\n> *[Nota: El MDD inicial se truncó a 40,000 caracteres para control de contexto.]*" : "") +
        "\n\n---\n\n"
      : "";
    let prompt: string;
    if (isInitialMdd) {
      // Sin descripción de cambio → MDD inicial del sistema completo (no de cambio)
      prompt =
        (brdPre ? brdPre + "\n\n" : "") +
        codebaseDocBlock +
        "Genera un documento MDD inicial (Markdown) para un proyecto legacy. " +
        "El MDD describe **el sistema existente en su totalidad**, no un cambio. " +
        "Debe tener **exactamente 7 secciones** en este orden: " +
        "1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, 4. Contratos de API, 5. Lógica y Edge Cases, " +
        "6. Seguridad, 7. Infraestructura.\n\n" +
        "**Prioridad:** Recupera y usa en su totalidad el conocimiento del codebase (TheForge) que se te proporciona. " +
        "Usa TODO ese contexto para describir fielmente la aplicación existente. " +
        "No inventes rutas, APIs, entidades ni funcionalidades que no aparezcan en el contexto. " +
        "Si el codebase está incompleto en alguna área, documéntalo como brecha.\n\n" +
        (theforgeContext
          ? "Contexto del codebase (TheForge) — evidencia del índice, arquitectura, definiciones y búsqueda semántica. " +
            "Usar TODO para describir el sistema real.\n---\n" +
            theforgeContext.slice(0, mddTheforgeContextMaxChars()) +
            "\n---"
          : "");
    } else {
      const baselineBlock = baselineStage?.mddContent?.trim()
        ? "## Línea base — MDD de la etapa anterior (sistema sin el cambio actual)\n\n" +
          baselineStage.mddContent.trim().slice(0, 30000) +
          "\n\n---\n\n" +
          "**Instrucción:** El MDD de cambio debe describir SOLO las modificaciones, adiciones o eliminaciones " +
          "respecto a esta línea base. No redescribas secciones enteras que no cambian. " +
          "Si una sección (§1–7) no se modifica, indícalo con «Sin cambios respecto a la línea base». " +
          "Enfócate en qué cambia, dónde cambia y por qué cambia.\n\n---\n\n"
        : "";
      prompt =
        (brdPre ? brdPre + "\n\n" : "") +
        codebaseDocBlock +
        baselineBlock +
        "Genera un documento MDD de cambio (Markdown) para un proyecto legacy. " +
        "Según Specification-Driven Development, el MDD es la **Constitución del cambio** y debe tener " +
        "**exactamente 7 secciones** en este orden: 1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, " +
        "4. Contratos de API, 5. Lógica y Edge Cases, 6. Seguridad, 7. Infraestructura. " +
        "Aplica cada sección al **cambio** descrito (qué se modifica en contexto, stack, modelo, API, lógica, seguridad e infra).\n\n" +
        "**Prioridad:** Recupera y usa en su totalidad el conocimiento del codebase (TheForge) que se te proporciona " +
        "antes de elaborar el documento. Usa TODO ese contexto; infiere todas las modificaciones necesarias en módulos, " +
        "entidades, APIs y pantallas existentes que el cambio afecte; no te limites al requerimiento literal. " +
        "El MDD debe reflejar el conocimiento real de la aplicación indexada (qué hay hoy y qué debe cambiar).\n\n" +
        "Descripción del cambio:\n---\n" +
        description +
        "\n---\n\n" +
        filesLine +
        (answersText ? "Respuestas del usuario:\n---\n" + answersText + "\n---\n\n" : "") +
        (theforgeContext
          ? "Contexto del codebase (TheForge) — incluye evidencia del índice, validaciones, definiciones exactas, " +
            "funciones por archivo y búsqueda semántica. Usar TODO para inferir impacto completo. " +
            "No inventes rutas ni APIs que no aparezcan en este contexto.\n---\n" +
            theforgeContext.slice(0, mddTheforgeContextMaxChars()) +
            "\n---"
          : "");
    }
    const mddDraft = await this.ai.generateResponse(prompt, [], { systemPrompt: COORDINATOR_SYSTEM });
    const mddContent = await this.reviewer.reviewMdd(description, mddDraft?.trim() ?? "");
    const cleaned = cleanDocumentContent(mddContent);
    // Dual-write durante migración: stage.legacyChangeState + project.legacyFlowState
    if (gateStage?.id) {
      await this.persistLegacyChangeState(projectId, gateStage.id, state).catch(() => {});
      await this.syncCurrentLegacyStageToGraph(projectId, gateStage.id).catch(() => {});
    }
    await this.projects.update(projectId, {
      mddContent: cleaned,
      ...(gateStage?.id ? { stageId: gateStage.id } : {}),
    });
    return { mddContent: cleaned };
  }

  /** Persiste `lastDeliverablesDebug` en `legacyFlowState` (no lanza si Prisma falla). */
  private async persistDeliverablesDebugReport(
    projectId: string,
    report: LegacyDeliverablesDebugReport,
  ): Promise<void> {
    try {
      const row = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { legacyFlowState: true, stages: { orderBy: { ordinal: "asc" }, take: 1, select: { id: true } } },
      });
      const state = (row?.legacyFlowState as LegacyFlowState | null | undefined) ?? {};
      const next = { ...state, lastDeliverablesDebug: report } as LegacyFlowState;
      const stageId = row?.stages?.[0]?.id;
      if (stageId) {
        await this.prisma.$transaction([
          this.prisma.stage.update({
            where: { id: stageId },
            data: { legacyChangeState: next as object },
          }),
          this.prisma.project.update({
            where: { id: projectId },
            data: { legacyFlowState: next as object },
          }),
        ]);
      } else {
        await this.prisma.project.update({
          where: { id: projectId },
          data: { legacyFlowState: next as object },
        });
      }
    } catch (err) {
      this.logger.warn(
        `[LegacyDeliverables] persistDeliverablesDebugReport: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Construye el texto MDD alimentado a la cascada de entregables: MDD completo, **rollup por ventanas**
   * (varias llamadas LLM con trozos + ensamblado) si supera `LEGACY_DELIVERABLES_MDD_MAX_CHARS`, o truncado legacy
   * si `LEGACY_DELIVERABLES_MDD_ROLLUP=0` o falla una ventana.
   */
  private async buildLegacyDeliverablesMddForLlm(
    mdd: string,
    report: LegacyDeliverablesDebugReport,
  ): Promise<string> {
    const max = legacyDeliverablesMddMaxCharsForLlm();
    if (mdd.length <= max) {
      report.mddLlmStrategy = "full";
      report.mddCharsSentToLlm = mdd.length;
      report.mddClippedForLlm = false;
      report.mddRollupWindows = 0;
      return mdd;
    }
    if (!isLegacyDeliverablesMddRollupEnabled()) {
      report.mddRollupWindows = 0;
      return clipMddForLegacyDeliverablesLlm(mdd, report);
    }

    const chunkSize = legacyDeliverablesRollupChunkChars();
    const maxChunks = legacyDeliverablesRollupMaxChunks();
    const chunks = splitMddForRollupChunks(mdd, chunkSize, maxChunks);
    report.mddRollupWindows = chunks.length;
    report.mddLlmStrategy = "rollup";

    if (isLegacyDeliverablesDebugVerbose()) {
      this.logger.log(
        `[LegacyDeliverables] mdd_rollup windows=${chunks.length} chunkSize=${chunkSize} originalChars=${mdd.length}`,
      );
    }

    const parts: string[] = [];
    const prelude =
      "# Síntesis operacional del MDD (ventanas The Forge)\n\n" +
      "> Este documento fue **ensamblado por el backend** a partir de extracciones LLM **ventana por ventana** del MDD completo (" +
      String(mdd.length) +
      " caracteres). Úsalo como constitución efectiva para SPEC, Blueprint, etc. " +
      "El MDD íntegro permanece en el proyecto; aquí se intenta **no perder secciones** frente a un único `generateContent` gigante.\n\n";

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) {
        const gap = legacyDeliverablesInterStepDelayMs();
        if (gap > 0) await sleepMs(gap);
      }
      const chunk = chunks[i]!;
      const userPrompt =
        `Ventana **${i + 1} de ${chunks.length}** del MDD (Markdown). Extrae hechos según el system prompt.\n\n---\n\n` +
        chunk +
        "\n\n---\n\nResponde solo con el markdown de extracción.";
      try {
        const text = await runWithLegacy429Retries(
          () =>
            this.ai.generateResponse(userPrompt, [], {
              systemPrompt: LEGACY_MDD_ROLLUP_EXTRACTOR_SYSTEM,
              activeTab: "mdd",
            }),
          { logger: this.logger, step: `mdd_rollup_${i + 1}/${chunks.length}` },
        );
        parts.push(`## Ventana ${i + 1} / ${chunks.length}\n\n${(text ?? "").trim()}`);
      } catch (e) {
        this.logger.warn(
          `[LegacyDeliverables] mdd_rollup window ${i + 1}/${chunks.length} failed, fallback truncate — ${e instanceof Error ? e.message : String(e)}`,
        );
        report.mddRollupFailed = true;
        return clipMddForLegacyDeliverablesLlm(mdd, report);
      }
    }

    let rollupDoc = prelude + parts.join("\n\n---\n\n");
    if (rollupDoc.length > max) {
      const footer =
        "\n\n> **Nota:** La síntesis rollup superó `LEGACY_DELIVERABLES_MDD_MAX_CHARS` (" +
        String(max) +
        "); se recortó el **final** del documento ensamblado (las ventanas iniciales se conservan).\n";
      rollupDoc = rollupDoc.slice(0, Math.max(0, max - footer.length)) + footer;
      report.mddClippedForLlm = true;
    } else {
      report.mddClippedForLlm = false;
    }
    report.mddCharsSentToLlm = rollupDoc.length;
    return rollupDoc;
  }

  /**
   * Genera entregables según `Project.complexity` y `DELIVERABLES_BY_COMPLEXITY` (despacho dinámico).
   * Legacy inyecta contexto AriadneSpecs en cada llamada. No ejecuta generadores fuera de la lista (ahorra tokens).
   * @returns `lastDeliverablesDebug` — traza de pasos (también persistida en `legacyFlowState.lastDeliverablesDebug`).
   */
  async generateDeliverables(
    projectId: string,
    stageId?: string,
  ): Promise<{ ok: boolean; lastDeliverablesDebug: LegacyDeliverablesDebugReport }> {
    void stageId; // reservado para futuro per-stage deliverables
    const report: LegacyDeliverablesDebugReport = {
      startedAt: new Date().toISOString(),
      mddSource: "none",
      mddChars: 0,
      codebaseDocChars: 0,
      mddContentChars: 0,
      theforgeContextChars: 0,
      theforgeConfigured: this.theforge.isConfigured(),
      complexityEffective: ComplexityLevel.HIGH,
      deliverablesOrder: [],
      steps: [],
    };

    const pushStep = (step: Omit<LegacyDeliverablesDebugStep, "at"> & { at?: string }) => {
      const full: LegacyDeliverablesDebugStep = {
        ...step,
        at: step.at ?? new Date().toISOString(),
      };
      report.steps.push(full);
      if (isLegacyDeliverablesDebugVerbose()) {
        this.logger.log(
          `[LegacyDeliverables] step=${full.kind} ok=${full.ok} ms=${full.durationMs} outChars=${full.outChars ?? "-"} ${full.detail ?? ""} ${full.error ?? ""}`.trim(),
        );
      }
    };

    const markFatal = (err: unknown) => {
      report.finishedAt = new Date().toISOString();
      report.ok = false;
      const msg = err instanceof Error ? err.message : String(err);
      report.fatalError = {
        message: clipDebug(msg, 2000),
        stack: err instanceof Error ? clipDebug(err.stack ?? "", 4000) : undefined,
      };
    };

    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!row) throw new NotFoundException("Project not found");
    if (row.complexityPending != null) {
      throw new BadRequestException(
        "Hay una propuesta de complejidad pendiente de confirmación. Confirma o rechaza en el Workshop antes de generar entregables.",
      );
    }

    // enforceLegacyBrdTobeGate eliminado — To-Be y As-Is removidos
    await this.prisma
    const codebaseDoc = String((project as { legacyFlowState?: LegacyFlowState }).legacyFlowState?.codebaseDoc ?? "").trim();
    const mddContent = String(project.mddContent ?? "").trim();
    report.codebaseDocChars = codebaseDoc.length;
    report.mddContentChars = mddContent.length;
    report.mddSource = mddContent ? "mddContent" : codebaseDoc ? "codebaseDoc_fallback" : "none";
    const mdd =
      mddContent || (codebaseDoc ? `[Ingeniería inversa: documento del codebase existente. Genera entregables que describan el sistema AS-IS.]\n\n${codebaseDoc}` : "");
    report.mddChars = mdd.length;
    const mddForLlm = await this.buildLegacyDeliverablesMddForLlm(mdd, report);
    if (isLegacyDeliverablesDebugVerbose()) {
      this.logger.log(
        `[LegacyDeliverables] mdd_llm strategy=${report.mddLlmStrategy ?? "?"} originalChars=${report.mddChars} sentChars=${report.mddCharsSentToLlm ?? mddForLlm.length} rollupWindows=${report.mddRollupWindows ?? 0} clipped=${report.mddClippedForLlm ?? false} rollupFailed=${report.mddRollupFailed ?? false}`,
      );
    }

    const isReverseEngineering = !mddContent && !!codebaseDoc;
    pushStep({
      kind: "preflight",
      durationMs: 0,
      ok: !!mdd,
      detail:
        `reverseEngineering=${isReverseEngineering} mddSource=${report.mddSource} mddLlmStrategy=${report.mddLlmStrategy ?? "?"} rollupWindows=${report.mddRollupWindows ?? 0} clipped=${report.mddClippedForLlm ?? false} rollupFailed=${report.mddRollupFailed ?? false}`,
    });

    if (!mdd) {
      markFatal(new Error("missing_mdd_and_codebaseDoc"));
      await this.persistDeliverablesDebugReport(projectId, report);
      throw new BadRequestException("Genera la documentación de partida (MDD Inicial) o el MDD de cambio antes de generar entregables.");
    }

    const legacyState =
      ((project as { legacyFlowState?: LegacyFlowState | null }).legacyFlowState ?? {}) as LegacyFlowState;

    const tGate = Date.now();
    try {
      await this.assertLegacyIndexSddGate(projectId, theforgeId, legacyState);
      pushStep({ kind: "index_sdd_gate", durationMs: Date.now() - tGate, ok: true });
    } catch (err) {
      pushStep({
        kind: "index_sdd_gate",
        durationMs: Date.now() - tGate,
        ok: false,
        error: clipDebug(err instanceof Error ? err.message : String(err), 800),
      });
      markFatal(err);
      await this.persistDeliverablesDebugReport(projectId, report);
      if (isLegacyDeliverablesDebugVerbose()) this.logger.error(err);
      throw err;
    }

    const tTf = Date.now();
    const [theforgeContext, contractSpecs] = await Promise.all([
      this.theforge.getContextForDeliverables(theforgeId),
      this.theforge.gatherContractSpecsForApi(theforgeId),
    ]);
    report.theforgeContextChars = theforgeContext.length;
    pushStep({
      kind: "theforge_context",
      durationMs: Date.now() - tTf,
      ok: true,
      outChars: theforgeContext.length,
      detail: theforgeContext.trim() ? "non_empty" : "empty_string",
    });
    const legacyOpts: { theforgeContext?: string; contractSpecs?: string } | undefined =
      theforgeContext.trim() || contractSpecs.trim()
        ? {
            ...(theforgeContext.trim() ? { theforgeContext } : {}),
            ...(contractSpecs.trim() ? { contractSpecs } : {}),
          }
        : undefined;

    const run429 = <T>(fn: () => Promise<T>, step: string) =>
      runWithLegacy429Retries(fn, { logger: this.logger, step });

    const pushSectionMergeTrace = (t: LegacySectionMergeTrace) => {
      report.sectionMergeTraces = [...(report.sectionMergeTraces ?? []), t];
    };

    const pushStrategyDecision = (d: LegacyDeliverablesStrategyResolution) => {
      report.strategyDecisions = [...(report.strategyDecisions ?? []), d];
    };

    const resolveSectionMergeAttempt = async (
      kind: DeliverableKind,
      fields: Partial<Pick<LegacyDeliverablesStrategyContext, "blueprintText" | "specText" | "useCasesText">>,
    ): Promise<boolean> => {
      const d = await this.legacyDeliverablesStrategy.resolveSectionMergeAttempt(kind, {
        mddText: mddForLlm,
        theforgeContextText: theforgeContext,
        ...fields,
      });
      pushStrategyDecision(d);
      return d.attemptSectionMerge;
    };

    const update = async (data: Record<string, unknown>) => {
      await this.prisma.project.update({ where: { id: projectId }, data: data as object });
    };

    const load = async () => {
      const p = await this.prisma.project.findUnique({ where: { id: projectId } });
      if (!p) throw new NotFoundException("Project not found");
      return p;
    };

    let p = await load();
    const complexity = isReverseEngineering ? ComplexityLevel.HIGH : (row.complexity ?? ComplexityLevel.HIGH);
    const deliverablesToRun = DELIVERABLES_BY_COMPLEXITY[complexity];
    report.complexityEffective = complexity;
    report.deliverablesOrder = [...deliverablesToRun];

    const ensureBlueprint = async (): Promise<string> => {
      let bp = String(p.blueprintContent ?? "").trim();
      if (bp.length > 48) return bp;
      bp = await this.ai.generateBlueprint(mddForLlm, undefined, legacyOpts);
      await update({ blueprintContent: cleanDocumentContent(bp) });
      p = await load();
      return String(p.blueprintContent ?? "").trim();
    };

    const runStep = async (kind: DeliverableKind): Promise<void> => {
      switch (kind) {
        case "mdd_canonical":
          return;
        case "spec": {
          const sm = await trySectionMergeDeliverable(this.ai, "spec", mddForLlm, legacyOpts, {}, run429, this.logger, {
            attemptSectionMerge: await resolveSectionMergeAttempt("spec", {}),
          });
          if (sm) {
            pushSectionMergeTrace(sm.trace);
            await update({ specContent: cleanDocumentContent(sm.content) });
            p = await load();
            return;
          }
          const specContent = await this.ai.generateSpec(mddForLlm, null, "mdd", legacyOpts);
          await update({ specContent: cleanDocumentContent(specContent) });
          p = await load();
          return;
        }
        case "architecture": {
          const smArch = await trySectionMergeDeliverable(
            this.ai,
            "architecture",
            mddForLlm,
            legacyOpts,
            { blueprint: p.blueprintContent ?? undefined },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("architecture", {
                blueprintText: p.blueprintContent ?? undefined,
              }),
            },
          );
          if (smArch) {
            pushSectionMergeTrace(smArch.trace);
            await update({ architectureContent: cleanDocumentContent(smArch.content) });
            p = await load();
            return;
          }
          const architectureContent = await this.ai.generateArchitecture(
            mddForLlm,
            p.blueprintContent ?? undefined,
            legacyOpts,
          );
          await update({ architectureContent: cleanDocumentContent(architectureContent) });
          p = await load();
          return;
        }
        case "use_cases": {
          const smUc = await trySectionMergeDeliverable(
            this.ai,
            "use_cases",
            mddForLlm,
            legacyOpts,
            { spec: p.specContent ?? undefined },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("use_cases", {
                specText: p.specContent ?? undefined,
              }),
            },
          );
          if (smUc) {
            pushSectionMergeTrace(smUc.trace);
            await update({ useCasesContent: cleanDocumentContent(smUc.content) });
            p = await load();
            return;
          }
          const useCasesContent = await this.ai.generateUseCases(mddForLlm, p.specContent, legacyOpts);
          await update({ useCasesContent: cleanDocumentContent(useCasesContent) });
          p = await load();
          return;
        }
        case "blueprint": {
          const smBp = await trySectionMergeDeliverable(this.ai, "blueprint", mddForLlm, legacyOpts, {}, run429, this.logger, {
            attemptSectionMerge: await resolveSectionMergeAttempt("blueprint", {}),
          });
          if (smBp) {
            pushSectionMergeTrace(smBp.trace);
            await update({ blueprintContent: cleanDocumentContent(smBp.content) });
            p = await load();
            return;
          }
          const blueprintContent = await this.ai.generateBlueprint(mddForLlm, undefined, legacyOpts);
          await update({ blueprintContent: cleanDocumentContent(blueprintContent) });
          p = await load();
          return;
        }
        case "api_contracts": {
          const bp = await ensureBlueprint();
          const smApi = await trySectionMergeDeliverable(
            this.ai,
            "api_contracts",
            mddForLlm,
            legacyOpts,
            { blueprint: bp },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("api_contracts", {
                blueprintText: bp,
              }),
            },
          );
          if (smApi) {
            pushSectionMergeTrace(smApi.trace);
            await update({ apiContractsContent: cleanDocumentContent(smApi.content) });
            p = await load();
            return;
          }
          const apiContractsContent = await this.ai.generateApiContracts(mddForLlm, bp, undefined, undefined, legacyOpts);
          await update({ apiContractsContent: cleanDocumentContent(apiContractsContent) });
          p = await load();
          return;
        }
        case "logic_flows": {
          const smLf = await trySectionMergeDeliverable(
            this.ai,
            "logic_flows",
            mddForLlm,
            legacyOpts,
            {},
            run429,
            this.logger,
            { attemptSectionMerge: await resolveSectionMergeAttempt("logic_flows", {}) },
          );
          if (smLf) {
            pushSectionMergeTrace(smLf.trace);
            await update({ logicFlowsContent: cleanDocumentContent(smLf.content) });
            p = await load();
            return;
          }
          const logicFlowsContent = await this.ai.generateLogicFlows(mddForLlm, undefined, legacyOpts);
          await update({ logicFlowsContent: cleanDocumentContent(logicFlowsContent) });
          p = await load();
          return;
        }
        case "ux_ui_guide": {
          const bpUx = String(p.blueprintContent ?? "").trim() || (await ensureBlueprint());
          const smUx = await trySectionMergeDeliverable(
            this.ai,
            "ux_ui_guide",
            mddForLlm,
            legacyOpts,
            { blueprint: bpUx },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("ux_ui_guide", {
                blueprintText: bpUx,
              }),
            },
          );
          if (smUx) {
            pushSectionMergeTrace(smUx.trace);
            const uxClean = smUx.content.replace(/\n---FIN_UX_UI---.*/s, "").trim();
            await update({ uxUiGuideContent: cleanDocumentContent(uxClean) });
            p = await load();
            return;
          }
          let uxPrompt =
            "Genera la Guía UX/UI en markdown según el system prompt. MDD:\n---\n" +
            mddForLlm.slice(0, 8000) +
            "\n---\n\nBlueprint:\n---\n" +
            bpUx.slice(0, 4000) +
            "\n---";
          if (theforgeContext) {
            uxPrompt =
              "**Contexto del codebase (TheForge) — priorizar y usar antes de elaborar:**\n---\n" +
              theforgeContext.slice(0, mddTheforgeContextMaxChars()) +
              "\n---\n\n**Regla obligatoria (legacy):** No inventes nada. Apégate al MDD y únicamente al conocimiento del codebase (TheForge) proporcionado arriba.\n\n**Instrucción:** Usa TODO el conocimiento anterior para alinear la guía con lo que ya existe. A continuación, MDD y Blueprint.\n\n" +
              uxPrompt;
          }
          // Extraer tokens de diseño reales del codebase (herramienta MCP extract_design_tokens)
          try {
            const raw = await this.theforge.extractDesignTokens(theforgeId);
            if (raw.trim()) {
              const parsed = JSON.parse(raw) as {
                foundTailwind?: boolean;
                foundCssCustomProps?: boolean;
                foundThemeFile?: boolean;
                tailwindTokens?: Record<string, string>;
                cssTokens?: Record<string, string>;
                summary?: string;
              } | null;
              if (parsed?.summary?.trim()) {
                const hasTokens = parsed.foundTailwind || parsed.foundCssCustomProps || parsed.foundThemeFile;
                if (hasTokens) {
                  uxPrompt =
                    "**Tokens de diseño extraídos del codebase — usar como valores reales:**\\n---\\n" +
                    (parsed.summary ?? "").slice(0, 6000) +
                    "\\n---\\n\\n" +
                    uxPrompt;
                }
              }
            }
          } catch {
            // Si falla la extracción, continuar sin tokens — no bloquear la generación
            this.logger.warn("[Legacy UX/UI] Design token extraction via MCP tool skipped (error, continuing without tokens)");
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
          const smUs = await trySectionMergeDeliverable(
            this.ai,
            "user_stories",
            mddForLlm,
            legacyOpts,
            { spec: p.specContent ?? undefined, useCases: p.useCasesContent ?? undefined },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("user_stories", {
                specText: p.specContent ?? undefined,
                useCasesText: p.useCasesContent ?? undefined,
              }),
            },
          );
          if (smUs) {
            pushSectionMergeTrace(smUs.trace);
            await update({ userStoriesContent: cleanDocumentContent(smUs.content) });
            p = await load();
            return;
          }
          const userStoriesContent = await this.ai.generateUserStories(
            mddForLlm,
            p.specContent,
            p.useCasesContent,
            legacyOpts,
          );
          await update({ userStoriesContent: cleanDocumentContent(userStoriesContent) });
          p = await load();
          return;
        }
        case "agent_governance": {
          const bpGov = p.blueprintContent?.trim() || undefined;
          const govSuggestions = suggestAgentGovernanceArtifacts({
            mddMarkdown: mddForLlm,
            blueprintMarkdown: bpGov,
            complexity,
          });
          const raw = await this.ai.generateAgentGovernance(mddForLlm, bpGov, complexity, {
            ...legacyOpts,
            suggestions: govSuggestions,
          });
          const scaffold = parseAgentGovernanceResponse(raw, complexity, {
            suggestions: govSuggestions,
            mddMarkdown: mddForLlm,
          });
          await update({ agentGovernanceContent: serializeAgentGovernanceScaffold(scaffold) });
          p = await load();
          return;
        }
        case "tasks": {
          const bpTasks = p.blueprintContent?.trim();
          const smTk = await trySectionMergeDeliverable(
            this.ai,
            "tasks",
            mddForLlm,
            legacyOpts,
            { blueprint: bpTasks || undefined },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("tasks", {
                blueprintText: bpTasks || undefined,
              }),
            },
          );
          if (smTk) {
            pushSectionMergeTrace(smTk.trace);
            await update({ tasksContent: cleanDocumentContent(smTk.content) });
            p = await load();
            return;
          }
          const tasksContent = await this.ai.generateTasks(mddForLlm, bpTasks || undefined, legacyOpts);
          await update({ tasksContent: cleanDocumentContent(tasksContent) });
          p = await load();
          return;
        }
        case "infra": {
          const bpInf = await ensureBlueprint();
          const smIf = await trySectionMergeDeliverable(
            this.ai,
            "infra",
            mddForLlm,
            legacyOpts,
            { blueprint: bpInf },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("infra", {
                blueprintText: bpInf,
              }),
            },
          );
          if (smIf) {
            pushSectionMergeTrace(smIf.trace);
            await update({ infraContent: cleanDocumentContent(smIf.content) });
            p = await load();
            return;
          }
          const infraContent = await this.ai.generateInfra(mddForLlm, bpInf, undefined, legacyOpts);
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

    const largeMddCooldown = legacyDeliverablesLargeMddCooldownMs(report.mddChars);
    if (largeMddCooldown > 0) {
      if (isLegacyDeliverablesDebugVerbose()) {
        this.logger.log(
          `[LegacyDeliverables] throttle large_mdd_cooldown_ms=${largeMddCooldown} mddChars=${report.mddChars}`,
        );
      }
      await sleepMs(largeMddCooldown);
    }

    let didRunLlmDeliverableStep = false;
    for (const kind of deliverablesToRun) {
      if (kind === "mdd_canonical") {
        pushStep({ kind: "mdd_canonical", durationMs: 0, ok: true, detail: "noop" });
        continue;
      }
      const interStepMs = legacyDeliverablesInterStepDelayMs();
      if (didRunLlmDeliverableStep && interStepMs > 0) {
        if (isLegacyDeliverablesDebugVerbose()) {
          this.logger.log(`[LegacyDeliverables] throttle inter_step_ms=${interStepMs} before=${kind}`);
        }
        await sleepMs(interStepMs);
      }
      didRunLlmDeliverableStep = true;

      const t0 = Date.now();
      try {
        await runWithLegacy429Retries(() => runStep(kind), { logger: this.logger, step: kind });
        p = await load();
        const outChars = deliverableFieldCharCount(p as Record<string, unknown>, kind);
        const short = outChars < 48;
        pushStep({
          kind,
          durationMs: Date.now() - t0,
          ok: true,
          outChars,
          detail: short ? "output_under_48_chars" : undefined,
        });
      } catch (err) {
        pushStep({
          kind,
          durationMs: Date.now() - t0,
          ok: false,
          error: clipDebug(err instanceof Error ? err.message : String(err), 800),
        });
        markFatal(err);
        this.logger.error(`[LegacyDeliverables] FATAL step=${kind} — ${err instanceof Error ? err.message : String(err)}${err instanceof Error && err.stack ? `\n${err.stack.slice(0, 2000)}` : ""}`);
        if (isLegacy429Like(err)) {
          report.upstreamRateLimited = true;
          report.retryAfterSeconds = readRetryAfterSecondsFromErrorHeaders(err) ?? 60;
        }
        await this.persistDeliverablesDebugReport(projectId, report);
        if (isLegacyDeliverablesDebugVerbose()) this.logger.error(err);
        const rateLimited = upstreamLlmRateLimitHttpException(err, report);
        if (rateLimited) throw rateLimited;
        throw err;
      }
    }

    report.finishedAt = new Date().toISOString();
    report.ok = true;
    report.deliverablesWithBody = report.steps.filter(
      (s) =>
        typeof s.outChars === "number" &&
        s.outChars > 48 &&
        s.kind !== "preflight" &&
        s.kind !== "index_sdd_gate" &&
        s.kind !== "theforge_context" &&
        s.kind !== "mdd_canonical",
    ).length;

    await this.persistDeliverablesDebugReport(projectId, report);
    const elapsed = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
    this.logger.log(
      `[LegacyDeliverables] cascade_ok project=${projectId.slice(0, 8)}… steps=${report.steps.length} withBody=${report.deliverablesWithBody} tfCtxChars=${report.theforgeContextChars} elapsedMs=${elapsed}`,
    );

    return { ok: true, lastDeliverablesDebug: report };
  }

  /** Mapping de tipo de documento a campo de proyecto. */
  private static readonly DOCUMENT_TYPE_FIELD: Record<string, string> = {
    spec: "specContent",
    architecture: "architectureContent",
    "use-cases": "useCasesContent",
    "user-stories": "userStoriesContent",
    blueprint: "blueprintContent",
    "api-contracts": "apiContractsContent",
    "logic-flows": "logicFlowsContent",
    tasks: "tasksContent",
    infra: "infraContent",
  };

  /** Prompt de generación por tipo de documento (español). */
  private static readonly DOCUMENT_TYPE_PROMPTS: Record<string, string> = {
    spec:
      "A partir de la documentación del codebase (codebaseDoc) de un proyecto existente, genera un documento SPEC que describa: qué hace el sistema, sus funcionalidades principales, objetivos de negocio, stack tecnológico, y arquitectura de alto nivel. Basa todo en la evidencia del codebaseDoc.",
    architecture:
      "A partir de la documentación del codebase, genera un documento de ARQUITECTURA que describa: estructura de módulos, patrones de diseño, flujo de datos, base de datos, APIs externas, y diagrama de componentes. Basa todo en la evidencia.",
    "use-cases":
      "A partir de la documentación del codebase, genera CASOS DE USO describiendo: actores, flujos principales, flujos alternativos, y pre/post condiciones. Basa todo en la evidencia.",
    "user-stories":
      "A partir de la documentación del codebase, genera HISTORIAS DE USUARIO en formato 'Como [rol], quiero [funcionalidad] para [beneficio]'. Basa todo en la evidencia.",
    blueprint:
      "A partir de la documentación del codebase, genera un BLUEPRINT con: modelo de datos, entidades, relaciones, atributos, y restricciones. Basa todo en la evidencia.",
    "api-contracts":
      "A partir de la documentación del codebase, genera CONTRATOS DE API listando: endpoints, métodos HTTP, request/response, autenticación, y ejemplos. Basa todo en la evidencia.",
    "logic-flows":
      "A partir de la documentación del codebase, genera FLUJOS DE LÓGICA describiendo: reglas de negocio, validaciones, estados, transiciones, y secuencias. Basa todo en la evidencia.",
    tasks:
      "A partir de la documentación del codebase, genera TASKS desglosando: módulos, funcionalidades, y tareas técnicas. Basa todo en la evidencia.",
    infra:
      "A partir de la documentación del codebase, genera INFRAESTRUCTURA describiendo: Docker, servicios, base de datos, despliegue, y configuración. Basa todo en la evidencia.",
  };

  /**
   * Genera un documento individual a partir del codebaseDoc del proyecto legacy.
   * Lee el codebaseDoc (ya sea de legacyFlowState del proyecto o de la etapa),
   * llama al LLM para generar el contenido del tipo solicitado y lo persiste.
   *
   * @param projectId - ID del proyecto.
   * @param documentType - Tipo de documento (spec, architecture, use-cases, user-stories, blueprint, api-contracts, logic-flows, tasks, infra).
   * @param stageId - Etapa base opcional (por defecto resuelve la etapa legacy).
   * @returns Objeto con el contenido generado y el campo persistido.
   */
  async generateFromCodebase(
    projectId: string,
    documentType: string,
    stageId?: string,
  ): Promise<{ content: string; field: string }> {
    await this.getLegacyProject(projectId);

    const field = LegacyCoordinatorService.DOCUMENT_TYPE_FIELD[documentType];
    if (!field) {
      throw new BadRequestException(
        `Tipo de documento no soportado: ${documentType}`,
      );
    }

    // Resolver etapa
    const stage = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);

    // Leer proyecto con stages incluidos
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { stages: true },
    });
    if (!project) {
      throw new NotFoundException(`Proyecto ${projectId} no encontrado`);
    }

    // Obtener codebaseDoc desde stage o project
    const state = this.getLegacyChangeState(stage, project);
    const codebaseDoc = String(state.codebaseDoc ?? "").trim();

    if (codebaseDoc.length < 300) {
      throw new BadRequestException(
        "Se requiere documentación de partida del codebase (mín. ~300 caracteres). Ejecuta primero generate-codebase-doc.",
      );
    }

    // Construir prompt
    const typePrompt = LegacyCoordinatorService.DOCUMENT_TYPE_PROMPTS[documentType];
    const codebaseChunk = codebaseDoc.slice(0, 120_000);
    const prompt = `${typePrompt}\n\n--- codebaseDoc ---\n\n${codebaseChunk}`;

    // Llamar al LLM
    const llm = await this.aiFactory.createForUser(getRequestUserId());
    const raw = await llm.generateResponse(prompt, [], {
      systemPrompt:
        "Eres un analista de software experto. Genera documentación técnica precisa basada en el codebase proporcionado.",
    });

    const content = cleanDocumentContent(raw ?? "");

    // Persistir en el proyecto
    await this.prisma.project.update({
      where: { id: projectId },
      data: { [field]: content },
    });

    this.logger.log(
      `[LegacyCoordinator] generateFromCodebase project=${projectId.slice(0, 8)}… type=${documentType} field=${String(field)} chars=${content.length}`,
    );

    return { content, field: String(field) };
  }
}
