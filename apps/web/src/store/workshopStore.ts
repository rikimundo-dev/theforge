import { create } from "zustand";
import type { ChatImagePart, CodebaseDocResponseMode } from "@theforge/shared-types";
import { apiFetch, API_BASE, fetchWithRetry, addToOfflineQueue, flushOfflineQueue } from "../utils/apiClient";
import { parseErrorMessageFromResponse } from "../utils/httpError";

/**
 * Convierte mensajes de error de fetch del navegador (Safari "Load failed", Chrome "Failed to fetch")
 * a mensajes amigables en español.
 */
function friendlyFetchError(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message;
    if (
      msg === "Load failed" ||
      msg === "Failed to fetch" ||
      msg === "NetworkError when attempting to fetch resource." ||
      msg === "The network connection was lost." ||
      msg.startsWith("TypeError: Failed to fetch") ||
      msg.startsWith("TypeError: NetworkError") ||
      msg.startsWith("TypeError: Load failed") ||
      msg.includes("ERR_CONNECTION") ||
      msg.includes("ERR_NETWORK") ||
      msg.includes("network") ||
      msg.includes("NetworkError") ||
      /load\s+fail/i.test(msg) ||
      /failed\s+to\s+fetch/i.test(msg)
    ) {
      return "Error de conexión con el servidor. Reintenta en unos segundos.";
    }
    return msg;
  }
  return String(e);
}

/**
 * POST a un generate-* endpoint con ?queue=true y hace polling al job hasta completar.
 * Si el backend no tiene cola (respuesta síncrona directa), retorna el dato directamente.
 */
async function queueAndPoll<T>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const r = await apiFetch(`${url}?queue=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Error");
  }
  const data = (await r.json()) as Record<string, unknown>;

  // Si el backend respondió síncrono (sin cola), devolver el dato directamente
  if (!data.queued) return data as unknown as T;

  // Polling: GET /projects/jobs/:jobId cada 2s
  const jobId = data.jobId as string;
  const pollUrl = `${API_BASE}/projects/jobs/${jobId}`;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (signal?.aborted) throw new Error("Cancelado por el usuario");
    await new Promise((r) => setTimeout(r, 2_000));
    const pr = await apiFetch(pollUrl);
    if (!pr.ok) {
      if (pr.status === 404) throw new Error("Job no encontrado");
      continue;
    }
    const status = (await pr.json()) as {
      status: string;
      result?: unknown;
      error?: string;
      retrying_at?: string;
    };
    if (status.status === "completed") return status.result as T;
    if (status.status === "failed") throw new Error(status.error ?? "Error en la generación");
    // "queued", "active", "retrying" → seguir esperando
  }
  throw new Error("Tiempo de espera agotado (5 min)");
}

function pickEvaluatorCritique(data: Record<string, unknown>): string | null {
  const c = data.evaluatorCritique;
  return typeof c === "string" && c.trim().length > 0 ? c.trim() : null;
}

/** Body JSON para `POST /sessions/:id/messages` con `stageId` opcional. */
export function sessionMessageBody(
  base: { role: "user" | "assistant"; content: string; tab?: string; images?: ChatImagePart[] },
  stageId: string | null | undefined,
): string {
  return JSON.stringify({
    ...base,
    ...(stageId?.trim() ? { stageId: stageId.trim() } : {}),
  });
}

const cleanDoc = (text: string | null) => {
  if (typeof text !== "string") return null;
  let c = text.trim();
  if (!c) return null;

  // Encontrar el primer # para quitar preámbulos, sin regex lookbehind
  // IMPORTANTE: Si hay bloque YAML (---\\n...\\n---), buscar # solo después de ese bloque
  // para no cortar el frontmatter
  const yamlBlockEnd = c.startsWith("---") ? c.indexOf("\n---", 3) : -1;
  const searchStart = yamlBlockEnd !== -1 ? yamlBlockEnd + 5 : 0; // +5 = \\n + --- + \\n
  const firstHashIndex = c.indexOf("#", searchStart);
  if (firstHashIndex !== -1) {
    if (c.startsWith("#", searchStart)) {
      // ok, empieza ahí (o después del YAML)
    } else {
      const newlineHashIndex = c.indexOf("\n#", searchStart);
      if (newlineHashIndex !== -1) {
        c = c.slice(newlineHashIndex + 1).trim();
      }
    }
  }

  // Quitar fences de markdown ```
  // REPLACE manual con slices para evitar Regex
  if (c.startsWith("```")) {
    const firstNewline = c.indexOf("\n");
    if (firstNewline !== -1) {
      // Intentar quitar la etiqueta de lenguaje (```python\n -> ...)
      c = c.slice(firstNewline + 1).trim();
    } else {
      // Solo hay ```...? Raro, pero lo quitamos
      c = c.slice(3).trim();
    }
  }

  // Quitar ``` al final
  if (c.endsWith("```")) {
    c = c.slice(0, -3).trim();
  }

  return c || null;
};

/**
 * Helper para persist*Content: aplica retry, offline queue y setea error en el store.
 * Reemplaza el patrón repetitivo de 13 persist functions.
 */
