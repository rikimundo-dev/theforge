/** Slice mínimo del workshop store para saber si hay trabajo de agentes en curso. */
export type WorkshopAgentsBusySlice = {
  loading: boolean;
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
    | "agent-governance"
    | "launch-hermes"
    | null;
  streamingUserMessage: string | null;
  streamingContent: string | null;
  agentProgress: ReadonlyArray<unknown>;
  mddReviewing: boolean;
  pendingPlanApproval: unknown | null;
};

const AGENT_LOADING_REASONS = new Set<NonNullable<WorkshopAgentsBusySlice["loadingReason"]>>([
  "benchmark",
  "mdd",
  "phase0-deep-research",
  "legacy-codebase-doc",
  "legacy-mdd",
  "legacy-as-is",
  "legacy-brd-suggest",
  "brd-from-dbga",
  "legacy-deliverables",
  "deliverables-cascade",
  "agent-governance",
  "launch-hermes",
]);

/** Chat en streaming, Manager MDD, cascadas, benchmark, etc. */
export function isWorkshopAgentsBusy(s: WorkshopAgentsBusySlice): boolean {
  if (s.mddReviewing) return true;
  if (s.pendingPlanApproval != null) return true;
  if (s.streamingUserMessage != null || s.streamingContent != null) return true;
  if (s.agentProgress.length > 0) return true;
  if (!s.loading) return false;
  return s.loadingReason != null && AGENT_LOADING_REASONS.has(s.loadingReason);
}

export const WORKSHOP_EXIT_BLOCKED_TITLE =
  "Los agentes siguen trabajando. Espera a que terminen antes de volver al panel de proyectos.";

export const WORKSHOP_DOC_NAV_BLOCKED_TITLE =
  "El chat está procesando un documento. Espera a que termine antes de cambiar de pestaña.";
