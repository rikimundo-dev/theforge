import {
  BadRequestException,
  ConflictException,
  forwardRef,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ComplexityLevel, type Project as DbProject } from "@theforge/database";
import {
  DELIVERABLES_BY_COMPLEXITY,
  DELIVERABLE_STEP_LABELS,
  getLegacyChangeState,
  planLegacyDeliverablesToGenerate,
  type DeliverableKind,
  type GenerateCodebaseDocRequest,
} from "@theforge/shared-types";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ProjectIntegrationService } from "../projects/integration/project-integration.service.js";
import { buildHandoffPromptBlockForLegacyChange } from "../projects/integration/integration-context.util.js";
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
import {
  appendComponentDiagramToCodebaseDoc,
  injectComponentDiagramIntoMddSection2,
  isLegacyComponentDiagramEnabled,
} from "./legacy-component-diagram.util.js";
import {
  injectAsIsCodebaseEvidenceIntoMdd,
  isLegacyAsIsMddEvidenceInjectEnabled,
} from "./legacy-as-is-mdd-inject.util.js";
import { AgentSupervisorService } from "../agent-supervisor/agent-supervisor.service.js";
import { runLegacyStagedDiscoveryMddAgent } from "./legacy-staged-discovery-agent.js";
import { GraphMemoryService } from "../ai-analysis/graph-memory/graph-memory.service.js";
import { evaluateLegacyIndexSddGate } from "./legacy-index-sdd-alignment.util.js";
import { isLegacyBaselineStage, pickPrimaryStage } from "../projects/stage-helpers.js";
import {
  appendLegacyBaselineBrdDetailPrompt,
  appendLegacyBaselineDetailPrompt,
} from "../ai/utils/legacy-baseline-detail.util.js";
import { resolveLegacyBaselineStageFlag } from "../ai/utils/legacy-as-is-spec.util.js";
import {
  extractSection5Services,
  readLogicFlowsBatchSize,
  scoreLogicFlowsSection5Coverage,
  toLogicFlowsSection5CoverageReport,
  type LogicFlowsSection5CoverageReport,
} from "../ai/utils/legacy-as-is-logic-flows.util.js";
import { AiService } from "../ai/ai.service.js";
import { LegacyReviewerService } from "./legacy-reviewer.service.js";
import { loadLegacyKnowledgePack } from "./knowledge-loader.js";
import { cleanDocumentContent } from "../sessions/document-content.util.js";
import {
  documentPersistFieldLabel,
  validateDocumentForPersist,
} from "../sessions/document-shrink.util.js";
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
import {
  BRD_BUSINESS_INVENTORY_SYSTEM,
  buildLegacyBrdBusinessInventoryPrompt,
  prepareLegacyCodebaseDocForBrdPrompt,
} from "../ai/utils/brd-legacy-source.util.js";
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
import {
  normalizeLegacyMddV1JsonBlocksInMarkdown,
  compactCodebaseDocForMddPrompt,
} from "../theforge/legacy-mdd-v1-markdown.util.js";
import { trySectionMergeDeliverable } from "./legacy-section-merge-deliverables.runner.js";
import type { LegacySectionMergeTrace } from "./legacy-section-merge.types.js";
import { mergeLegacyTasksGenerateOptions } from "./legacy-generate-options.util.js";
import { LegacyDeliverablesStrategyService } from "./legacy-deliverables-strategy/legacy-deliverables-strategy.service.js";
import type {
  LegacyDeliverablesStrategyContext,
  LegacyDeliverablesStrategyResolution,
} from "./legacy-deliverables-strategy/legacy-deliverables-strategy.types.js";
import {
  composeBrdPreamble,
} from "../ai-analysis/utils/brd-tobe-gate.util.js";
import { assertLegacyChangeGate } from "./legacy-change-gate.util.js";
import { persistStageDeliverableSnapshotFromProject } from "../projects/stage-deliverable-snapshot.util.js";
import { persistStageAndProjectDeliverables } from "../projects/stage-deliverable-persist.util.js";

const KNOWLEDGE = loadLegacyKnowledgePack();

/** Respuesta de `generate-codebase-doc` cuando el API tiene trazas MCP (debug UI). */
export type GenerateCodebaseDocResponse = {
  codebaseDoc: string;
  mddContent?: string;
  mcpDebugTrace?: McpUiDebugEntry[];
};

function isLegacyAutoGenerateMddAfterCodebaseDocEnabled(): boolean {
  const v = process.env.LEGACY_AUTO_GENERATE_MDD_AFTER_CODEBASE_DOC?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type LegacyIndexSddResolutionChoice = "trust_index" | "trust_sdd" | "proceed_with_warnings";

/** Paso de la cascada legacy de entregables (telemetría / depuración). */
export type LegacyDeliverablesDebugStepKind =
  | "preflight"
  | "preflight_plan"
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
  /** Pipeline bulk alineado con regen individual del Workshop. */
  pipelineMode?: LegacyDeliverablesPipelineMode;
  /** Etapa 1 AS-IS: entregables con MDD completo (sin section merge ni truncado). */
  legacyBaselineStage?: boolean;
  /** Cobertura heurística servicios §5 vs flujos generados (etapa 1). */
  logicFlowsSection5Coverage?: LogicFlowsSection5CoverageReport;
}

/** Modo de generación en cascada bulk — paridad con endpoints individuales. */
export type LegacyDeliverablesPipelineMode =
  | "projects_generate_document"
  | "generate_from_codebase"
  | "legacy_run_step_fallback";

/** Entregable → tipo `POST …/legacy/generate-from-codebase` (kebab-case). */
const DELIVERABLE_KIND_TO_CODEBASE_DOC_TYPE: Partial<Record<DeliverableKind, string>> = {
  spec: "spec",
  architecture: "architecture",
  use_cases: "use-cases",
  user_stories: "user-stories",
  blueprint: "blueprint",
  api_contracts: "api-contracts",
  logic_flows: "logic-flows",
  tasks: "tasks",
  infra: "infra",
};