async function persistField(
  fieldName: string,
  content: string | null,
  getState: () => WorkshopState,
  setState: (partial: Partial<WorkshopState>) => void,
): Promise<void> {
  const { projectId, project } = getState();
  if (!projectId || !project) return;
  if (content === ((project as unknown as Record<string, unknown>)[fieldName] ?? "")) return;

  const cleaned = cleanDoc(content) || content || "";
  setState({ synced: false, error: null });

  try {
    const r = await fetchWithRetry(`${API_BASE}/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [fieldName]: cleaned }),
    });
    if (r.ok) {
      const data = (await r.json()) as unknown;
      setState({
        project: data as Project,
        [fieldName]: cleanDoc(((data as Record<string, unknown>)[fieldName] as string) ?? cleaned),
        synced: true,
        error: null,
      } as Partial<WorkshopState>);
      // Flush offline queue oportunistically
      flushOfflineQueue().catch(() => {});
    } else {
      const errText = await parseErrorMessageFromResponse(r, "Error al guardar");
      addToOfflineQueue({ field: fieldName, content: cleaned, projectId, timestamp: Date.now() });
      setState({ synced: true, error: `Error: ${errText}. Cambio guardado localmente.` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addToOfflineQueue({ field: fieldName, content: cleaned, projectId, timestamp: Date.now() });
    setState({ synced: true, error: `Sin conexión: ${msg}. Cambio guardado localmente.` });
  }
}

export type Status = "ROJO" | "AMARILLO" | "VERDE";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tab?: string;
  /** Etapa en foco al enviar (el historial del chat sigue siendo global). */
  stageId?: string;
  images?: ChatImagePart[];
}

export interface Estimation {
  id: string;
  projectId: string;
  totalHours: number;
  totalMxn: number;
  teamStructure: Record<string, number>;
}

/** Métricas en vivo del EstimationService (Semáforo + nómina interna y precio mercado). */
export interface LiveMetricsResult {
  precision: number;
  totalMXN: number;
  totalMXNMarket: number;
  /** Costo estimado de generación con IA (USD → MXN). */
  totalMXNIA: number;
  totalHours: number;
  roles: Record<string, number>;
  rolesHours: Record<string, number>;
  status: "red" | "yellow" | "green";
  readinessHints?: string[];
}

/** Calificación por sección/agente (0–100) en el evento done del stream MDD. */
export interface PrecisionBreakdown {
  contexto: number;
  modeloDatos: number;
  apiContracts: number;
  frontend: number;
  seguridad: number;
  integracion: number;
  /** Motivo de la calificación por sección (por qué se obtuvo ese %). */
  sectionReasons?: Partial<Record<"contexto" | "modeloDatos" | "apiContracts" | "frontend" | "seguridad" | "integracion", string>>;
}

/** Breakdown de completitud por documento (0-100). Coincide con backend PlanningDocumentFields. */
export interface DocumentCompleteness {
  brdContent: number;
  asIsManualContent: number;
  specContent: number;
  architectureContent: number;
  useCasesContent: number;
  userStoriesContent: number;
  blueprintContent: number;
  apiContractsContent: number;
  logicFlowsContent: number;
  infraContent: number;
  tasksContent: number;
  overall: number;
}

/** Gap de consistencia entre dos documentos. */
export interface CrossDocumentGap {
  from: string;
  to: string;
  concept: string;
  severity: "missing" | "partial" | "contradiction";
}

/** Resultado de conformance (Blueprint/Infra vs MDD). */
export interface ConformanceResult {
  ok: boolean;
  gaps: string[];
}

/** Resultado de conformance API vs MDD. */
export interface ApiConformanceResult {
  ok: boolean;
  missingInApi: string[];
  extraInApi: string[];
}

/** Paso de la cascada legacy de entregables (respuesta `POST …/legacy/generate-deliverables`). */
export interface LegacyDeliverablesDebugStep {
  kind: string;
  at: string;
  durationMs: number;
  ok: boolean;
  outChars?: number;
  detail?: string;
  error?: string;
}

/** Grupo de ventanas MDD en section-merge (API `lastDeliverablesDebug`). */
export interface LegacySectionMergeTraceGroup {
  id: string;
  sections: number[];
  durationMs: number;
  outChars: number;
  ok: boolean;
}

export interface LegacySectionMergeTrace {
  kind: string;
  groups: LegacySectionMergeTraceGroup[];
  mechanicalOk: boolean;
  conformanceOk?: boolean;
  gaps: string[];
  repaired?: boolean;
  finalChars: number;
}

/** Trazabilidad de la última generación de entregables legacy (API + `legacyFlowState`). */
export interface LegacyDeliverablesDebugReport {
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  deliverablesWithBody?: number;
  mddSource: string;
  mddChars: number;
  codebaseDocChars: number;
  mddContentChars: number;
  theforgeContextChars: number;
  theforgeConfigured: boolean;
  complexityEffective: string;
  deliverablesOrder: string[];
  steps: LegacyDeliverablesDebugStep[];
  fatalError?: { message: string; stack?: string };
  upstreamRateLimited?: boolean;
  retryAfterSeconds?: number;
  mddCharsSentToLlm?: number;
  mddClippedForLlm?: boolean;
  mddLlmStrategy?: "full" | "truncate" | "rollup";
  mddRollupWindows?: number;
  mddRollupFailed?: boolean;
  sectionMergeTraces?: LegacySectionMergeTrace[];
}

/** Estado del flujo legacy (archivos, preguntas, respuestas sugeridas por AriadneSpecs). */
export interface LegacyFlowState {
  description?: string;
  /** Paths o { path, repoId } (multi-repo, SPEC-MCP-001). */
  filesToModify?: (string | { path: string; repoId?: string })[];
  questions?: string[];
  /** Respuestas sugeridas por AriadneSpecs desde el codebase; se muestran pre-rellenadas */
  suggestedAnswers?: Record<string, string>;
  answers?: Record<string, string>;
  /** Documentación de partida del codebase (opcional, generada vía MCP). */
  codebaseDoc?: string;
  /** Última traza de `generate-deliverables` (persistida en el servidor). */
  lastDeliverablesDebug?: LegacyDeliverablesDebugReport;
}

/** Fila `Stage` en `GET /projects/:id` (MDD/semáforo por etapa). */
export interface WorkshopStage {
  id: string;
  ordinal: number;
  key: string | null;
  name: string | null;
  workflowStatus: string;
  mddContent?: string | null;
  brdContent?: string | null;
  brdApprovedAt?: string | null;
  status: Status;
  precisionScore: number;
  estimation: Estimation | null;
  /** Estado del flujo legacy para esta etapa (cambio) */
  legacyChangeState?: LegacyFlowState | null;
}

/** Propuesta HITL hasta confirmación en chat o `POST .../confirm-complexity`. */
export interface ComplexityPending {
  level: "LOW" | "MEDIUM" | "HIGH";
  planSummary: string;
  reason?: string;
}

export interface Project {
  id: string;
  name: string;
  /** Política SDD: gobierna semáforo y entregables (API: `Project.complexity`). */
  complexity?: "LOW" | "MEDIUM" | "HIGH";
  /** Inferencia / plan propuesto; no aplica a `complexity` hasta confirmación explícita. */
  complexityPending?: ComplexityPending | null;
  projectType?: "NEW" | "LEGACY";
  /** Privado (solo owner) o compartido (todos los usuarios). */
  visibility?: "PRIVATE" | "SHARED";
  /** Si true, el API bloquea MDD técnico hasta BRD + To-Be aprobados (configurable en el panel). */
  requireBrdTobeGate?: boolean;
  theforgeProjectId?: string | null;
  status: Status;
  precisionScore: number;
  hasUxTeam: boolean;
  dbgaContent: string | null;
  specContent: string | null;
  mddContent: string | null;
  phase0SummaryContent: string | null;
  uxUiGuideContent: string | null;
  blueprintContent: string | null;
  tasksContent: string | null;
  apiContractsContent: string | null;
  logicFlowsContent: string | null;
  architectureContent: string | null;
  useCasesContent: string | null;
  userStoriesContent: string | null;
  infraContent: string | null;
  aemContent: string | null;
  legacyFlowState?: LegacyFlowState | null;
  estimation: Estimation | null;
  /** Presente en respuesta API completa; el front usa `activeStageId` para foco MDD. */
  stages?: WorkshopStage[];
}

function pickDefaultStageId(stages: WorkshopStage[]): string | null {
  if (!stages.length) return null;
  const active = stages
    .filter((s) => s.workflowStatus === "ACTIVE")
    .sort((a, b) => a.ordinal - b.ordinal);
  if (active.length > 0) return active[0]!.id;
  return [...stages].sort((a, b) => a.ordinal - b.ordinal)[0]!.id;
}

/** Campos planos del proyecto alineados con la etapa en foco (MDD / semáforo / estimación). */
function workshopFlatFromStage(p: Project, stageId: string | null): Pick<Project, "mddContent" | "status" | "precisionScore" | "estimation"> {
  const stages = p.stages;
  if (!stageId || !stages?.length) {
    return {
      mddContent: p.mddContent,
      status: p.status,
      precisionScore: p.precisionScore,
      estimation: p.estimation,
    };
  }
  const st = stages.find((s) => s.id === stageId);
  if (!st) {
    return {
      mddContent: p.mddContent,
      status: p.status,
      precisionScore: p.precisionScore,
      estimation: p.estimation,
    };
  }
  return {
    mddContent: st.mddContent ?? null,
    status: st.status,
    precisionScore: st.precisionScore,
    estimation: st.estimation ?? null,
  };
}

/** Tras respuesta API con `stages[]`, mantiene foco si la etapa sigue existiendo. */
function mergeProjectWithActiveStage(
  proj: Project,
  prevActiveId: string | null,
): { project: Project; activeStageId: string | null; mddContent: string } {
  const stages = proj.stages ?? [];
  const activeStageId =
    prevActiveId && stages.some((s) => s.id === prevActiveId) ? prevActiveId : pickDefaultStageId(stages);
  const flat = workshopFlatFromStage(proj, activeStageId);
  return {
    project: { ...proj, ...flat },
    activeStageId,
    mddContent: cleanDoc(flat.mddContent) ?? "",
  };
}

/** Proyecto tras evento `done` del orquestador: conserva etapa activa y limpia documentos mostrados. */
function projectWithUxAfterStream(
  proj: Project | undefined,
  uxFromApi: string | null | undefined,
  prevActiveId: string | null,
): { project: Project; mddContent: string; activeStageId: string | null } | null {
  if (!proj) return null;
  const merged = mergeProjectWithActiveStage(proj, prevActiveId);
  const p = merged.project;
  return {
    project: {
      ...p,
      complexityPending:
        proj != null && proj.complexityPending !== undefined
          ? proj.complexityPending
          : p.complexityPending ?? null,
      uxUiGuideContent: cleanDoc(uxFromApi ?? p.uxUiGuideContent ?? null),
      blueprintContent: cleanDoc(p.blueprintContent ?? null),
      dbgaContent: cleanDoc(p.dbgaContent ?? null),
      specContent: cleanDoc(p.specContent ?? null),
      apiContractsContent: cleanDoc(p.apiContractsContent ?? null),
      logicFlowsContent: cleanDoc(p.logicFlowsContent ?? null),
      tasksContent: cleanDoc(p.tasksContent ?? null),
      architectureContent: cleanDoc(p.architectureContent ?? null),
      useCasesContent: cleanDoc(p.useCasesContent ?? null),
      userStoriesContent: cleanDoc(p.userStoriesContent ?? null),
      infraContent: cleanDoc(p.infraContent ?? null),
    },
    mddContent: merged.mddContent,
    activeStageId: merged.activeStageId,
  };
}

/** Trazas MCP (Ariadne) devueltas cuando el API tiene `LEGACY_CODEBASE_DOC_MCP_DEBUG_UI=1`. */
export interface LegacyMcpDebugEntry {
  at: string;
  rpcMethod: string;
  toolName?: string;
  requestJson: string;
  responseHttpStatus: number;
  responseBodyPreview: string;
  durationMs: number;
}

export interface Session {
  id: string;
  projectId: string;
  chatLog: ChatMessage[];
  contextStep: string;
  updatedAt: string;
}

interface WorkshopState {
  projectId: string | null;
  project: Project | null;
  session: Session | null;
  /** Contenido del MDD (Constitución del proyecto en SDD; gobierna Blueprint, Contratos, Infra). */
  mddContent: string;
  uxUiGuideContent: string | null;
  dbgaContent: string | null;
  specContent: string | null;
  phase0SummaryContent: string | null;
  blueprintContent: string | null;
  tasksContent: string | null;
  apiContractsContent: string | null;
  logicFlowsContent: string | null;
  architectureContent: string | null;
  useCasesContent: string | null;
  userStoriesContent: string | null;
  infraContent: string | null;
  aemContent: string | null;
  /** Conformance (SDD Fase 2): Blueprint/API/Flujos/Infra vs MDD; `blueprintDataModel` = §3 vs Blueprint (gating API). */
  conformance: {
    blueprint: ConformanceResult;
    blueprintDataModel: ConformanceResult;
    api: ApiConformanceResult;
    logicFlows: ConformanceResult;
    infra: ConformanceResult;
  } | null;
  /** Vista previa de entregable eliminada — regeneración directa sin modal */
  loading: boolean;
  /** Razón del loading para mostrar mensajes específicos (ej. deep research tarda más) */
  loadingReason:
    | "benchmark"
    | "mdd"
    | "phase0-deep-research"
    | "legacy-codebase-doc"
    | "legacy-mdd"
    | "legacy-as-is"
    | "legacy-brd-suggest"
    | "brd-from-dbga"
    | "legacy-deliverables"
    | "deliverables-cascade"
    | "launch-hermes"
    | null;
  /** Mensaje de usuario en curso (streaming); se muestra hasta recibir "done" */
  streamingUserMessage: string | null;
  /** Imágenes del turno en streaming (mismo ciclo que streamingUserMessage). */
  streamingUserImages: ChatImagePart[] | null;
  /** Contenido del asistente que llega por stream; se concatena hasta "done" */
  streamingContent: string | null;
  /** Tab del mensaje en streaming (para filtrar por tab) */
  streamingTab: string | null;
  /** Progreso de agentes DBGA (Benchmark): qué agente trabaja y qué hace */
  agentProgress: Array<{ agent: string; message: string }>;
  /** Métricas en vivo (Semáforo + estimación) desde GET /ai-analysis/estimation */
  liveMetrics: LiveMetricsResult | null;
  /** ThreadId del flujo Manager (MDD); cuando está definido, el siguiente mensaje en tab MDD va a resume */
  managerThreadId: string | null;
  /** true mientras se ejecuta persistAndReviewMdd (grabar + revisión de consistencia) */
  mddReviewing: boolean;
  synced: boolean;
  error: string | null;
  /** Logs de auditoría del último stream MDD */
  auditTrail: string[] | null;
  /** Desglose de calificación del último stream MDD */
  precisionBreakdown: PrecisionBreakdown | null;
  /** Completitud por documento (semáforo integral). */
  documentCompleteness: DocumentCompleteness | null;
  /** Gaps de consistencia transversal entre documentos. */
  crossDocumentGaps: CrossDocumentGap[];
  /** Score de consistencia (0-100). */
  consistencyScore: number | null;
  /** Feedback del auditor (para mostrar en UI fuera del chat) */
  auditorFeedback: string | null;
  /** Crítica del evaluador legacy (SDD vs código); solo si el backend la envía */
  evaluatorCritique: string | null;
  clearEvaluatorCritique: () => void;
  /** Última traza pregunta↔respuesta MCP al generar doc. partida (solo si el API envía `mcpDebugTrace`). */
  legacyMcpDebugTrace: LegacyMcpDebugEntry[] | null;
  clearLegacyMcpDebugTrace: () => void;
  /** Última traza de `POST …/legacy/generate-deliverables` (cuerpo JSON de la respuesta). */
  lastLegacyDeliverablesDebug: LegacyDeliverablesDebugReport | null;
  clearLegacyDeliverablesDebug: () => void;
  /** Plan pendiente de aprobación (HITL 4.4): pasos a ejecutar; el usuario puede Ejecutar o Modificar */
  pendingPlanApproval: {
    plan: Array<{ step_id: string; task_description: string; node: string; goal?: string }>;
    planMessage: string;
  } | null;
  /** true tras generar MDD desde Benchmark (one-shot); mostrar banner de revisión en panel MDD */
  mddJustGeneratedFromBenchmark: boolean;
  /** Decisiones Arquitectónicas (ADRs) asociadas al proyecto */
  adrs: any[] | null;
  /** Etapas del proyecto (sincronizado con API; fuente para selector y foco MDD). */
  workshopStages: WorkshopStage[];
  /** Etapa cuyo MDD edita el Workshop (vista en vivo). */
  activeStageId: string | null;
  setActiveStageId: (stageId: string | null) => void;
  /** Panel central de documentos (pestaña activa); sincroniza barra global y `WorkshopView`. */
  workshopActiveDocPanel: string;
  setWorkshopActiveDocPanel: (panel: string) => void;
  /** `POST /projects/:id/stages` → `{ stage }`; opcional `copyMddFromStageId`. */
  createWorkshopStage: (opts: { name?: string; key?: string; copyMddFromStageId?: string; copyLegacyChangeFromStageId?: string }) => Promise<Project | null>;
  /** `PATCH /projects/:id/stages/:stageId` — BRD/To-Be/As-Is, aprobaciones, etc. */
  patchWorkshopStage: (
    stageId: string,
    body: Record<string, string | boolean | undefined>,
  ) => Promise<boolean>;
  /** `PATCH /projects/:id` con `{ requireBrdTobeGate }` — control usuario (no env). */
  setProjectRequireBrdTobeGate: (projectId: string, requireBrdTobeGate: boolean) => Promise<boolean>;

  setProjectId: (id: string | null) => void;
  setProject: (p: Project | null) => void;
  setSession: (s: Session | null) => void;
  setMddContent: (content: string) => void;
  setUxUiGuideContent: (content: string | null) => void;
  persistUxUiGuideContent: (content: string) => Promise<void>;
  setLoading: (v: boolean) => void;
  setSynced: (v: boolean) => void;
  setError: (e: string | null) => void;

  fetchProject: (projectId: string) => Promise<Project | null>;
  fetchWelcome: (projectId: string, activeTab?: string) => Promise<void>;
  clearChat: (projectId: string, activeTab?: string) => Promise<void>;
  /** options.regenerateSection (1–7): regenerar solo esa sección del MDD (comando / en chat). §1 = solo sintetizador de contexto. */
  sendMessage: (
    message: string,
    activeTab?: string,
    options?: { regenerateSection?: number; images?: ChatImagePart[] },
  ) => Promise<void>;
  updateMddContent: (content: string) => void;
  persistMddContent: (content: string, options?: { force?: boolean }) => Promise<void>;
  revertMddContent: () => void;
  persistAndReviewMdd: () => Promise<void>;
  setBlueprintContent: (content: string | null) => void;
  persistBlueprintContent: (content: string) => Promise<void>;
  generateBlueprint: (projectId: string, options?: { gapsFeedback?: string }) => Promise<Project | null>;
  setApiContractsContent: (content: string | null) => void;
  persistApiContractsContent: (content: string) => Promise<void>;
  generateApiContracts: (projectId: string, options?: { gapsFeedback?: string }) => Promise<Project | null>;
  setLogicFlowsContent: (content: string | null) => void;
  persistLogicFlowsContent: (content: string) => Promise<void>;
  generateLogicFlows: (projectId: string, options?: { gapsFeedback?: string }) => Promise<Project | null>;
  setInfraContent: (content: string | null) => void;
  persistInfraContent: (content: string) => Promise<void>;
  generateInfra: (projectId: string, options?: { gapsFeedback?: string }) => Promise<Project | null>;

  setArchitectureContent: (content: string | null) => void;
  persistArchitectureContent: (content: string) => Promise<void>;
  generateArchitecture: (projectId: string, options?: Record<string, never>) => Promise<Project | null>;

  setUseCasesContent: (content: string | null) => void;
  persistUseCasesContent: (content: string) => Promise<void>;
  generateUseCases: (projectId: string, options?: Record<string, never>) => Promise<Project | null>;

  setUserStoriesContent: (content: string | null) => void;
  persistUserStoriesContent: (content: string) => Promise<void>;
  generateUserStories: (projectId: string, options?: Record<string, never>) => Promise<Project | null>;
  setSpecContent: (content: string | null) => void;
  persistSpecContent: (content: string) => Promise<void>;
  setAemContent: (content: string | null) => void;
  persistAemContent: (content: string) => Promise<void>;
  generateSpec: (projectId: string) => Promise<Project | null>;
  setTasksContent: (content: string | null) => void;
  persistTasksContent: (content: string) => Promise<void>;
  generateTasks: (projectId: string) => Promise<Project | null>;
  /** POST /projects/:id/generate-deliverables — cascada según complexity. */
  generateDeliverablesCascade: (projectId: string) => Promise<Project | null>;
  /** HITL: aplica propuesta pendiente a `complexity` y limpia `complexityPending`. */
  confirmComplexityProposal: (projectId: string) => Promise<Project | null>;
  /** HITL: descarta propuesta sin aplicar nivel (`clearComplexityPending`). */
  dismissComplexityProposal: (projectId: string) => Promise<Project | null>;
  /** Re-infiere propuesta HITL desde documentos existentes (`POST .../reassess-complexity`). */
  reassessComplexity: (projectId: string, note?: string) => Promise<Project | null>;
  fetchConformance: (projectId: string, options?: { useLlm?: boolean }) => Promise<void>;
  verifyDeliverable: (projectId: string, deliverable: "blueprint" | "api" | "infra" | "architecture" | "use-cases" | "user-stories") => Promise<string>;
  setDbgaContent: (content: string | null) => void;
  persistDbgaContent: (content: string) => Promise<void>;
  clearDbgaContent: (projectId: string) => Promise<void>;
  generateBenchmark: (projectId: string, userIdea: string, urls?: string[]) => Promise<Project | null>;
  generateMddFromBenchmark: (projectId: string) => Promise<Project | null>;
  clearMddJustGeneratedFromBenchmark: () => void;
  setAgentProgress: (progress: Array<{ agent: string; message: string }>) => void;
  setPhase0SummaryContent: (content: string | null) => void;
  persistPhase0SummaryContent: (content: string) => Promise<void>;
  phase0DeepResearch: (
    projectId: string,
    opts: { userIdea?: string; urls?: string[]; includeBenchmark?: boolean },
  ) => Promise<Project | null>;
  clearPhase0SummaryContent: (projectId: string) => Promise<void>;
  /** Flujo legacy: documentación de partida (opcional); puede incluir `mcpDebugTrace` si el API tiene debug activo. */
  legacyGenerateCodebaseDoc: (
    projectId: string,
    opts?: { responseMode?: CodebaseDocResponseMode; stageId?: string },
  ) => Promise<{ codebaseDoc: string; mcpDebugTrace?: LegacyMcpDebugEntry[] } | null>;
  /** Flujo legacy: actualizar documentación de partida (edición manual) */
  legacyUpdateCodebaseDoc: (projectId: string, codebaseDoc: string) => Promise<boolean>;
  /** Flujo legacy: analizar con AriadneSpecs → archivos + preguntas */
  legacyStart: (projectId: string, description: string, stageId?: string) => Promise<{ filesToModify: (string | { path: string; repoId?: string })[]; questions: string[]; suggestedAnswers?: Record<string, string> } | null>;
  legacyAnswer: (projectId: string, answers: Record<string, string>, stageId?: string) => Promise<boolean>;
  legacyGenerateMdd: (projectId: string, stageId?: string) => Promise<{ mddContent: string } | null>;
  /** POST …/legacy/generate-as-is-manual → persiste `asIsManualContent` en la etapa legacy/primaria. */
  legacyGenerateAsIsManual: (projectId: string) => Promise<{ asIsManualContent: string; stageId: string } | null>;
  /** POST …/legacy/suggest-brd-from-codebase-doc — borrador BRD desde doc. Ariadne. */
  legacySuggestBrdFromCodebaseDoc: (
    projectId: string,
    stageId?: string,
  ) => Promise<{ brdContent: string; stageId: string } | null>;
  /** POST …/legacy/generate-from-codebase — genera entregable individual desde codebaseDoc. */
  legacyGenerateFromCodebaseDoc: (
    projectId: string,
    documentType: string,
    stageId?: string,
  ) => Promise<{ content: string; field: string } | null>;
  /** POST …/projects/:id/suggest-brd-from-dbga — greenfield desde `dbgaContent`. */
  suggestBrdFromDbga: (
    projectId: string,
    opts?: { stageId?: string | null },
  ) => Promise<{ brdContent: string; stageId: string } | null>;
  legacyGenerateDeliverables: (projectId: string) => Promise<boolean>;
  fetchEstimation: (projectId: string) => Promise<LiveMetricsResult | null>;
  fetchAdrs: (projectId: string) => Promise<void>;
  /** Notifica a Hermes Agent que el proyecto está listo para desarrollo. */
  launchHermes: (projectId: string) => Promise<{ success: boolean; status: number } | undefined>;
  reset: () => void;
}

const initialState = {
  projectId: null as string | null,
  project: null as Project | null,
  session: null as Session | null,
  mddContent: "",
  uxUiGuideContent: null as string | null,
  dbgaContent: null as string | null,
  specContent: null as string | null,
  phase0SummaryContent: null as string | null,
  blueprintContent: null as string | null,
  tasksContent: null as string | null,
  apiContractsContent: null as string | null,
  logicFlowsContent: null as string | null,
  architectureContent: null as string | null,
  useCasesContent: null as string | null,
  userStoriesContent: null as string | null,
  infraContent: null as string | null,
  aemContent: null as string | null,
  conformance: null as {
    blueprint: ConformanceResult;
    blueprintDataModel: ConformanceResult;
    api: ApiConformanceResult;
    logicFlows: ConformanceResult;
    infra: ConformanceResult;
  } | null,
  loading: false,
  loadingReason: null as
    | "benchmark"
    | "phase0-deep-research"
    | "legacy-codebase-doc"
    | "legacy-mdd"
    | "legacy-as-is"
    | "legacy-brd-suggest"
    | "brd-from-dbga"
    | "legacy-deliverables"
    | "deliverables-cascade"
    | null,
  streamingUserMessage: null as string | null,
  streamingUserImages: null as ChatImagePart[] | null,
  streamingContent: null as string | null,
  streamingTab: null as string | null,
  agentProgress: [] as Array<{ agent: string; message: string }>,
  liveMetrics: null as LiveMetricsResult | null,
  managerThreadId: null as string | null,
  mddReviewing: false,
  synced: true,
  error: null as string | null,
  auditTrail: null as string[] | null,
  precisionBreakdown: null as PrecisionBreakdown | null,
  documentCompleteness: null as DocumentCompleteness | null,
  crossDocumentGaps: [] as CrossDocumentGap[],
  consistencyScore: null as number | null,
  auditorFeedback: null as string | null,
  evaluatorCritique: null as string | null,
  legacyMcpDebugTrace: null as LegacyMcpDebugEntry[] | null,
  lastLegacyDeliverablesDebug: null as LegacyDeliverablesDebugReport | null,
  pendingPlanApproval: null as {
    plan: Array<{ step_id: string; task_description: string; node: string; goal?: string }>;
    planMessage: string;
  } | null,
  mddJustGeneratedFromBenchmark: false,
  adrs: null as any[] | null,
  workshopStages: [] as WorkshopStage[],
  activeStageId: null as string | null,
  workshopActiveDocPanel: "mdd",
};

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  ...initialState,

  setProjectId: (id) => set({ projectId: id }),
  setWorkshopActiveDocPanel: (panel) => set({ workshopActiveDocPanel: panel }),
  setProject: (p) => {
    if (!p) {
      set({ project: null, activeStageId: null, workshopStages: [], lastLegacyDeliverablesDebug: null });
      return;
    }
    const stages = p.stages ?? [];
    const prev = get().activeStageId;
    const activeStageId = prev && stages.some((s) => s.id === prev) ? prev : pickDefaultStageId(stages);
    const flat = workshopFlatFromStage(p, activeStageId);
    set({
      project: { ...p, ...flat, stages },
      workshopStages: stages,
      activeStageId,
      mddContent: cleanDoc(flat.mddContent) ?? "",
      uxUiGuideContent: p.uxUiGuideContent ?? null,
      dbgaContent: p.dbgaContent ?? null,
      phase0SummaryContent: p.phase0SummaryContent ?? null,
      blueprintContent: p.blueprintContent ?? null,
      apiContractsContent: p.apiContractsContent ?? null,
      logicFlowsContent: p.logicFlowsContent ?? null,
      architectureContent: p.architectureContent ?? null,
      useCasesContent: p.useCasesContent ?? null,
      userStoriesContent: p.userStoriesContent ?? null,
      infraContent: p.infraContent ?? null,
      aemContent: p.aemContent ?? null,
      lastLegacyDeliverablesDebug: p.legacyFlowState?.lastDeliverablesDebug ?? null,
    });
  },
  setSession: (s) => set({ session: s }),
  setMddContent: (content) => set({ mddContent: content }),
  setLoading: (v) => set({ loading: v }),
  setSynced: (v) => set({ synced: v }),
  setError: (e) => set({ error: e }),
  clearEvaluatorCritique: () => set({ evaluatorCritique: null }),
  clearLegacyMcpDebugTrace: () => set({ legacyMcpDebugTrace: null }),
  clearLegacyDeliverablesDebug: () => set({ lastLegacyDeliverablesDebug: null }),

  setActiveStageId: (stageId) => {
    const { project, projectId, workshopStages } = get();
    if (!project || !stageId) return;
    const stages = workshopStages.length > 0 ? workshopStages : (project.stages ?? []);
    if (!stages.some((s) => s.id === stageId)) return;
    const merged = { ...project, stages };
    const flat = workshopFlatFromStage(merged, stageId);
    set({
      activeStageId: stageId,
      project: { ...merged, ...flat },
      mddContent: cleanDoc(flat.mddContent) ?? "",
    });
    const pid = projectId ?? project.id;
    if (pid?.trim()) {
      const qs = new URLSearchParams({ projectId: pid.trim(), stageId });
      void apiFetch(`${API_BASE}/ai-analysis/mdd/thread?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { threadId?: string | null } | null) => {
          if (data?.threadId) set({ managerThreadId: data.threadId });
          else set({ managerThreadId: null });
        })
        .catch(() => {});
      void get()
        .fetchEstimation(pid.trim())
        .catch(() => {});
    }
  },

  createWorkshopStage: async (opts) => {
    const { projectId, project, workshopStages } = get();
    if (!projectId?.trim()) return null;
    const body: Record<string, unknown> = { activate: true };
    if (opts.name?.trim()) body.name = opts.name.trim();
    if (opts.key?.trim()) body.key = opts.key.trim();
    if (opts.copyMddFromStageId?.trim()) body.copyMddFromStageId = opts.copyMddFromStageId.trim();
    if (opts.copyLegacyChangeFromStageId?.trim()) body.copyLegacyChangeFromStageId = opts.copyLegacyChangeFromStageId.trim();
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo crear la etapa");
      }
      const data = (await r.json()) as { stage?: WorkshopStage } | Project;
      const newStage = "stage" in data && data.stage ? data.stage : null;
      if (newStage && project) {
        const prev = workshopStages.length > 0 ? workshopStages : (project.stages ?? []);
        const stages = [...prev.filter((s) => s.id !== newStage.id), newStage].sort((a, b) => a.ordinal - b.ordinal);
        const nextProject: Project = { ...project, stages };
        const activeStageId = newStage.id;
        const flat = workshopFlatFromStage(nextProject, activeStageId);
        set({
          workshopStages: stages,
          project: { ...nextProject, ...flat },
          activeStageId,
          mddContent: cleanDoc(flat.mddContent) ?? "",
          error: null,
        });
        const pid = projectId.trim();
        const threadQs = new URLSearchParams({ projectId: pid, stageId: activeStageId });
        void apiFetch(`${API_BASE}/ai-analysis/mdd/thread?${threadQs.toString()}`)
          .then((tr) => (tr.ok ? tr.json() : null))
          .then((d: { threadId?: string | null } | null) => {
            if (d?.threadId) set({ managerThreadId: d.threadId });
            else set({ managerThreadId: null });
          })
          .catch(() => {});
        void get().fetchEstimation(pid).catch(() => {});
        return get().project;
      }
      return await get().fetchProject(projectId.trim());
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al crear etapa" });
      return null;
    }
  },

  patchWorkshopStage: async (stageId, body) => {
    const { projectId } = get();
    if (!projectId?.trim() || !stageId?.trim()) {
      set({ error: "Falta proyecto o etapa" });
      return false;
    }
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/stages/${stageId.trim()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { message?: string | string[] };
        const msg = Array.isArray(err.message) ? err.message.join("; ") : err.message;
        throw new Error(msg ?? "PATCH etapa falló");
      }
      await get().fetchProject(projectId.trim());
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al actualizar etapa" });
      return false;
    }
  },

  setProjectRequireBrdTobeGate: async (projectId, requireBrdTobeGate) => {
    if (!projectId?.trim()) {
      set({ error: "Falta proyecto" });
      return false;
    }
    // Optimistic update: reflejar cambio al instante en el store
    const prev = get().project;
    if (prev) {
      set({ project: { ...prev, requireBrdTobeGate } });
    }
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireBrdTobeGate }),
      });
      if (!r.ok) {
        // Revertir optimismo si falló
        if (prev) {
          set({ project: prev });
        }
        const err = (await r.json().catch(() => ({}))) as { message?: string | string[] };
        const msg = Array.isArray(err.message) ? err.message.join("; ") : err.message;
        throw new Error(msg ?? "PATCH proyecto falló");
      }
      await get().fetchProject(projectId.trim());
      set({ error: null });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al actualizar proyecto" });
      return false;
    }
  },

  fetchProject: async (projectId) => {
    try {
      set({ session: null, managerThreadId: null });
      const r = await apiFetch(`${API_BASE}/projects/${projectId}`);
      if (!r.ok) throw new Error("Proyecto no encontrado");
      const data: Project = await r.json();
      const stages = data.stages ?? [];
      const prev = get().activeStageId;
      const activeStageId = prev && stages.some((s) => s.id === prev) ? prev : pickDefaultStageId(stages);
      const flat = workshopFlatFromStage(data, activeStageId);
      set({
        project: { ...data, ...flat, stages },
        workshopStages: stages,
        activeStageId,
        mddContent: cleanDoc(flat.mddContent) ?? "",
        uxUiGuideContent: cleanDoc(data.uxUiGuideContent ?? null),
        dbgaContent: cleanDoc(data.dbgaContent ?? null),
        specContent: cleanDoc(data.specContent ?? null),
        phase0SummaryContent: data.phase0SummaryContent ?? null,
        blueprintContent: cleanDoc(data.blueprintContent ?? null),
        tasksContent: cleanDoc(data.tasksContent ?? null),
        apiContractsContent: cleanDoc(data.apiContractsContent ?? null),
        logicFlowsContent: cleanDoc(data.logicFlowsContent ?? null),
        architectureContent: cleanDoc(data.architectureContent ?? null),
        useCasesContent: cleanDoc(data.useCasesContent ?? null),
        userStoriesContent: cleanDoc(data.userStoriesContent ?? null),
        infraContent: cleanDoc(data.infraContent ?? null),
        aemContent: cleanDoc(data.aemContent ?? null),
        error: null,
        legacyMcpDebugTrace: null,
      });
      const sessionsRes = await apiFetch(`${API_BASE}/sessions/project/${projectId}`);
      if (sessionsRes.ok) {
        const sessions: Session[] = await sessionsRes.json();
        set({ session: sessions.length > 0 ? sessions[0] : null });
      }
      const sid = get().activeStageId;
      const threadQs = new URLSearchParams({ projectId });
      if (sid) threadQs.set("stageId", sid);
      const threadRes = await apiFetch(`${API_BASE}/ai-analysis/mdd/thread?${threadQs.toString()}`).catch(() => null);
      if (threadRes?.ok) {
        const threadData = (await threadRes.json()) as { threadId?: string | null };
        if (threadData.threadId) {
          set({ managerThreadId: threadData.threadId });
        }
      }
      // Break stack to avoid recursion
      setTimeout(() => {
        get().fetchEstimation(projectId).catch(() => { });
        get().fetchAdrs(projectId).catch(() => { });
      }, 0);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar proyecto";
      set({ error: msg });
      return null;
    }
  },

  fetchWelcome: async (projectId, activeTab) => {
    const { session } = get();
    if (!projectId?.trim()) return;
    set({ loading: true, error: null });
    try {
      const stageWelcome = get().activeStageId;
      const r = await apiFetch(`${API_BASE}/ai-orchestrator/welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId: session?.id,
          activeTab: activeTab ?? undefined,
          ...(stageWelcome ? { stageId: stageWelcome } : {}),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al cargar bienvenida");
      }
      const data: { session: Session; project: Project } = await r.json();
      const p = data.project;
      const stages = p.stages ?? [];
      const prev = get().activeStageId;
      const activeStageId = prev && stages.some((s) => s.id === prev) ? prev : pickDefaultStageId(stages);
      const flat = workshopFlatFromStage(p, activeStageId);
      set({
        session: data.session,
        project: { ...p, ...flat, stages },
        workshopStages: stages,
        activeStageId,
        mddContent: cleanDoc(flat.mddContent ?? null) ?? get().mddContent,
        uxUiGuideContent: cleanDoc(p.uxUiGuideContent ?? null),
        dbgaContent: cleanDoc(p.dbgaContent ?? null),
        specContent: cleanDoc(p.specContent ?? null),
        phase0SummaryContent: p.phase0SummaryContent ?? null,
        blueprintContent: cleanDoc(p.blueprintContent ?? null),
        tasksContent: cleanDoc(p.tasksContent ?? null),
        apiContractsContent: cleanDoc(p.apiContractsContent ?? null),
        logicFlowsContent: cleanDoc(p.logicFlowsContent ?? null),
        architectureContent: cleanDoc(p.architectureContent ?? null),
        useCasesContent: cleanDoc(p.useCasesContent ?? null),
        userStoriesContent: cleanDoc(p.userStoriesContent ?? null),
        infraContent: cleanDoc(p.infraContent ?? null),
        aemContent: cleanDoc(p.aemContent ?? null),
        synced: true,
        error: null,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al cargar bienvenida",
        synced: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  clearChat: async (projectId, activeTab) => {
    const { session } = get();
    if (!projectId?.trim()) return;
    set({ loading: true, error: null, managerThreadId: null });
    try {
      const r = await apiFetch(`${API_BASE}/ai-orchestrator/clear-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sessionId: session?.id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al borrar historial");
      }
      const data: { session: Session | null; project: Project } = await r.json();
      const p = data.project;
      const stages = p.stages ?? [];
      const prev = get().activeStageId;
      const activeStageId = prev && stages.some((s) => s.id === prev) ? prev : pickDefaultStageId(stages);
      const flat = workshopFlatFromStage(p, activeStageId);
      set({
        session: data.session,
        project: { ...p, ...flat },
        activeStageId,
        error: null,
        managerThreadId: null,
        evaluatorCritique: null,
        streamingUserMessage: null,
        streamingUserImages: null,
        streamingContent: null,
        streamingTab: null,
      });
      if (data.session) {
        await get().fetchWelcome(projectId, activeTab);
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al borrar historial",
      });
    } finally {
      set({ loading: false });
    }
  },

  sendMessage: async (message, activeTab, options) => {
    const { projectId, session } = get();
    const images = options?.images ?? [];
    if (!projectId?.trim() || (!message.trim() && !images.length)) return;
    const tab = activeTab ?? "mdd";
    const msg = message.trim();
    const regenerateSection = options?.regenerateSection;

    // Comandos /: solo si el cliente pide regenerar una sección (2–7). Resto del tiempo → Manager/resume.
    if (tab === "mdd" && session?.id && typeof regenerateSection === "number" && regenerateSection >= 1 && regenerateSection <= 7) {
      set({
        loading: true,
        loadingReason: "mdd",
        error: null,
        synced: false,
        agentProgress: [{ agent: "Regenerando sección", message: `§${regenerateSection}...` }],
      });
      try {
        const appendRes = await apiFetch(`${API_BASE}/sessions/${session.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: sessionMessageBody({ role: "user", content: msg, tab: "mdd" }, get().activeStageId),
        });
        if (appendRes.ok) {
          const updatedSession = (await appendRes.json()) as Session;
          set({ session: updatedSession });
        }
        const mddContent = (get().mddContent ?? get().project?.mddContent ?? "").trim();
        const regStage = get().activeStageId;
        const r = await apiFetch(`${API_BASE}/ai-analysis/mdd/stream/regenerate-section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            section: regenerateSection,
            mddContent: mddContent || undefined,
            ...(regStage ? { stageId: regStage } : {}),
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Error al regenerar sección");
        }
        const reader = r.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed) as { type: string; agent?: string; markdown?: string; message?: string; precision?: number; status?: string; precisionBreakdown?: PrecisionBreakdown };
                if (event.type === "progress" && event.agent != null && event.message != null) {
                  set((s) => ({ agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }] }));
                } else if (event.type === "done" && event.markdown != null && event.markdown.trim().length > 80) {
                  set({ mddContent: event.markdown });
                  const { persistMddContent, fetchProject, fetchEstimation, fetchConformance } = get();
                  await persistMddContent(event.markdown, { force: true });
                  await fetchProject(projectId);
                  fetchEstimation(projectId).catch(() => { });
                  fetchConformance(projectId).catch(() => { });
                  const current = get();
                  set({
                    project: current.project ? { ...current.project, mddContent: event.markdown } : null,
                    loading: false,
                    loadingReason: null,
                    agentProgress: [],
                    evaluatorCritique: null,
                  });
                  const assistantRes = await apiFetch(`${API_BASE}/sessions/${session.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: sessionMessageBody(
                      {
                        role: "assistant",
                        content: `Sección §${regenerateSection} regenerada. Revisa el documento en el panel central.`,
                        tab: "mdd",
                      },
                      get().activeStageId,
                    ),
                  });
                  if (assistantRes.ok) {
                    const sess = (await assistantRes.json()) as Session;
                    set({ session: sess });
                  }
                  return;
                } else if (event.type === "blocked" && event.message) {
                  set({
                    error: String(event.message),
                    loading: false,
                    loadingReason: null,
                    agentProgress: [],
                    evaluatorCritique: null,
                  });
                  return;
                } else if (event.type === "error" && event.message) {
                  set({ error: event.message, loading: false, loadingReason: null, agentProgress: [], evaluatorCritique: null });
                  return;
                }
              } catch {
                // ignore parse
              }
            }
          }
        }
        set({ loading: false, loadingReason: null, agentProgress: [], evaluatorCritique: null });
      } catch (e) {
        set({
          error: e instanceof Error ? friendlyFetchError(e) : "Error al regenerar sección",
          loading: false,
          loadingReason: null,
          agentProgress: [],
          evaluatorCritique: null,
        });
      }
      return;
    }

    if (tab === "mdd" && session?.id) {
      const managerThreadId = get().managerThreadId;
      const wantsManager = true;

      const looksLikeMddDocument =
        msg.length > 500 &&
        /^#\s*Master\s+Design\s+Document/i.test(msg) &&
        /\n##\s*1\.\s*Contexto/i.test(msg);
      const messageToSend = looksLikeMddDocument ? "" : msg;
      const messageForApi =
        messageToSend ||
        (managerThreadId != null ? "sí" : "Quiero refinar el MDD según los requisitos que indiqué.");
      if (looksLikeMddDocument) {
        console.warn("[Workshop] El mensaje parece el documento MDD, no la petición del usuario; se envía texto por defecto al API.");
      }

      if (wantsManager) {
        set({
          loading: true,
          loadingReason: "mdd",
          error: null,
          synced: false,
          agentProgress: [],
          streamingUserMessage: looksLikeMddDocument
            ? messageForApi
            : msg || (images.length ? "(Imagen adjunta)" : ""),
          streamingUserImages: images.length ? images : null,
          pendingPlanApproval: null,
          mddJustGeneratedFromBenchmark: false,
          evaluatorCritique: null,
        });
        try {
          if (!looksLikeMddDocument) {
            const appendRes = await apiFetch(`${API_BASE}/sessions/${session.id}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: sessionMessageBody(
                {
                  role: "user",
                  content: msg || (images.length ? "(Imagen adjunta)" : msg),
                  tab: "mdd",
                  ...(images.length ? { images } : {}),
                },
                get().activeStageId,
              ),
            });
            if (!appendRes.ok) throw new Error("Error al enviar mensaje");
            const updatedSession = (await appendRes.json()) as Session;
            set({ session: updatedSession });
          }
          set({ streamingUserMessage: null, streamingUserImages: null });

          const url =
            managerThreadId != null
              ? `${API_BASE}/ai-analysis/mdd/stream/resume`
              : `${API_BASE}/ai-analysis/mdd/stream/manager`;
          const mddStage = get().activeStageId;
          const draftForMdd = (get().mddContent ?? get().project?.mddContent ?? "").trim() || undefined;
          const body =
            managerThreadId != null
              ? {
                projectId,
                threadId: managerThreadId,
                userMessage: messageForApi,
                mddContent: draftForMdd,
                ...(images.length ? { images } : {}),
              }
              : {
                projectId,
                dbgaContent: (get().dbgaContent ?? get().project?.dbgaContent ?? "").trim() || undefined,
                initialMessage: messageForApi,
                mddContent: draftForMdd,
                ...(mddStage ? { stageId: mddStage } : {}),
                ...(images.length ? { images } : {}),
              };
          const r = await apiFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.message ?? "Error en el flujo MDD");
          }
          const reader = r.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                  const event = JSON.parse(trimmed) as {
                    type: string;
                    agent?: string;
                    message?: string;
                    reply?: string;
                    questions?: string[];
                    threadId?: string;
                    markdown?: string;
                    precision?: number;
                    status?: "red" | "yellow" | "green";
                    precisionBreakdown?: PrecisionBreakdown;
                    auditorFeedback?: string;
                    auditTrail?: string[];
                    /** Plan para aprobación (HITL 4.4) */
                    plan?: Array<{ step_id: string; task_description: string; node: string }>;
                    planMessage?: string;
                  };
                  if (event.type === "progress" && event.agent != null && event.message != null) {
                    set((s) => ({
                      agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }],
                    }));
                  } else if (event.type === "draft" && event.markdown != null && event.markdown.trim().length > 80) {
                    set({ mddContent: event.markdown });
                  } else if (event.type === "interrupt") {
                    set({
                      managerThreadId: event.threadId ?? get().managerThreadId ?? null,
                      pendingPlanApproval:
                        Array.isArray(event.plan) && event.plan.length > 0
                          ? { plan: event.plan, planMessage: event.planMessage ?? "¿Ejecutar este plan?" }
                          : null,
                    });
                    if (event.markdown != null && event.markdown.trim().length > 80) {
                      set({ mddContent: event.markdown });
                      const { persistMddContent, fetchProject, fetchEstimation } = get();
                      await persistMddContent(event.markdown);
                      const errBeforeFetch = get().error;
                      await fetchProject(projectId);
                      if (errBeforeFetch) set({ error: errBeforeFetch });
                      await fetchEstimation(projectId);
                      const current = get();
                      set({
                        mddContent: event.markdown,
                        project: current.project ? { ...current.project, mddContent: event.markdown } : null,
                      });
                    }
                    // No sobrescribir mddContent con markdown vacío (auditar puede venir de checkpoint sin draft)

                    const precisionBreakdown = event.precisionBreakdown;
                    const auditorFeedback = event.auditorFeedback;
                    const auditTrail = event.auditTrail;

                    // Actualizar estado para el semáforo/modal, NO enviar al chat
                    if (precisionBreakdown || auditTrail || auditorFeedback) {
                      set({
                        precisionBreakdown: precisionBreakdown ?? get().precisionBreakdown,
                        auditTrail: auditTrail ?? get().auditTrail,
                        auditorFeedback: auditorFeedback ?? get().auditorFeedback
                      });
                    }

                    // Calculamos clarifierContent siempre (plan_approval usa planMessage)
                    const clarifierContent =
                      Array.isArray(event.plan) && event.plan.length > 0 && event.planMessage
                        ? event.planMessage
                        : event.reply != null && event.reply !== ""
                          ? event.reply
                          : Array.isArray(event.questions) && event.questions.length > 0
                            ? event.questions.join("\n\n")
                            : "Responde en el chat para continuar con la entrevista (objetivos del sistema, integraciones, etc.).";

                    // Ya NO enviamos auditContent al chat explícitamente, solo clarifierContent
                    const messagesToPost: string[] = [clarifierContent];
                    let sess = get().session;
                    for (const content of messagesToPost) {
                      const appendAssistant = await apiFetch(`${API_BASE}/sessions/${session.id}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: sessionMessageBody({ role: "assistant", content, tab: "mdd" }, get().activeStageId),
                      });
                      if (appendAssistant.ok) {
                        sess = (await appendAssistant.json()) as Session;
                        set({ session: sess });
                      }
                    }
                    set({
                      loading: false,
                      loadingReason: null,
                      agentProgress: [],
                      streamingUserMessage: null,
                      streamingUserImages: null,
                      streamingContent: null,
                      evaluatorCritique: null,
                    });
                    return;
                  } else if (event.type === "done" && event.markdown != null) {
                    set({ managerThreadId: null, pendingPlanApproval: null });
                    const markdownOk = event.markdown.trim().length > 80;
                    const mddBeforeFetch = (get().mddContent ?? "").trim();
                    if (markdownOk) set({ mddContent: event.markdown });

                    const precisionBreakdown = (event as any).precisionBreakdown;
                    const auditTrail = (event as any).auditTrail;
                    const auditorFeedback = (event as any).auditorFeedback;

                    if (precisionBreakdown || auditTrail || auditorFeedback) {
                      set({
                        precisionBreakdown: precisionBreakdown ?? get().precisionBreakdown,
                        auditTrail: auditTrail ?? get().auditTrail,
                        auditorFeedback: auditorFeedback ?? get().auditorFeedback
                      });
                    }

                    const { persistMddContent, fetchProject, fetchEstimation } = get();
                    if (markdownOk) await persistMddContent(event.markdown);
                    const errorBeforeFetch = get().error;
                    await fetchProject(projectId);
                    if (errorBeforeFetch) set({ error: errorBeforeFetch });
                    await fetchEstimation(projectId);
                    if (markdownOk) {
                      const current = get();
                      set({
                        mddContent: event.markdown,
                        project: current.project ? { ...current.project, mddContent: event.markdown } : null,
                      });
                    } else if (mddBeforeFetch.length > 80) {
                      // `done` con markdown corto (p. ej. placeholder) no debe vaciar borradores ya mostrados por eventos `draft`.
                      const current = get();
                      const flat = workshopFlatFromStage(current.project as Project, get().activeStageId);
                      const serverMdd = (cleanDoc(flat.mddContent) ?? "").trim();
                      if (serverMdd.length < mddBeforeFetch.length) {
                        set({
                          mddContent: mddBeforeFetch,
                          project: current.project ? { ...current.project, mddContent: mddBeforeFetch } : current.project,
                        });
                      }
                    }

                    const assistantContent = "MDD generado. Revisa el documento en el panel central.";
                    const assistantRes = await apiFetch(`${API_BASE}/sessions/${session.id}/messages`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: sessionMessageBody(
                        { role: "assistant", content: assistantContent, tab: "mdd" },
                        get().activeStageId,
                      ),
                    });
                    if (assistantRes.ok) {
                      const sess = (await assistantRes.json()) as Session;
                      set({ session: sess });
                    }
                    set({
                      loading: false,
                      loadingReason: null,
                      agentProgress: [],
                      streamingUserMessage: null,
                      streamingUserImages: null,
                      streamingContent: null,
                      pendingPlanApproval: null,
                      evaluatorCritique: null,
                    });
                    return;
                  } else if (event.type === "blocked" && event.message) {
                    set({
                      managerThreadId: null,
                      pendingPlanApproval: null,
                      error: String(event.message),
                      loading: false,
                      loadingReason: null,
                      agentProgress: [],
                      streamingUserMessage: null,
                      streamingUserImages: null,
                      streamingContent: null,
                      evaluatorCritique: null,
                    });
                    return;
                  } else if (event.type === "error" && event.message) {
                    set({
                      managerThreadId: null,
                      pendingPlanApproval: null,
                      error: String(event.message),
                      loading: false,
                      loadingReason: null,
                      agentProgress: [],
                      streamingUserMessage: null,
                      streamingUserImages: null,
                      streamingContent: null,
                      evaluatorCritique: null,
                    });
                    return;
                  }
                } catch (_) {
                  // ignore
                }
              }
            }
          }
        } catch (e) {
          set({
            managerThreadId: null,
            pendingPlanApproval: null,
            error: friendlyFetchError(e),
            loading: false,
            loadingReason: null,
            agentProgress: [],
            streamingUserMessage: null,
            streamingUserImages: null,
            evaluatorCritique: null,
          });
          return;
        }
      }

      // No encadenar `ai-orchestrator/chat/stream` tras el Manager MDD: un segundo stream vaciaba el
      // panel (done del orquestador trae `project` sin MDD persistido) y duplicaba respuesta en chat.
      set({
        loading: false,
        loadingReason: null,
        agentProgress: [],
        streamingUserMessage: null,
        streamingUserImages: null,
        streamingContent: null,
        streamingTab: null,
      });
      return;
    } else {
      // Chat genérico para Guía UX/UI, benchmark, spec, etc. (tabs que no usan el flujo MDD/Manager)
      set({
        loading: true,
        error: null,
        synced: false,
        streamingUserMessage: msg || (images.length ? "(Imagen adjunta)" : ""),
        streamingUserImages: images.length ? images : null,
        streamingContent: "",
        streamingTab: tab,
        evaluatorCritique: null,
      });
      try {
        const body: Record<string, unknown> = {
          projectId,
          sessionId: session?.id,
          message: msg || "",
          mddContent: get().mddContent || undefined,
          uxUiGuideContent: get().uxUiGuideContent ?? get().project?.uxUiGuideContent ?? undefined,
          activeTab: tab,
        };
        {
          const sf = get().activeStageId;
          if (sf) body.stageId = sf;
        }
        if (tab === "benchmark") {
          const dbga = get().dbgaContent ?? get().project?.dbgaContent ?? null;
          if (dbga != null) body.dbgaContent = dbga;
        }
        if (tab === "brd") {
          const aid = get().activeStageId;
          const st = get().project?.stages?.find((x) => x.id === aid);
          if (tab === "brd") body.brdContent = st?.brdContent ?? "";
        }
        if (tab === "spec") {
          const sc = get().specContent ?? get().project?.specContent;
          if (sc != null && String(sc).trim()) body.specContent = sc;
        }
        if (tab === "architecture") {
          const ac = get().architectureContent;
          if (ac != null && String(ac).trim()) body.architectureContent = ac;
        }
        if (tab === "blueprint") {
          const bc = get().blueprintContent;
          if (bc != null && String(bc).trim()) body.blueprintContent = bc;
        }
        if (tab === "use-cases") {
          const uc = get().useCasesContent;
          if (uc != null && String(uc).trim()) body.useCasesContent = uc;
        }
        if (tab === "user-stories") {
          const us = get().userStoriesContent;
          if (us != null && String(us).trim()) body.userStoriesContent = us;
        }
        if (tab === "api-contracts") {
          const ac = get().apiContractsContent;
          if (ac != null && String(ac).trim()) body.apiContractsContent = ac;
        }
        if (tab === "logic-flows") {
          const lf = get().logicFlowsContent;
          if (lf != null && String(lf).trim()) body.logicFlowsContent = lf;
        }
        if (tab === "tasks") {
          const tc = get().tasksContent;
          if (tc != null && String(tc).trim()) body.tasksContent = tc;
        }
        if (tab === "infra") {
          const ic = get().infraContent;
          if (ic != null && String(ic).trim()) body.infraContent = ic;
        }
        if (images.length) body.images = images;
        const r = await apiFetch(`${API_BASE}/ai-orchestrator/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Error en la entrevista");
        }
        const reader = r.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        if (!reader) throw new Error("No se pudo leer el stream");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const block of lines) {
            let event = "";
            let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
            }
            if (!event || !dataStr) continue;
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "chunk" && typeof data.content === "string") {
                set((s) => ({ streamingContent: (s.streamingContent ?? "") + data.content }));
              } else if (event === "done") {
                const sess = data.session as Session | undefined;
                const proj = data.project as Project | undefined;
                const uxFromApi = (data.uxUiGuideContent ?? proj?.uxUiGuideContent) as string | null | undefined;
                const packed = projectWithUxAfterStream(proj, uxFromApi, get().activeStageId);
                const nextStages = packed?.project?.stages ?? proj?.stages;
                const freshUx = cleanDoc(uxFromApi ?? get().uxUiGuideContent ?? null);
                set({
                  session: sess ?? get().session,
                  project: packed?.project ?? get().project,
                  activeStageId: packed?.activeStageId ?? get().activeStageId,
                  mddContent: packed?.mddContent ?? get().mddContent,
                  workshopStages: nextStages && nextStages.length > 0 ? nextStages : get().workshopStages,
                  uxUiGuideContent: freshUx,
                  dbgaContent: cleanDoc(proj?.dbgaContent ?? null) ?? get().dbgaContent,
                  specContent: cleanDoc(proj?.specContent ?? null) ?? get().specContent,
                  architectureContent: cleanDoc(proj?.architectureContent ?? null) ?? get().architectureContent,
                  useCasesContent: cleanDoc(proj?.useCasesContent ?? null) ?? get().useCasesContent,
                  userStoriesContent: cleanDoc(proj?.userStoriesContent ?? null) ?? get().userStoriesContent,
                  blueprintContent: cleanDoc(proj?.blueprintContent ?? null) ?? get().blueprintContent,
                  apiContractsContent: cleanDoc(proj?.apiContractsContent ?? null) ?? get().apiContractsContent,
                  logicFlowsContent: cleanDoc(proj?.logicFlowsContent ?? null) ?? get().logicFlowsContent,
                  tasksContent: cleanDoc(proj?.tasksContent ?? null) ?? get().tasksContent,
                  infraContent: cleanDoc(proj?.infraContent ?? null) ?? get().infraContent,
                  streamingUserMessage: null,
                  streamingUserImages: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                  error: null,
                  evaluatorCritique: pickEvaluatorCritique(data),
                });
                // Auto-persist UX/UI guide when the orchestrator returns content on its tab
                if (tab === "ux-ui-guide" && freshUx) {
                  get().persistUxUiGuideContent(freshUx).catch(() => {});
                }
              } else if (event === "error" && data.error) {
                set({
                  error: String(data.error),
                  streamingUserMessage: null,
                  streamingUserImages: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                });
              }
            } catch (_) {
              // ignore parse errors for partial chunks
            }
          }
        }
        if (buffer.trim()) {
          let event = "";
          let dataStr = "";
          for (const line of buffer.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (event && dataStr) {
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "chunk" && typeof data.content === "string") {
                set((s) => ({ streamingContent: (s.streamingContent ?? "") + data.content }));
              } else if (event === "done") {
                const sess = data.session as Session | undefined;
                const proj = data.project as Project | undefined;
                const uxFromApi = (data.uxUiGuideContent ?? proj?.uxUiGuideContent) as string | null | undefined;
                const packed = projectWithUxAfterStream(proj, uxFromApi, get().activeStageId);
                const nextStagesB = packed?.project?.stages ?? proj?.stages;
                const freshUx = cleanDoc(uxFromApi ?? get().uxUiGuideContent ?? null);
                set({
                  session: sess ?? get().session,
                  project: packed?.project ?? get().project,
                  activeStageId: packed?.activeStageId ?? get().activeStageId,
                  mddContent: packed?.mddContent ?? get().mddContent,
                  workshopStages: nextStagesB && nextStagesB.length > 0 ? nextStagesB : get().workshopStages,
                  uxUiGuideContent: freshUx,
                  dbgaContent: cleanDoc(proj?.dbgaContent ?? null) ?? get().dbgaContent,
                  specContent: cleanDoc(proj?.specContent ?? null) ?? get().specContent,
                  blueprintContent: cleanDoc(proj?.blueprintContent ?? null) ?? get().blueprintContent,
                  apiContractsContent: cleanDoc(proj?.apiContractsContent ?? null) ?? get().apiContractsContent,
                  logicFlowsContent: cleanDoc(proj?.logicFlowsContent ?? null) ?? get().logicFlowsContent,
                  tasksContent: cleanDoc(proj?.tasksContent ?? null) ?? get().tasksContent,
                  architectureContent: cleanDoc(proj?.architectureContent ?? null) ?? get().architectureContent,
                  useCasesContent: cleanDoc(proj?.useCasesContent ?? null) ?? get().useCasesContent,
                  userStoriesContent: cleanDoc(proj?.userStoriesContent ?? null) ?? get().userStoriesContent,
                  infraContent: cleanDoc(proj?.infraContent ?? null) ?? get().infraContent,
                  streamingUserMessage: null,
                  streamingUserImages: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                  error: null,
                  evaluatorCritique: pickEvaluatorCritique(data),
                });
                // Auto-persist UX/UI guide when the orchestrator returns content on its tab
                if (tab === "ux-ui-guide" && freshUx) {
                  get().persistUxUiGuideContent(freshUx).catch(() => {});
                }
              } else if (event === "error" && data.error) {
                set({
                  error: String(data.error),
                  streamingUserMessage: null,
                  streamingUserImages: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                });
              }
            } catch (_) {
              // ignore
            }
          }
        }
      } catch (e) {
        set({
          error: e instanceof Error ? friendlyFetchError(e) : "Error al enviar",
          streamingUserMessage: null,
          streamingUserImages: null,
          streamingContent: null,
          streamingTab: null,
          synced: true,
        });
      } finally {
        set({ loading: false });
      }
    }
  },

  updateMddContent: (content) => set({ mddContent: content }),

  setUxUiGuideContent: (content) => set({ uxUiGuideContent: content }),
  persistUxUiGuideContent: async (content) => {
    await persistField("uxUiGuideContent", content, get, set);
  },

  setBlueprintContent: (content) => set({ blueprintContent: content }),

  persistBlueprintContent: async (content) => {
    await persistField("blueprintContent", content, get, set);
  },

  generateBlueprint: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    // Preview mode eliminado — regeneración directa
    // Normal: encolar con queueAndPoll
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = {};
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const data = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-blueprint`, body);
      const raw = data.blueprintContent ?? "";
      const cleaned = raw.replace(/^\s*```(?:markdown)?\s*/i, "").replace(/^\s*```\s*/, "").replace(/\s*```\s*$/, "");
      const proj = { ...data, blueprintContent: cleaned || null };
      set({ project: proj, blueprintContent: cleaned || null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return proj;
    } catch (e) {
      set({ error: friendlyFetchError(e) });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setApiContractsContent: (content) => set({ apiContractsContent: content }),
  persistApiContractsContent: async (content) => {
    await persistField("apiContractsContent", content, get, set);
  },
  generateApiContracts: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    const conformancePreCheck = () => {
      const dm = get().conformance?.blueprintDataModel;
      if (dm && !dm.ok) {
        const hint = dm.gaps.length ? ` (${dm.gaps.slice(0, 2).join("; ")}${dm.gaps.length > 2 ? "…" : ""})` : "";
        set({ error: `El Blueprint debe cubrir el modelo de datos del MDD (§3) antes de generar Contratos API.${hint}` });
        return false;
      }
      return true;
    };
    // Preview mode eliminado — regeneración directa
    await get().fetchConformance(projectId.trim());
    if (!conformancePreCheck()) return null;
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = {};
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const proj = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-api-contracts`, body);
      set({ project: proj, apiContractsContent: proj.apiContractsContent ?? null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return proj;
    } catch (e) { set({ error: friendlyFetchError(e) }); return null; }
    finally { set({ loading: false }); }
  },

  setLogicFlowsContent: (content) => set({ logicFlowsContent: content }),
  persistLogicFlowsContent: async (content) => {
    await persistField("logicFlowsContent", content, get, set);
  },
  generateLogicFlows: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = {};
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const data = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-logic-flows`, body);
      set({ project: data, logicFlowsContent: data.logicFlowsContent ?? null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return data;
    } catch (e) { set({ error: friendlyFetchError(e) }); return null; }
    finally { set({ loading: false }); }
  },

  setInfraContent: (content) => set({ infraContent: content }),
  persistInfraContent: async (content) => {
    await persistField("infraContent", content, get, set);
  },
  generateInfra: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    // Preview mode eliminado — regeneración directa
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = {};
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const proj = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-infra`, body);
      set({ project: proj, infraContent: proj.infraContent ?? null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return proj;
    } catch (e) { set({ error: friendlyFetchError(e) }); return null; }
    finally { set({ loading: false }); }
  },

  setArchitectureContent: (content) => set({ architectureContent: content }),
  persistArchitectureContent: async (content) => {
    await persistField("architectureContent", content, get, set);
  },
  generateArchitecture: async (projectId) => {
    if (!projectId?.trim()) return null;
    // Preview mode eliminado — regeneración directa
    set({ loading: true, error: null });
    try {
      const proj = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-architecture`, {});
      set({ project: proj, architectureContent: proj.architectureContent ?? null, error: null });
      return proj;
    } catch (e) { set({ error: friendlyFetchError(e) }); return null; }
    finally { set({ loading: false }); }
  },

  setUseCasesContent: (content) => set({ useCasesContent: content }),
  persistUseCasesContent: async (content) => {
    await persistField("useCasesContent", content, get, set);
  },
  generateUseCases: async (projectId) => {
    if (!projectId?.trim()) return null;
    // Preview mode eliminado — regeneración directa
    set({ loading: true, error: null });
    try {
      const proj = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-use-cases`, {});
      set({ project: proj, useCasesContent: proj.useCasesContent ?? null, error: null });
      return proj;
    } catch (e) { set({ error: friendlyFetchError(e) }); return null; }
    finally { set({ loading: false }); }
  },

  setUserStoriesContent: (content) => set({ userStoriesContent: content }),
  persistUserStoriesContent: async (content) => {
    await persistField("userStoriesContent", content, get, set);
  },
  generateUserStories: async (projectId) => {
    if (!projectId?.trim()) return null;
    // Preview mode eliminado — regeneración directa
    set({ loading: true, error: null });
    try {
      const proj = await queueAndPoll<Project>(`${API_BASE}/projects/${projectId}/generate-user-stories`, {});
      set({ project: proj, userStoriesContent: proj.userStoriesContent ?? null, error: null });
      return proj;
    } catch (e) { set({ error: friendlyFetchError(e) }); return null; }
    finally { set({ loading: false }); }
  },

  setSpecContent: (content) => set({ specContent: content }),
  persistSpecContent: async (content) => {
    await persistField("specContent", content, get, set);
  },
  setAemContent: (content) => set({ aemContent: content }),
  persistAemContent: async (content) => {
    await persistField("aemContent", content, get, set);
  },
  generateSpec: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/generate-spec`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar Spec");
      }
      const data: Project = await r.json();
      // Limpiar etiquetas markdown que a veces genera el LLM
      const raw = data.specContent ?? "";
      const cleaned = raw.replace(/^\s*```(?:markdown)?\s*/i, "").replace(/^\s*```\s*/, "").replace(/\s*```\s*$/, "");

      const newData = { ...data, specContent: cleaned || null };
      set({ project: newData, specContent: cleaned || null, error: null });
      return newData;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Spec" });
      return null;
    } finally {
      set({ loading: false });
    }
  },
  setTasksContent: (content) => set({ tasksContent: content }),
  persistTasksContent: async (content) => {
    await persistField("tasksContent", content, get, set);
  },
  generateTasks: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/generate-tasks`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar Tasks");
      }
      const data: Project = await r.json();
      set({ project: data, tasksContent: data.tasksContent ?? null, error: null });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Tasks" });
      return null;
    } finally {
      set({ loading: false });
    }
  },
  generateDeliverablesCascade: async (projectId) => {
    if (!projectId?.trim()) return null;
    const pid = projectId.trim();
    set({ loading: true, loadingReason: "deliverables-cascade", error: null, agentProgress: [] });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${pid}/generate-deliverables`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar entregables");
      }
      const data = (await r.json()) as { queued?: boolean; jobId?: string; streamPath?: string };
      if (data.queued === true && typeof data.jobId === "string") {
        const deadline = Date.now() + 45 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const st = await apiFetch(`${API_BASE}/projects/${pid}/deliverables-jobs/${data.jobId}`);
          if (!st.ok) {
            const err = await st.json().catch(() => ({}));
            throw new Error((err as { message?: string }).message ?? "Error al consultar cola de entregables");
          }
          const j = (await st.json()) as {
            state: string;
            progress?: { step?: string; index?: number; total?: number };
            failedReason?: string;
          };
          if (j.state === "failed") {
            throw new Error(j.failedReason ?? "Cascada de entregables fallida");
          }
          if (j.state === "completed") break;
          const prog = j.progress;
          if (prog && typeof prog.index === "number" && typeof prog.total === "number") {
            set({
              agentProgress: [
                {
                  agent: "Entregables",
                  message: `${String(prog.step ?? "paso")} (${prog.index + 1}/${prog.total})`,
                },
              ],
            });
          }
        }
        set({ agentProgress: [] });
        const projQueued = await get().fetchProject(pid);
        await get().fetchEstimation(pid).catch(() => {});
        return projQueued;
      }
      const projSync = await get().fetchProject(pid);
      await get().fetchEstimation(pid).catch(() => {});
      return projSync;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar entregables", agentProgress: [] });
      return null;
    } finally {
      set({ loading: false, loadingReason: null });
    }
  },

  confirmComplexityProposal: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/confirm-complexity`, {
        method: "POST",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo confirmar la complejidad");
      }
      return await get().fetchProject(projectId.trim());
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al confirmar complejidad" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  dismissComplexityProposal: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearComplexityPending: true }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo descartar la propuesta");
      }
      return await get().fetchProject(projectId.trim());
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al descartar propuesta" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  reassessComplexity: async (projectId, note) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/reassess-complexity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note?.trim() ? { note: note.trim() } : {}),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "No se pudo re-valorar la complejidad");
      }
      return await get().fetchProject(projectId.trim());
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al re-valorar" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  fetchConformance: async (projectId, options) => {
    if (!projectId?.trim()) return;
    const useLlm = options?.useLlm === true;
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/conformance${useLlm ? "?useLlm=true" : ""}`);
      if (r.ok) {
        const data = (await r.json()) as {
          blueprint: ConformanceResult;
          blueprintDataModel?: ConformanceResult;
          api: ApiConformanceResult;
          logicFlows: ConformanceResult;
          infra: ConformanceResult;
        };
        set({
          conformance: {
            ...data,
            blueprintDataModel: data.blueprintDataModel ?? { ok: true, gaps: [] },
          },
        });
      }
    } catch {
      set({ conformance: null });
    }
  },
  verifyDeliverable: async (projectId, deliverable) => {
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/verify-deliverable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverable }),
      });
      if (!r.ok) throw new Error("Error al verificar");
      const text = await r.text();
      return text.replace(/^["']|["']$/g, "").trim();
    } catch {
      return "";
    }
  },
  setDbgaContent: (content) => set({ dbgaContent: content }),

  persistDbgaContent: async (content) => {
    await persistField("dbgaContent", content, get, set);
  },

  setAgentProgress: (progress) => set({ agentProgress: progress }),

  generateBenchmark: async (projectId, userIdea) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "benchmark", error: null, agentProgress: [] });
    try {
      const r = await apiFetch(`${API_BASE}/ai-analysis/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: userIdea?.trim() ?? "",
          projectId: projectId.trim(),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar Benchmark & Gap Analysis");
      }
      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMarkdown: string | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as {
                type: string;
                agent?: string;
                message?: string;
                markdown?: string;
                complexityProposal?: ComplexityPending;
              };
              if (event.type === "progress" && event.agent != null && event.message != null) {
                set((s) => ({ agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }] }));
              } else if (event.type === "done" && event.markdown != null) {
                finalMarkdown = event.markdown;
                if (event.complexityProposal != null) {
                  set((s) => ({
                    project:
                      s.project != null
                        ? { ...s.project, complexityPending: event.complexityProposal! }
                        : s.project,
                  }));
                }
              } else if (event.type === "error" && event.message) {
                throw new Error(event.message);
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }
      }

      if (finalMarkdown != null) {
        set({ dbgaContent: finalMarkdown, error: null });
        const { persistDbgaContent, fetchProject } = get();
        await persistDbgaContent(finalMarkdown);
        const data = await fetchProject(projectId);
        return data ?? get().project;
      }
      return get().project;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Benchmark" });
      return null;
    } finally {
      set({ loading: false, loadingReason: null, agentProgress: [] });
    }
  },

  generateMddFromBenchmark: async (projectId) => {
    if (!projectId?.trim()) return null;
    const dbgaContent = (get().dbgaContent ?? get().project?.dbgaContent ?? "").trim();
    set({ loading: true, loadingReason: "mdd", error: null, agentProgress: [] });

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError: string | null = null;
    let accumulatedMdd: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const benchStage = get().activeStageId;
        const r = await apiFetch(`${API_BASE}/ai-analysis/mdd/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dbgaContent: dbgaContent || undefined,
            projectId: projectId.trim(),
            ...(benchStage ? { stageId: benchStage } : {}),
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Error al generar MDD");
        }
        const reader = r.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalMarkdown: string | null = null;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed) as { type: string; agent?: string; message?: string; markdown?: string };
                if (event.type === "progress" && event.agent != null && event.message != null) {
                  set((s) => ({ agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }] }));
                } else if (event.type === "draft" && event.markdown != null && event.markdown.trim().length > 80) {
                  accumulatedMdd = event.markdown;
                  set({ mddContent: event.markdown });
                } else if (event.type === "done" && event.markdown != null) {
                  finalMarkdown = event.markdown;
                } else if (event.type === "blocked" && event.message) {
                  throw new Error(String(event.message));
                } else if (event.type === "error" && event.message) {
                  throw new Error(event.message);
                }
              } catch (parseErr) {
                if (parseErr instanceof SyntaxError) continue;
                throw parseErr;
              }
            }
          }
        }

        if (finalMarkdown != null && finalMarkdown.trim().length > 80) {
          set({ mddContent: finalMarkdown, error: null, mddJustGeneratedFromBenchmark: true });
          const { persistMddContent, fetchProject, fetchEstimation } = get();
          await persistMddContent(finalMarkdown);
          // Si persistMddContent falló (pipeline validation, etc.), mostrar el error en vez de recargar silenciosamente
          if (get().error) {
            set({ loading: false, loadingReason: null, agentProgress: [] });
            return get().project;
          }
          const data = await fetchProject(projectId);
          await fetchEstimation(projectId);
          set({ loading: false, loadingReason: null, agentProgress: [] });
          return data ?? get().project;
        }
        // Si llegamos aquí sin finalMarkdown pero con accumulatedMdd, usar accumulated
        if (accumulatedMdd && accumulatedMdd.trim().length > 80) {
          set({ mddContent: accumulatedMdd, error: null, mddJustGeneratedFromBenchmark: true });
          const { persistMddContent, fetchProject, fetchEstimation } = get();
          await persistMddContent(accumulatedMdd);
          if (get().error) {
            set({ loading: false, loadingReason: null, agentProgress: [] });
            return get().project;
          }
          const data = await fetchProject(projectId);
          await fetchEstimation(projectId);
          set({ loading: false, loadingReason: null, agentProgress: [] });
          return data ?? get().project;
        }
        set({ loading: false, loadingReason: null, agentProgress: [] });
        return get().project;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "Error al generar MDD";
        // Si tenemos contenido acumulado, guardarlo antes de reintentar
        if (accumulatedMdd && accumulatedMdd.trim().length > 80) {
          set({ mddContent: accumulatedMdd });
          const { persistMddContent } = get();
          await persistMddContent(accumulatedMdd).catch(() => {});
        }
        if (attempt < MAX_RETRIES) {
          console.log(`[MDD Retry] attempt ${attempt}/${MAX_RETRIES} failed: ${lastError}. Retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          set({ agentProgress: [] });
        }
      }
    }

    set({ error: lastError ?? "Error al generar MDD tras reintentos" });
    set({ loading: false, loadingReason: null, agentProgress: [] });
    return null;
  },

  clearMddJustGeneratedFromBenchmark: () => set({ mddJustGeneratedFromBenchmark: false }),

  setPhase0SummaryContent: (content) => set({ phase0SummaryContent: content }),

  persistPhase0SummaryContent: async (content) => {
    await persistField("phase0SummaryContent", content, get, set);
  },

  phase0DeepResearch: async (projectId, opts) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "phase0-deep-research", error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/phase0-deep-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdea: opts.userIdea?.trim() || undefined,
          urls: opts.urls?.length ? opts.urls : undefined,
          includeBenchmark: opts.includeBenchmark ?? false,
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        let errMessage = "Error al generar Deep Research";
        try {
          const err = JSON.parse(raw) as { message?: string };
          if (err?.message) errMessage = err.message;
        } catch {
          if (raw.trim().length > 0 && raw.length < 500) errMessage = raw;
        }
        throw new Error(errMessage);
      }
      let data: Project;
      try {
        data = JSON.parse(raw) as Project;
      } catch {
        console.error("[phase0DeepResearch] Respuesta no es JSON. Preview:", raw.slice(0, 200));
        throw new Error(
          "El servidor devolvió texto en lugar de JSON (posible fallo del proveedor de IA). Intenta de nuevo.",
        );
      }
      set({ project: data, phase0SummaryContent: data.phase0SummaryContent ?? null, error: null });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Deep Research" });
      return null;
    } finally {
      set({ loading: false, loadingReason: null });
    }
  },

  clearDbgaContent: async (projectId) => {
    if (!projectId?.trim()) return;
    try {
      void apiFetch(
        `${API_BASE}/ai-analysis/dbga/checkpoint?projectId=${encodeURIComponent(projectId.trim())}`,
        { method: "DELETE" },
      ).catch(() => { });
      const r = await apiFetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbgaContent: null }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, dbgaContent: data.dbgaContent ?? null });
      }
    } catch {
      // ignore
    }
  },

  fetchEstimation: async (projectId) => {
    if (!projectId?.trim()) return null;
    try {
      const currentMdd = (get().mddContent ?? get().project?.mddContent ?? "").trim();
      const sid = get().activeStageId;
      const r = await apiFetch(`${API_BASE}/ai-analysis/estimation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          ...(currentMdd ? { mddContent: currentMdd } : {}),
          ...(sid ? { stageId: sid } : {}),
        }),
      });
      if (!r.ok) return null;
      const data = (await r.json()) as LiveMetricsResult & { precisionBreakdown?: PrecisionBreakdown; completeness?: DocumentCompleteness; crossDocumentGaps?: CrossDocumentGap[]; consistencyScore?: number };
      const { precisionBreakdown, completeness, crossDocumentGaps, consistencyScore, ...metrics } = data;
      set({
        liveMetrics: metrics,
        ...(precisionBreakdown != null ? { precisionBreakdown } : {}),
        ...(completeness != null ? { documentCompleteness: completeness } : {}),
        ...(crossDocumentGaps != null ? { crossDocumentGaps } : {}),
        ...(consistencyScore != null ? { consistencyScore } : {}),
      });
      return metrics;
    } catch {
      return null;
    }
  },

  clearPhase0SummaryContent: async (projectId) => {
    if (!projectId?.trim()) return;
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase0SummaryContent: null }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, phase0SummaryContent: data.phase0SummaryContent ?? null });
      }
    } catch {
      // ignore
    }
  },

  legacyGenerateCodebaseDoc: async (projectId, opts) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "legacy-codebase-doc", error: null });
    try {
      const body: Record<string, unknown> = {};
      if (opts?.responseMode !== undefined) body.responseMode = opts.responseMode;
      if (opts?.stageId?.trim()) body.stageId = opts.stageId.trim();
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/legacy/generate-codebase-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar documentación");
      }
      const data = (await r.json()) as {
        codebaseDoc: string;
        mcpDebugTrace?: LegacyMcpDebugEntry[];
      } | null;
      await get().fetchProject(projectId);
      if (data == null) {
        set({
          loading: false,
          loadingReason: null,
          error:
            "No se pudo generar el MDD inicial: TheForge MCP no está configurado en el backend o la respuesta fue vacía. Revisa THEFORGE_MCP_URL.",
          legacyMcpDebugTrace: null,
        });
        return null;
      }
      set({
        loading: false,
        loadingReason: null,
        error: null,
        legacyMcpDebugTrace: data.mcpDebugTrace ?? null,
      });
      return data;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al generar documentación",
        loading: false,
        loadingReason: null,
        legacyMcpDebugTrace: null,
      });
      return null;
    }
  },

  legacyUpdateCodebaseDoc: async (projectId, codebaseDoc) => {
    if (!projectId?.trim()) return false;
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/legacy/codebase-doc`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codebaseDoc }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al guardar documentación");
      }
      await get().fetchProject(projectId);
      return true;
    } catch {
      return false;
    }
  },

  legacyStart: async (projectId, description, stageId) => {
    if (!projectId?.trim() || !description?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = { description: description.trim() };
      if (stageId?.trim()) body.stageId = stageId.trim();
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/legacy/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al analizar con Relic");
      }
      const data = (await r.json()) as {
        filesToModify: (string | { path: string; repoId?: string })[];
        questions: string[];
        suggestedAnswers?: Record<string, string>;
      };
      await get().fetchProject(projectId);
      set({ loading: false, error: null });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error legacy start", loading: false });
      return null;
    }
  },

  legacyAnswer: async (projectId, answers, stageId) => {
    if (!projectId?.trim()) return false;
    set({ loading: true, error: null });
    try {
      const body: Record<string, unknown> = { answers: answers ?? {} };
      if (stageId?.trim()) body.stageId = stageId.trim();
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/legacy/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al guardar respuestas");
      }
      await get().fetchProject(projectId);
      set({ loading: false, error: null });
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error legacy answer", loading: false });
      return false;
    }
  },

  legacyGenerateMdd: async (projectId, stageId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "legacy-mdd", error: null });
    try {
      const body: Record<string, unknown> = {};
      if (stageId?.trim()) body.stageId = stageId.trim();
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/legacy/generate-mdd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar MDD");
      }
      const data = (await r.json()) as { mddContent: string };
      await get().fetchProject(projectId);
      set({
        mddContent: data.mddContent ?? get().project?.mddContent ?? "",
        loading: false,
        loadingReason: null,
        error: null,
      });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar MDD legacy", loading: false, loadingReason: null });
      return null;
    }
  },

  legacyGenerateAsIsManual: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "legacy-as-is", error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/legacy/generate-as-is-manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar As-Is");
      }
      const data = (await r.json()) as { asIsManualContent: string; stageId: string };
      await get().fetchProject(projectId.trim());
      set({ loading: false, loadingReason: null, error: null });
      return data;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al generar manual As-Is",
        loading: false,
        loadingReason: null,
      });
      return null;
    }
  },

  legacySuggestBrdFromCodebaseDoc: async (projectId, stageId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "legacy-brd-suggest", error: null });
    const body: Record<string, string> = {};
    if (stageId?.trim()) body.stageId = stageId.trim();
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/legacy/suggest-brd-from-codebase-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar BRD");
      }
      const data = (await r.json()) as { brdContent: string; stageId: string };
      await get().fetchProject(projectId.trim());
      set({ loading: false, loadingReason: null, error: null });
      return data;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al sugerir BRD",
        loading: false,
        loadingReason: null,
      });
      return null;
    }
  },

  legacyGenerateFromCodebaseDoc: async (projectId, documentType, stageId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "legacy-brd-suggest", error: null });
    const body: { documentType: string; stageId?: string } = { documentType };
    if (stageId?.trim()) body.stageId = stageId.trim();
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/legacy/generate-from-codebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar documento");
      }
      const data = (await r.json()) as { content: string; field: string };
      await get().fetchProject(projectId.trim());
      set({ loading: false, loadingReason: null, error: null });
      return data;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al generar documento desde codebase",
        loading: false,
        loadingReason: null,
      });
      return null;
    }
  },

  suggestBrdFromDbga: async (projectId, opts) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "brd-from-dbga", error: null });
    try {
      const body: { stageId?: string } = {};
      const sid = opts?.stageId?.trim();
      if (sid) body.stageId = sid;
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/suggest-brd-from-dbga`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al generar BRD desde DBGA");
      }
      const data = (await r.json()) as { brdContent: string; stageId: string };
      await get().fetchProject(projectId.trim());
      set({ loading: false, loadingReason: null, error: null });
      return data;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al sugerir BRD desde DBGA",
        loading: false,
        loadingReason: null,
      });
      return null;
    }
  },

  legacyGenerateDeliverables: async (projectId) => {
    if (!projectId?.trim()) return false;
    set({ loading: true, loadingReason: "legacy-deliverables", error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/legacy/generate-deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as {
          message?: string;
          lastDeliverablesDebug?: LegacyDeliverablesDebugReport;
          retryAfterSeconds?: number;
        };
        if (r.status === 429 && err.lastDeliverablesDebug) {
          set({ lastLegacyDeliverablesDebug: err.lastDeliverablesDebug });
        }
        const suffix =
          r.status === 429 && typeof err.retryAfterSeconds === "number"
            ? ` Reintenta en ~${err.retryAfterSeconds}s (límite TPM/RPM del proveedor).`
            : "";
        throw new Error((err.message ?? "Error al generar entregables") + suffix);
      }
      const data = (await r.json()) as { ok?: boolean; lastDeliverablesDebug?: LegacyDeliverablesDebugReport };
      if (import.meta.env.DEV && data.lastDeliverablesDebug) {
        console.debug("[LegacyDeliverables]", data.lastDeliverablesDebug);
      }
      set({ lastLegacyDeliverablesDebug: data.lastDeliverablesDebug ?? null });
      const proj = await get().fetchProject(projectId);
      set({ loading: false, loadingReason: null, error: null });
      return proj != null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      // Log error to console for debugging
      console.error("[workshopStore] legacyGenerateDeliverables error:", msg, e);
      set({ error: msg, loading: false, loadingReason: null });
      return false;
    }
  },

  persistMddContent: async (content, options) => {
    const { projectId, project, fetchEstimation } = get();
    if (!projectId || !project) return;
    if (!options?.force && content === (project.mddContent ?? "")) return;
    set({ synced: false, error: null });
    try {
      const stageId = get().activeStageId;
      const r = await apiFetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mddContent: content, ...(stageId ? { stageId } : {}) }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        const packed = projectWithUxAfterStream(data, data.uxUiGuideContent, get().activeStageId);
        const savedContent = packed?.mddContent ?? data.mddContent ?? content;
        set({
          project: packed?.project ?? data,
          activeStageId: packed?.activeStageId ?? get().activeStageId,
          mddContent: savedContent,
          synced: true,
          error: null,
        });
        await apiFetch(`${API_BASE}/ai-analysis/estimation/clear-draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: projectId.trim(),
            ...(stageId ? { stageId } : {}),
          }),
        }).catch(() => { });
        fetchEstimation(projectId).catch(() => { });
      } else {
        const errBody = await r.json().catch(() => ({}));
        const message = typeof errBody?.message === "string" ? errBody.message : "Error al guardar el MDD";
        set({ synced: false, error: message });
      }
    } catch {
      set({ synced: false, error: "Error de red al guardar" });
    }
  },

  revertMddContent: () => {
    const { project } = get();
    set({ mddContent: project?.mddContent ?? "" });
  },

  /** Persiste el MDD y refresca estimación/semáforo. No reemplaza el contenido por la respuesta del review
   *  para que las ediciones manuales del usuario se respeten. */
  persistAndReviewMdd: async () => {
    const { projectId, project, mddContent, persistMddContent, fetchEstimation } = get();
    if (!projectId?.trim() || !project) return;
    const content = (mddContent ?? "").trim();
    if (content === (project.mddContent ?? "")) return;
    set({ mddReviewing: true });
    try {
      await persistMddContent(content);
      await apiFetch(`${API_BASE}/ai-analysis/mdd/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projectId.trim(), mddContent: content }),
      });
      fetchEstimation(projectId).catch(() => { });
    } finally {
      set({ mddReviewing: false });
    }
  },

  fetchAdrs: async (projectId) => {
    try {
      const r = await apiFetch(`${API_BASE}/ai-analysis/mdd/adrs?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const data = await r.json();
        set({ adrs: data });
      }
    } catch (err) {
      console.error("Error fetching ADRs:", err);
    }
  },
  launchHermes: async (projectId: string) => {
    if (!projectId?.trim()) return;
    set({ loading: true, loadingReason: "launch-hermes", error: null });
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/launch-hermes`, {
        method: "POST",
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Error al lanzar a Hermes");
      }
      const data = (await r.json()) as { success: boolean; status: number };
      return data;
    } finally {
      set({ loading: false, loadingReason: null });
    }
  },
  reset: () => set(initialState),
}));