function buildReverseEngineeringMddForLegacySteps(
  codebaseDoc: string,
  report: LegacyDeliverablesDebugReport,
): string {
  const compact = compactCodebaseDocForMddPrompt(codebaseDoc);
  const wrapped =
    "[Ingeniería inversa: documento del codebase existente. Genera entregables que describan el sistema AS-IS.]\n\n" +
    compact;
  report.mddRollupWindows = 0;
  report.mddRollupFailed = false;
  report.mddLlmStrategy = "full";
  report.mddCharsSentToLlm = wrapped.length;
  report.mddClippedForLlm = false;
  return wrapped;
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

function mddTheforgeContextBlock(theforgeContext: string): string {
  return theforgeContext.trim();
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

/** Respuesta de `POST …/legacy/generate-mdd` (ligera por defecto; evita multi‑MB en el wire). */
export type LegacyGenerateMddResponse = {
  ok: true;
  persisted: true;
  mddLength: number;
  wordCount: number;
  stageId?: string;
  /** Solo si `?includeContent=true` (MCP/debug). */
  mddContent?: string;
};

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
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
    private readonly theforge: TheForgeService,
    private readonly ai: AiService,
    private readonly reviewer: LegacyReviewerService,
    private readonly graphMemory: GraphMemoryService,
    private readonly agentSupervisor: AgentSupervisorService,
    private readonly legacyDeliverablesStrategy: LegacyDeliverablesStrategyService,
    @Inject(forwardRef(() => ProjectIntegrationService))
    private readonly projectIntegration: ProjectIntegrationService,
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
   * Lee el estado de cambio legacy desde `Stage.legacyChangeState`.
   */
  private readLegacyChangeState(stage: { legacyChangeState?: unknown } | null): LegacyFlowState {
    return getLegacyChangeState(stage) as LegacyFlowState;
  }

  /** Persists legacy change state on the active stage (single write). */
  async persistLegacyChangeState(projectId: string, stageId: string, state: LegacyFlowState): Promise<void> {
    void projectId;
    await this.prisma.stage.update({
      where: { id: stageId },
      data: { legacyChangeState: state as object },
    });
  }

  // enforceLegacyBrdTobeGate eliminado — To-Be y As-Is removidos del sistema

  /**
   * Sincroniza la etapa legacy actual al grafo FalkorDB (nodo :LegacyStage).
   * No crítico — fallos se loguean como warning y no interrumpen el flujo.
   */
  /**
   * Navigation map from Ariadne MCP (same cap as `ProjectsService.fetchNavigationMap`).
   */
  private async fetchNavigationMapForTasks(theforgeId: string): Promise<string | undefined> {
    try {
      const content = await this.theforge.fetchNavigationMap(theforgeId);
      if (!content || content.length < 200) return undefined;
      return content;
    } catch {
      return undefined;
    }
  }

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
    await this.getLegacyProject(projectId);
    const gateStageResolved = stageIdHint?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageIdHint.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const state = this.readLegacyChangeState(gateStageResolved);
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
            baseline.brdContent.trim() +
            "\n\n---\n\n**Instrucción:** El BRD debe centrarse SOLO en el cambio respecto a esta línea base. " +
            "No redescribas el sistema completo.\n\n---\n\n";
        }
      } catch { /* non-critical */ }
    }
    const isInitialLegacyStage = isLegacyBaselineStage(stage);
    const sourcePrep = prepareLegacyCodebaseDocForBrdPrompt(codebaseDoc, {
      legacyBaselineStage: isInitialLegacyStage,
    });
    let brdSourceDocument = sourcePrep.text;
    let sourceTruncated = sourcePrep.truncated;

    if (isInitialLegacyStage && sourcePrep.needsInventoryPass) {
      console.log(
        `[suggestBrdFromCodebaseDoc] inventario previo (truncated=${sourcePrep.truncated} entities=${sourcePrep.entityCount} services=${sourcePrep.serviceCount} len=${sourcePrep.text.length} baseline=${isInitialLegacyStage})`,
      );
      const inventoryRaw = await this.ai.generateResponse(
        buildLegacyBrdBusinessInventoryPrompt(sourcePrep.text, isInitialLegacyStage),
        [],
        {
          systemPrompt: appendLegacyBaselineBrdDetailPrompt(
            BRD_BUSINESS_INVENTORY_SYSTEM,
            isInitialLegacyStage,
          ),
        },
      );
      const inventory = cleanDocumentContent(inventoryRaw ?? "").trim();
      if (inventory.length >= 400) {
        brdSourceDocument =
          "## Inventario de negocio (extracción previa — cubrir TODO en el BRD)\n\n" +
          inventory +
          "\n\n---\n\n## Documento de partida (referencia)\n\n" +
          sourcePrep.text;
      }
    }

    const brdPromptBase = appendLegacyBaselineBrdDetailPrompt(
      buildBrdUserPrompt({
        mode: isInitialLegacyStage ? "legacy-as-is" : "legacy-change",
        sourceLabel: "DOCUMENTO",
        sourceDocument: brdSourceDocument,
        baselineBrdBlock: baselineBrdBlock || undefined,
      }),
      isInitialLegacyStage,
    );

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
  ): Promise<{ codebaseDoc: string; mddContent?: string } | null> {
    const { theforgeId } = await this.getLegacyProject(projectId);
    if (!this.theforge.isConfigured()) return null;

    const resolvedStage = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : null;
    const legacyState = resolvedStage
      ? this.readLegacyChangeState(resolvedStage)
      : {};
    /** Gate índice ↔ SDD Falkor local (siempre antes de doc. partida). */
    await this.assertLegacyIndexSddGate(projectId, theforgeId, legacyState);

    if (req?.responseMode) {
      this.logger.warn(
        `generateCodebaseDoc: responseMode="${req.responseMode}" ignorado — doc. partida usa generate_legacy_documentation (modo único MCP).`,
      );
    }

    let codebaseDoc = "";
    const raw = (await this.theforge.generateLegacyDocumentation(theforgeId))?.trim() ?? "";
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
      codebaseDoc = normalizeLegacyMddV1JsonBlocksInMarkdown(codebaseDoc);
      codebaseDoc = normalizeRawEvidenceJsonBlocksInMarkdown(codebaseDoc);
      if (isLegacyComponentDiagramEnabled()) {
        codebaseDoc = appendComponentDiagramToCodebaseDoc(codebaseDoc);
      }
    }

    const persistStage = stageId?.trim()
      ? (resolvedStage ?? await this.resolveLegacyGateStage(projectId))
      : await this.resolveLegacyGateStage(projectId);
    const state = this.readLegacyChangeState(persistStage);
    const nextLegacy = { ...state, codebaseDoc } as LegacyFlowState;
    if (persistStage?.id) {
      await this.persistLegacyChangeState(projectId, persistStage.id, nextLegacy);
    } else {
      throw new BadRequestException("No hay etapa para persistir documentación de partida.");
    }
    const response: {
      codebaseDoc: string;
      mddGenerated?: boolean;
      mddLength?: number;
      mddWordCount?: number;
    } = { codebaseDoc };
    if (isLegacyAutoGenerateMddAfterCodebaseDocEnabled() && codebaseDoc.trim().length >= 300) {
      try {
        const mdd = await this.generateMdd(projectId, stageId?.trim(), { includeContent: false });
        response.mddGenerated = true;
        response.mddLength = mdd.mddLength;
        response.mddWordCount = mdd.wordCount;
      } catch (err) {
        this.logger.warn(
          `generateCodebaseDoc: auto generateMdd falló (LEGACY_AUTO_GENERATE_MDD_AFTER_CODEBASE_DOC=1): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return response;
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
    const gateStageForResolution = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const state = this.readLegacyChangeState(gateStageForResolution);
    const legacyIndexSddResolution: LegacyFlowState["legacyIndexSddResolution"] = {
      choice,
      resolvedAt: new Date().toISOString(),
    };
    const next = { ...state, legacyIndexSddResolution };
    if (gateStageForResolution?.id) {
      await this.persistLegacyChangeState(projectId, gateStageForResolution.id, next);
    } else {
      throw new BadRequestException("No hay etapa para persistir resolución índice/SDD.");
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
    const state = this.readLegacyChangeState(stage);
    const next = { ...state, codebaseDoc } as LegacyFlowState;
    if (stage?.id) {
      await this.persistLegacyChangeState(projectId, stage.id, next);
    } else {
      throw new BadRequestException("No hay etapa para persistir documentación de partida.");
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
      throw new BadRequestException("No hay etapa para persistir el inicio del flujo legacy.");
    }
    return { filesToModify, questions, suggestedAnswers: Object.keys(suggestedAnswers).length > 0 ? suggestedAnswers : undefined };
  }

  /**
   * Registra las respuestas del usuario a las preguntas del flujo. Persiste en legacyFlowState.answers.
   * @param projectId - ID del proyecto.
   * @param answers - Mapa índice de pregunta → respuesta (p. ej. { "0": "10", "1": "30" }).
   */
  async answer(projectId: string, answers: Record<string, string>, stageId?: string): Promise<{ ok: boolean }> {
    await this.getLegacyProject(projectId);
    const gateStageForAnswer = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);
    const prev = this.readLegacyChangeState(gateStageForAnswer);
    const next: LegacyFlowState = { ...prev, answers };
    if (gateStageForAnswer?.id) {
      await this.persistLegacyChangeState(projectId, gateStageForAnswer.id, next);
      await this.syncCurrentLegacyStageToGraph(projectId, gateStageForAnswer.id).catch(() => {});
    } else {
      throw new BadRequestException("No hay etapa para persistir respuestas del flujo legacy.");
    }
    return { ok: true };
  }

  /**
   * Genera el MDD de cambio a partir de la descripción, archivos, respuestas del usuario y contexto AriadneSpecs (múltiples ask_codebase).
   * Persiste el resultado en mddContent del proyecto.
   * Por defecto la respuesta HTTP es **ligera** (metadatos); el cliente debe `GET /projects/:id` para el markdown.
   * @param projectId - ID del proyecto.
   */
  async generateMdd(
    projectId: string,
    stageId?: string,
    options?: { includeContent?: boolean },
  ): Promise<LegacyGenerateMddResponse> {
    const { project, theforgeId } = await this.getLegacyProject(projectId);
    const gateStage = stageId?.trim()
      ? (await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })) ?? await this.resolveLegacyGateStage(projectId)
      : await this.resolveLegacyGateStage(projectId);
    const state = this.readLegacyChangeState(gateStage);
    const description = state.description ?? "";
    const files = normalizeFilesToModify(state.filesToModify, theforgeId);
    const answers = state.answers ?? {};
    const answersText = Object.entries(answers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const isInitialMdd = isLegacyBaselineStage(gateStage);
    assertLegacyChangeGate(gateStage);
    if (gateStage) {
      const dbProject = await this.prisma.project.findFirst({
        where: { id: projectId },
        include: { stages: { orderBy: { ordinal: "asc" } } },
      });
      if (dbProject) {
        this.projectIntegration.assertHandoffGateForLegacyMdd(dbProject, {
          ordinal: gateStage.ordinal,
          handoffImportedAt: gateStage.handoffImportedAt ?? null,
        });
      }
    }
    const integrationPromptCtx = await this.projectIntegration.resolvePromptContext(
      projectId,
      gateStage?.id,
    );
    const handoffMddBlock =
      !isInitialMdd && integrationPromptCtx.handoffItems.length && integrationPromptCtx.newProjectMeta
        ? buildHandoffPromptBlockForLegacyChange({
            newProjectId: integrationPromptCtx.newProjectMeta.id,
            newProjectName: integrationPromptCtx.newProjectMeta.name,
            items: integrationPromptCtx.handoffItems,
          }) + "\n\n---\n\n"
        : "";
    const descTermsGate = description.slice(0, 160).replace(/[^\w\s]/g, " ").trim();
    const gateSemanticQueries =
      !isInitialMdd && descTermsGate.length > 2
        ? [`${descTermsGate} modules services handlers components routes`, ...DEFAULT_SEMANTIC_QUERIES]
        : [...DEFAULT_SEMANTIC_QUERIES];
    await this.assertLegacyIndexSddGate(projectId, theforgeId, state, { semanticQueries: gateSemanticQueries });
    // Etapa 1 = AS-IS: el BRD no debe empujar lenguaje de modificación al MDD (solo etapas 2+).
    const brdPre =
      !isInitialMdd && gateStage?.brdContent ? composeBrdPreamble(gateStage.brdContent) : "";

    // Múltiples consultas a TheForge para contexto amplio (evidencia del índice + ask_codebase + refactor seguro)
    const theforgeParts: string[] = [];
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
    if (!isInitialMdd && description.trim()) {
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
    if (!isInitialMdd) {
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
        if (content.trim()) theforgeParts.push(`Contenido de ${f.path}:\n` + content.trim());
      }
    }
    const theforgeContext = theforgeParts.join("\n\n---\n\n");
    const filesLine = files.length > 0
      ? "Archivos a modificar (path" + (files.some((x) => x.repoId) ? ", repoId" : "") + "):\n" +
        files.map((f) => (f.repoId ? `${f.path} (repoId: ${f.repoId})` : f.path)).join("\n") + "\n\n"
      : "";
    const codebaseDoc = ((state.codebaseDoc ?? "") as string).trim();
    const codebaseDocBlock = codebaseDoc.length >= 80
      ? "## Documentación de partida — MDD inicial del codebase (Ariadne)\n\n" +
        compactCodebaseDocForMddPrompt(codebaseDoc) +
        "\n\n---\n\n"
      : "";
    const pathGroundingRulesBaseline =
      "**Rutas:** Usa paths **exactamente** como aparecen en la doc. de partida (`src/api/…`, `src/Models/…`, `src/…`). " +
      "PROHIBIDO inventar prefijos (`backend/`, `frontend/`) ni bundles/API no listados en entidades, contratos API o rutas de evidencia. " +
      "Entidades frontend (`source: frontend`) y contratos `apiDirection` cuentan como evidencia válida para el cliente OBP. " +
      "Si falta evidencia, documéntalo como brecha — no inventes ni proyectes cambios futuros.\n\n";
    const pathGroundingRulesChange =
      pathGroundingRulesBaseline +
      "Si una funcionalidad del BRD no tiene evidencia en el índice, márcala como brecha/pendiente — no la implementes en el MDD como existente.\n\n";
    let prompt: string;
    if (isInitialMdd) {
      // Etapa 1 → MDD AS-IS del sistema completo (no de cambio), aunque exista description en legacyChangeState
      prompt =
        codebaseDocBlock +
        "Genera un documento MDD inicial (Markdown) para un proyecto legacy. " +
        "El MDD describe **el sistema existente en su totalidad (AS-IS)**, no un cambio ni un MVP futuro. " +
        "Debe tener **exactamente 7 secciones** en este orden: " +
        "1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, 4. Contratos de API, 5. Lógica y Edge Cases, " +
        "6. Seguridad, 7. Infraestructura.\n\n" +
        "**§1 Contexto (AS-IS obligatorio):** Propósito y alcance = qué es el sistema **hoy**, quién lo usa y qué hace **en producción**. " +
        "PROHIBIDO: «modificar el sistema», «incorporar funcionalidades del BRD/MVP», alcance de cambio, objetivos de implementación futura. " +
        "Las funcionalidades no documentadas o gaps van en «Brechas de información» o notas neutras, **no** como propósito del documento.\n\n" +
        "**§2 obligatorio:** incluye `### Diagrama de Componentes` con un bloque ```mermaid (flowchart) " +
        "que refleje capas reales del codebase (frontend, API/backend, persistencia) usando solo evidencia de la doc. de partida.\n\n" +
        "**§3 Modelo de Datos (AS-IS exhaustivo):** documenta **cada entidad** de la doc. de partida en tablas " +
        "(Entidad | Origen | Atributos). PROHIBIDO resumir con «Otras entidades significativas», «N+ adicionales» " +
        "o listas separadas por comas en lugar de filas de tabla. Agrupa por repo si hay multi-root.\n\n" +
        "**§4 Contratos de API:** tablas completas de rutas/métodos por repo; no omitir endpoints listados en la doc. de partida.\n\n" +
        "**§5 Lógica y Edge Cases (AS-IS exhaustivo):** tabla **Servicio | Dependencias (paths)** por repo desde la doc. de partida " +
        "(sección «Lógica de negocio»). PROHIBIDO «Además, servicios para cada Content Type restante» o listas por comas. " +
        "Las reglas no indexadas van en «Brechas de información».\n\n" +
        pathGroundingRulesBaseline +
        "**Prioridad:** Recupera y usa en su totalidad el conocimiento del codebase (TheForge) que se te proporciona. " +
        "Usa TODO ese contexto para describir fielmente la aplicación existente. " +
        "No inventes rutas, APIs, entidades ni funcionalidades que no aparezcan en el contexto. " +
        "Si el codebase está incompleto en alguna área, documéntalo como brecha.\n\n" +
        (theforgeContext
          ? "Contexto del codebase (TheForge) — evidencia del índice, arquitectura, definiciones y búsqueda semántica. " +
            "Usar TODO para describir el sistema real.\n---\n" +
            mddTheforgeContextBlock(theforgeContext) +
            "\n---"
          : "");
    } else {
      const baselineBlock = baselineStage?.mddContent?.trim()
        ? "## Línea base — MDD de la etapa anterior (sistema sin el cambio actual)\n\n" +
          baselineStage.mddContent.trim() +
          "\n\n---\n\n" +
          "**Instrucción:** El MDD de cambio debe describir SOLO las modificaciones, adiciones o eliminaciones " +
          "respecto a esta línea base. No redescribas secciones enteras que no cambian. " +
          "Si una sección (§1–7) no se modifica, indícalo con «Sin cambios respecto a la línea base». " +
          "Enfócate en qué cambia, dónde cambia y por qué cambia.\n\n---\n\n"
        : "";
      prompt =
        (brdPre ? brdPre + "\n\n" : "") +
        handoffMddBlock +
        codebaseDocBlock +
        baselineBlock +
        "Genera un documento MDD de cambio (Markdown) para un proyecto legacy. " +
        "Según Specification-Driven Development, el MDD es la **Constitución del cambio** y debe tener " +
        "**exactamente 7 secciones** en este orden: 1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, " +
        "4. Contratos de API, 5. Lógica y Edge Cases, 6. Seguridad, 7. Infraestructura. " +
        "Aplica cada sección al **cambio** descrito (qué se modifica en contexto, stack, modelo, API, lógica, seguridad e infra). " +
        "En §2 incluye `### Diagrama de Componentes` (Mermaid flowchart) anclado a la doc. de partida.\n\n" +
        pathGroundingRulesChange +
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
            mddTheforgeContextBlock(theforgeContext) +
            "\n---"
          : "");
    }
    const mddDraft = await this.ai.generateResponse(prompt, [], { systemPrompt: COORDINATOR_SYSTEM });
    const mddContent = await this.reviewer.reviewMdd(description, mddDraft?.trim() ?? "", {
      asIsBaseline: isInitialMdd,
    });
    let cleaned = cleanDocumentContent(mddContent);
    if (isLegacyComponentDiagramEnabled() && codebaseDoc.length >= 80) {
      cleaned = injectComponentDiagramIntoMddSection2(cleaned, codebaseDoc);
    }
    if (isInitialMdd && isLegacyAsIsMddEvidenceInjectEnabled() && codebaseDoc.length >= 80) {
      cleaned = injectAsIsCodebaseEvidenceIntoMdd(cleaned, codebaseDoc);
    }
    // Single write: stage.legacyChangeState (project.legacyFlowState only when no stage exists)
    if (gateStage?.id) {
      await this.persistLegacyChangeState(projectId, gateStage.id, state).catch(() => {});
      await this.syncCurrentLegacyStageToGraph(projectId, gateStage.id).catch(() => {});
    }
    await this.projects.update(projectId, {
      mddContent: cleaned,
      ...(gateStage?.id ? { stageId: gateStage.id } : {}),
    });
    const response: LegacyGenerateMddResponse = {
      ok: true,
      persisted: true,
      mddLength: cleaned.length,
      wordCount: cleaned.trim() ? cleaned.trim().split(/\s+/).length : 0,
      ...(gateStage?.id ? { stageId: gateStage.id } : {}),
    };
    if (options?.includeContent) {
      response.mddContent = cleaned;
    }
    return response;
  }

  /** Persists `lastDeliverablesDebug` on stage legacyChangeState (fallback: project without stages). */
  private async persistDeliverablesDebugReport(
    projectId: string,
    report: LegacyDeliverablesDebugReport,
    stageId?: string | null,
  ): Promise<void> {
    try {
      if (stageId?.trim()) {
        const stage = await this.prisma.stage.findUnique({
          where: { id: stageId.trim() },
          select: { legacyChangeState: true },
        });
        const state = (stage?.legacyChangeState as LegacyFlowState | null | undefined) ?? {};
        const next = { ...state, lastDeliverablesDebug: report } as LegacyFlowState;
        await this.prisma.stage.update({
          where: { id: stageId.trim() },
          data: { legacyChangeState: next as object },
        });
        return;
      }
      const firstStage = await this.prisma.stage.findFirst({
        where: { projectId },
        orderBy: { ordinal: "asc" },
        select: { id: true, legacyChangeState: true },
      });
      if (!firstStage?.id) return;
      const state = (firstStage.legacyChangeState as LegacyFlowState | null | undefined) ?? {};
      const next = { ...state, lastDeliverablesDebug: report } as LegacyFlowState;
      await this.prisma.stage.update({
        where: { id: firstStage.id },
        data: { legacyChangeState: next as object },
      });
    } catch (err) {
      this.logger.warn(
        `[LegacyDeliverables] persistDeliverablesDebugReport: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Genera entregables según `Project.complexity` y `DELIVERABLES_BY_COMPLEXITY` (despacho dinámico).
   * Legacy inyecta contexto AriadneSpecs en cada llamada. No ejecuta generadores fuera de la lista (ahorra tokens).
   * @returns `lastDeliverablesDebug` — traza de pasos (también persistida en `legacyFlowState.lastDeliverablesDebug`).
   */
  async generateDeliverables(
    projectId: string,
    stageId?: string,
    options?: {
      onProgress?: (p: { step: string; index: number; total: number }) => void;
    },
  ): Promise<{ ok: boolean; lastDeliverablesDebug: LegacyDeliverablesDebugReport }> {
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

    const gateStage = stageId?.trim()
      ? await this.prisma.stage.findUnique({ where: { id: stageId.trim() } })
      : await this.resolveLegacyGateStage(projectId);

    assertLegacyChangeGate(gateStage);

    // enforceLegacyBrdTobeGate eliminado — To-Be y As-Is removidos
    const gateState = this.readLegacyChangeState(gateStage);
    const codebaseDoc = String(gateState.codebaseDoc ?? "").trim();
    const mddContent = String(project.mddContent ?? "").trim();
    const legacyBaselineStage = resolveLegacyBaselineStageFlag(gateStage, mddContent);
    report.legacyBaselineStage = legacyBaselineStage;
    report.codebaseDocChars = codebaseDoc.length;
    report.mddContentChars = mddContent.length;
    report.mddSource = mddContent ? "mddContent" : codebaseDoc ? "codebaseDoc_fallback" : "none";
    const mdd =
      mddContent || (codebaseDoc ? `[Ingeniería inversa: documento del codebase existente. Genera entregables que describan el sistema AS-IS.]\n\n${codebaseDoc}` : "");
    report.mddChars = mdd.length;

    const isReverseEngineering = !mddContent && !!codebaseDoc;
    report.pipelineMode = isReverseEngineering ? "generate_from_codebase" : "projects_generate_document";
    if (!isReverseEngineering) {
      report.mddLlmStrategy = "full";
      report.mddCharsSentToLlm = mddContent.length;
      report.mddClippedForLlm = false;
      report.mddRollupWindows = 0;
    }

    pushStep({
      kind: "preflight",
      durationMs: 0,
      ok: !!mdd,
      detail:
        `legacyBaselineStage=${legacyBaselineStage} reverseEngineering=${isReverseEngineering} pipelineMode=${report.pipelineMode} mddSource=${report.mddSource} mddLlmStrategy=${report.mddLlmStrategy ?? "?"} rollupWindows=${report.mddRollupWindows ?? 0} clipped=${report.mddClippedForLlm ?? false} rollupFailed=${report.mddRollupFailed ?? false}`,
    });

    if (!mdd) {
      markFatal(new Error("missing_mdd_and_codebaseDoc"));
      await this.persistDeliverablesDebugReport(projectId, report, gateStage?.id);
      throw new BadRequestException("Genera la documentación de partida (MDD Inicial) o el MDD de cambio antes de generar entregables.");
    }

    const legacyState = gateState;

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
      await this.persistDeliverablesDebugReport(projectId, report, gateStage?.id);
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
    const legacyOpts: { theforgeContext?: string; contractSpecs?: string; legacyBaselineStage?: boolean } | undefined =
      theforgeContext.trim() || contractSpecs.trim() || legacyBaselineStage
        ? {
            ...(theforgeContext.trim() ? { theforgeContext } : {}),
            ...(contractSpecs.trim() ? { contractSpecs } : {}),
            ...(legacyBaselineStage ? { legacyBaselineStage: true } : {}),
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
      mddText: string,
      fields: Partial<Pick<LegacyDeliverablesStrategyContext, "blueprintText" | "specText" | "useCasesText">>,
    ): Promise<boolean> => {
      const d = await this.legacyDeliverablesStrategy.resolveSectionMergeAttempt(kind, {
        mddText,
        theforgeContextText: theforgeContext,
        legacyBaselineStage,
        ...fields,
      });
      pushStrategyDecision(d);
      return d.attemptSectionMerge;
    };

    const update = async (data: Record<string, unknown>) => {
      if (!gateStage?.id) {
        throw new BadRequestException("No hay etapa activa para persistir entregables.");
      }
      await persistStageAndProjectDeliverables(
        this.prisma,
        gateStage.id,
        projectId,
        data as import("@theforge/shared-types").ProjectDeliverableSource,
      );
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

    const ensureBlueprint = async (mddForLlm: string): Promise<string> => {
      let bp = String(p.blueprintContent ?? "").trim();
      if (bp.length > 48) return bp;
      bp = await this.ai.generateBlueprint(mddForLlm, undefined, legacyOpts);
      await update({ blueprintContent: cleanDocumentContent(bp) });
      p = await load();
      return String(p.blueprintContent ?? "").trim();
    };

    const runStepWithMdd = async (kind: DeliverableKind, mddForLlm: string): Promise<void> => {
      switch (kind) {
        case "mdd_canonical":
          return;
        case "spec": {
          if (!legacyBaselineStage) {
            const sm = await trySectionMergeDeliverable(
              this.ai,
              "spec",
              mddForLlm,
              legacyOpts,
              {},
              run429,
              this.logger,
              {
                attemptSectionMerge: await resolveSectionMergeAttempt("spec", mddForLlm, {}),
              },
            );
            if (sm) {
              pushSectionMergeTrace(sm.trace);
              await update({ specContent: cleanDocumentContent(sm.content) });
              p = await load();
              return;
            }
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
              attemptSectionMerge: await resolveSectionMergeAttempt("architecture", mddForLlm, {
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
          if (!legacyBaselineStage) {
            const smUc = await trySectionMergeDeliverable(
              this.ai,
              "use_cases",
              mddForLlm,
              legacyOpts,
              { spec: p.specContent ?? undefined },
              run429,
              this.logger,
              {
                attemptSectionMerge: await resolveSectionMergeAttempt("use_cases", mddForLlm, {
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
          }
          const useCasesContent = await this.ai.generateUseCases(mddForLlm, p.specContent, legacyOpts);
          await update({ useCasesContent: cleanDocumentContent(useCasesContent) });
          p = await load();
          return;
        }
        case "blueprint": {
          if (!legacyBaselineStage) {
            const smBp = await trySectionMergeDeliverable(
              this.ai,
              "blueprint",
              mddForLlm,
              legacyOpts,
              {},
              run429,
              this.logger,
              {
                attemptSectionMerge: await resolveSectionMergeAttempt("blueprint", mddForLlm, {}),
              },
            );
            if (smBp) {
              pushSectionMergeTrace(smBp.trace);
              await update({ blueprintContent: cleanDocumentContent(smBp.content) });
              p = await load();
              return;
            }
          }
          const blueprintContent = await this.ai.generateBlueprint(mddForLlm, undefined, legacyOpts);
          await update({ blueprintContent: cleanDocumentContent(blueprintContent) });
          p = await load();
          return;
        }
        case "api_contracts": {
          const bp = await ensureBlueprint(mddForLlm);
          const smApi = await trySectionMergeDeliverable(
            this.ai,
            "api_contracts",
            mddForLlm,
            legacyOpts,
            { blueprint: bp },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("api_contracts", mddForLlm, {
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
          if (!legacyBaselineStage) {
            const smLf = await trySectionMergeDeliverable(
              this.ai,
              "logic_flows",
              mddForLlm,
              legacyOpts,
              {},
              run429,
              this.logger,
              { attemptSectionMerge: await resolveSectionMergeAttempt("logic_flows", mddForLlm, {}) },
            );
            if (smLf) {
              pushSectionMergeTrace(smLf.trace);
              await update({ logicFlowsContent: cleanDocumentContent(smLf.content) });
              p = await load();
              return;
            }
          }
          const logicFlowsContent = await this.ai.generateLogicFlows(mddForLlm, undefined, legacyOpts);
          const cleaned = cleanDocumentContent(logicFlowsContent);
          if (legacyBaselineStage) {
            const services = extractSection5Services(mddForLlm);
            const batchSize = readLogicFlowsBatchSize();
            const batchCount =
              services.length > batchSize ? Math.ceil(services.length / batchSize) : undefined;
            report.logicFlowsSection5Coverage = toLogicFlowsSection5CoverageReport(
              scoreLogicFlowsSection5Coverage(mddForLlm, cleaned),
              batchCount !== undefined ? { batchCount } : undefined,
            );
          }
          await update({ logicFlowsContent: cleaned });
          p = await load();
          return;
        }
        case "ux_ui_guide": {
          const bpUx = String(p.blueprintContent ?? "").trim() || (await ensureBlueprint(mddForLlm));
          const smUx = await trySectionMergeDeliverable(
            this.ai,
            "ux_ui_guide",
            mddForLlm,
            legacyOpts,
            { blueprint: bpUx },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("ux_ui_guide", mddForLlm, {
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
            mddForLlm +
            "\n---\n\nBlueprint:\n---\n" +
            bpUx +
            "\n---";
          if (theforgeContext) {
            uxPrompt =
              "**Contexto del codebase (TheForge) — priorizar y usar antes de elaborar:**\n---\n" +
              mddTheforgeContextBlock(theforgeContext) +
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
                    (parsed.summary ?? "") +
                    "\\n---\\n\\n" +
                    uxPrompt;
                }
              }
            }
          } catch {
            // Si falla la extracción, continuar sin tokens — no bloquear la generación
            this.logger.warn("[Legacy UX/UI] Design token extraction via MCP tool skipped (error, continuing without tokens)");
          }
          const uxUiGuideContent = await this.ai.generateResponse(
            appendLegacyBaselineDetailPrompt(uxPrompt, legacyBaselineStage),
            [],
            {
              systemPrompt: UX_UI_GUIDE_PROMPT,
              activeTab: "ux-ui-guide",
              projectTypeForUxGuide: "LEGACY",
            },
          );
          const uxClean = (uxUiGuideContent ?? "").replace(/\n---FIN_UX_UI---.*/s, "").trim();
          await update({ uxUiGuideContent: cleanDocumentContent(uxClean) });
          p = await load();
          return;
        }
        case "user_stories": {
          const integrationPromptCtx = await this.projectIntegration.resolvePromptContext(
            projectId,
            gateStage?.id ?? undefined,
          );
          if (!legacyBaselineStage) {
            const smUs = await trySectionMergeDeliverable(
              this.ai,
              "user_stories",
              mddForLlm,
              legacyOpts,
              { spec: p.specContent ?? undefined, useCases: p.useCasesContent ?? undefined },
              run429,
              this.logger,
              {
                attemptSectionMerge: await resolveSectionMergeAttempt("user_stories", mddForLlm, {
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
          }
          const userStoriesContent = await this.ai.generateUserStories(
            mddForLlm,
            p.specContent,
            p.useCasesContent,
            {
              ...legacyOpts,
              integrationHandoffItems: integrationPromptCtx.handoffItems,
              integrationNewProject: integrationPromptCtx.newProjectMeta,
            },
          );
          const cleanedUs = cleanDocumentContent(userStoriesContent);
          if (gateStage?.id) {
            await this.projectIntegration
              .syncTracesFromUserStories(projectId, gateStage.id, cleanedUs)
              .catch(() => {});
          }
          await update({ userStoriesContent: cleanedUs });
          p = await load();
          return;
        }
        case "agent_governance": {
          const bpGov = p.blueprintContent?.trim() || undefined;
          const governanceInput = {
            mddMarkdown: mddForLlm,
            blueprintMarkdown: bpGov,
            tasksMarkdown: p.tasksContent?.trim() || undefined,
            architectureMarkdown: p.architectureContent?.trim() || undefined,
            specMarkdown: p.specContent?.trim() || undefined,
            complexity,
          };
          const govSuggestions = suggestAgentGovernanceArtifacts(governanceInput);
          const raw = await this.ai.generateAgentGovernance(mddForLlm, bpGov, complexity, {
            ...legacyOpts,
            suggestions: govSuggestions,
            tasksContent: p.tasksContent,
            architectureContent: p.architectureContent,
            specContent: p.specContent,
          });
          const scaffold = parseAgentGovernanceResponse(raw, complexity, {
            suggestions: govSuggestions,
            governanceInput,
            forceFreshOverlay: true,
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
              attemptSectionMerge: await resolveSectionMergeAttempt("tasks", mddForLlm, {
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
          const freshForTasks = await load();
          const navigationMap = await this.fetchNavigationMapForTasks(theforgeId).catch(() => undefined);
          const tasksContent = await this.ai.generateTasks(
            mddForLlm,
            freshForTasks.blueprintContent?.trim() || bpTasks || undefined,
            mergeLegacyTasksGenerateOptions(legacyOpts, freshForTasks, navigationMap),
          );
          await update({ tasksContent: cleanDocumentContent(tasksContent) });
          p = await load();
          return;
        }
        case "infra": {
          const bpInf = await ensureBlueprint(mddForLlm);
          const smIf = await trySectionMergeDeliverable(
            this.ai,
            "infra",
            mddForLlm,
            legacyOpts,
            { blueprint: bpInf },
            run429,
            this.logger,
            {
              attemptSectionMerge: await resolveSectionMergeAttempt("infra", mddForLlm, {
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

    let reverseEngineeringMddForLegacySteps: string | null = null;
    const getReverseEngineeringMddForLegacySteps = (): string => {
      if (reverseEngineeringMddForLegacySteps === null) {
        reverseEngineeringMddForLegacySteps = buildReverseEngineeringMddForLegacySteps(
          codebaseDoc,
          report,
        );
        if (isLegacyDeliverablesDebugVerbose()) {
          this.logger.log(
            `[LegacyDeliverables] reverse_engineering_fallback strategy=${report.mddLlmStrategy ?? "?"} sentChars=${report.mddCharsSentToLlm ?? reverseEngineeringMddForLegacySteps.length}`,
          );
        }
      }
      return reverseEngineeringMddForLegacySteps;
    };

    /** Bulk legacy: `runStepWithMdd` (ProjectsService bloquea LEGACY en spec) o generate-from-codebase. */
    const mddForLlmSteps = (): string => mddContent || getReverseEngineeringMddForLegacySteps();

    const runDeliverableStep = async (kind: DeliverableKind): Promise<void> => {
      if (kind === "mdd_canonical") return;
      if (isReverseEngineering) {
        const docType = DELIVERABLE_KIND_TO_CODEBASE_DOC_TYPE[kind];
        if (docType) {
          await this.generateFromCodebase(projectId, docType, stageId);
          return;
        }
        report.pipelineMode = "legacy_run_step_fallback";
        await runStepWithMdd(kind, mddForLlmSteps());
        return;
      }
      await runStepWithMdd(kind, mddForLlmSteps());
    };

    const deliverablesPlanned = planLegacyDeliverablesToGenerate({
      complexity,
      hasMddContent: !!mddContent,
    });
    report.deliverablesOrder = [...deliverablesPlanned];

    if (deliverablesPlanned.length === 0) {
      pushStep({
        kind: "preflight_plan",
        durationMs: 0,
        ok: true,
        detail: "all_deliverables_already_present",
      });
      report.finishedAt = new Date().toISOString();
      report.ok = true;
      await this.persistDeliverablesDebugReport(projectId, report, gateStage?.id);
      if (gateStage?.id) {
        const snapProject = await this.prisma.project.findUnique({ where: { id: projectId } });
        if (snapProject) {
          await persistStageDeliverableSnapshotFromProject(
            this.prisma,
            gateStage.id,
            snapProject,
            { source: "cascade" },
          ).catch((err) =>
            this.logger.warn(
              `[LegacyDeliverables] deliverableSnapshot: ${err instanceof Error ? err.message : String(err)}`,
            ),
          );
        }
      }
      options?.onProgress?.({ step: "done", index: 0, total: 0 });
      return { ok: true, lastDeliverablesDebug: report };
    }

    pushStep({
      kind: "preflight_plan",
      durationMs: 0,
      ok: true,
      detail: `planned=${deliverablesPlanned.length} skipped=${deliverablesToRun.length - deliverablesPlanned.length} parallel=true`,
    });

    const largeMddCooldown = legacyDeliverablesLargeMddCooldownMs(report.mddChars);
    if (largeMddCooldown > 0) {
      if (isLegacyDeliverablesDebugVerbose()) {
        this.logger.log(
          `[LegacyDeliverables] throttle large_mdd_cooldown_ms=${largeMddCooldown} mddChars=${report.mddChars}`,
        );
      }
      await sleepMs(largeMddCooldown);
    }

    const stepErrors: Array<{ step: string; error: string }> = [];
    let completedCount = 0;
    const totalPlanned = deliverablesPlanned.length;

    await Promise.allSettled(
      deliverablesPlanned.map(async (kind) => {
        const t0 = Date.now();
        try {
          await runWithLegacy429Retries(() => runDeliverableStep(kind), { logger: this.logger, step: kind });
          const fresh = await load();
          const outChars = deliverableFieldCharCount(fresh as Record<string, unknown>, kind);
          const short = outChars < 48;
          let detail: string | undefined = short ? "output_under_48_chars" : undefined;
          if (kind === "logic_flows" && report.logicFlowsSection5Coverage) {
            const c = report.logicFlowsSection5Coverage;
            detail = `s5_coverage=${c.coveragePercent}% target=${c.targetPercent}% met=${c.metTarget}${
              c.batchCount ? ` batches=${c.batchCount}` : ""
            }`;
          }
          pushStep({
            kind,
            durationMs: Date.now() - t0,
            ok: true,
            outChars,
            detail,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          pushStep({
            kind,
            durationMs: Date.now() - t0,
            ok: false,
            error: clipDebug(msg, 800),
          });
          stepErrors.push({ step: kind, error: msg });
          if (isLegacy429Like(err)) {
            report.upstreamRateLimited = true;
            report.retryAfterSeconds = readRetryAfterSecondsFromErrorHeaders(err) ?? 60;
          }
        }
        completedCount++;
        const label = DELIVERABLE_STEP_LABELS[kind] ?? kind;
        options?.onProgress?.({ step: label, index: completedCount - 1, total: totalPlanned });
      }),
    );

    options?.onProgress?.({ step: "done", index: totalPlanned, total: totalPlanned });

    p = await load();

    if (stepErrors.length > 0) {
      this.logger.warn(
        `[LegacyDeliverables] Completada con ${stepErrors.length}/${totalPlanned} paso(s) fallido(s): ${stepErrors.map((e) => `${e.step}: ${e.error}`).join("; ")}`,
      );
    }

    if (report.upstreamRateLimited) {
      markFatal(new Error("UPSTREAM_LLM_RATE_LIMIT"));
      await this.persistDeliverablesDebugReport(projectId, report, gateStage?.id);
      const rateLimited = upstreamLlmRateLimitHttpException(new Error("UPSTREAM_LLM_RATE_LIMIT"), report);
      if (rateLimited) throw rateLimited;
    }

    report.finishedAt = new Date().toISOString();
    report.ok = stepErrors.length === 0;
    report.deliverablesWithBody = report.steps.filter(
      (s) =>
        typeof s.outChars === "number" &&
        s.outChars > 48 &&
        s.kind !== "preflight" &&
        s.kind !== "index_sdd_gate" &&
        s.kind !== "theforge_context" &&
        s.kind !== "mdd_canonical",
    ).length;

    await this.persistDeliverablesDebugReport(projectId, report, gateStage?.id);
    if (gateStage?.id) {
      await persistStageDeliverableSnapshotFromProject(this.prisma, gateStage.id, p, {
        source: "cascade",
      }).catch((err) =>
        this.logger.warn(
          `[LegacyDeliverables] deliverableSnapshot: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
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
    const state = this.readLegacyChangeState(stage);
    const codebaseDoc = String(state.codebaseDoc ?? "").trim();

    if (codebaseDoc.length < 300) {
      throw new BadRequestException(
        "Se requiere documentación de partida del codebase (mín. ~300 caracteres). Ejecuta primero generate-codebase-doc.",
      );
    }

    let content: string;

    if (documentType === "tasks") {
      const gateStageForMdd = stage ?? pickPrimaryStage(project.stages);
      const stageMdd = String(gateStageForMdd?.mddContent ?? "").trim();
      const mddForTasks =
        stageMdd ||
        `[Ingeniería inversa: documento del codebase existente. Genera entregables que describan el sistema AS-IS.]\n\n${codebaseDoc}`;
      const legacyBaselineStage = resolveLegacyBaselineStageFlag(gateStageForMdd, stageMdd || mddForTasks);
      let legacyOpts:
        | { theforgeContext?: string; contractSpecs?: string; legacyBaselineStage?: boolean }
        | undefined;
      if (project.theforgeProjectId && this.theforge.isConfigured()) {
        const [theforgeContext, contractSpecs] = await Promise.all([
          this.theforge.getContextForDeliverables(project.theforgeProjectId),
          this.theforge.gatherContractSpecsForApi(project.theforgeProjectId),
        ]);
        legacyOpts = {
          legacyBaselineStage,
          theforgeContext: theforgeContext?.trim() || undefined,
          contractSpecs: contractSpecs?.trim() || undefined,
        };
      } else if (legacyBaselineStage) {
        legacyOpts = { legacyBaselineStage };
      }
      const navigationMap = project.theforgeProjectId
        ? await this.fetchNavigationMapForTasks(project.theforgeProjectId).catch(() => undefined)
        : undefined;
      const rawTasks = await this.ai.generateTasks(
        mddForTasks,
        project.blueprintContent,
        mergeLegacyTasksGenerateOptions(legacyOpts, project, navigationMap),
      );
      content = cleanDocumentContent(rawTasks);
    } else {
      // Construir prompt
      const typePrompt = LegacyCoordinatorService.DOCUMENT_TYPE_PROMPTS[documentType];
      const prompt = `${typePrompt}\n\n--- codebaseDoc ---\n\n${codebaseDoc}`;

      // Llamar al LLM
      const llm = await this.aiFactory.createForUser(getRequestUserId());
      const raw = await llm.generateResponse(prompt, [], {
        systemPrompt:
          "Eres un analista de software experto. Genera documentación técnica precisa basada en el codebase proporcionado.",
      });

      content = cleanDocumentContent(raw ?? "");
    }

    const fieldKey = String(field);
    const currentContent = String(
      (project as Record<string, unknown>)[fieldKey] ?? "",
    ).trim();
    const persistValidation = validateDocumentForPersist(currentContent, content, {
      fieldLabel: documentPersistFieldLabel(fieldKey),
      minBodyChars: currentContent.length > 0 ? 80 : 120,
    });
    if (!persistValidation.ok) {
      throw new BadRequestException(persistValidation.message);
    }

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
