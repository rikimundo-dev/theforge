/** Tabs cuyo chat usa orquestador y persiste documento vía ---FIN_TAG---. */
export const ORCHESTRATOR_DOC_TABS = new Set([
  "spec",
  "architecture",
  "use-cases",
  "user-stories",
  "blueprint",
  "api-contracts",
  "logic-flows",
  "tasks",
  "infra",
  "brd",
  "benchmark",
  "ux-ui-guide",
  "phase0",
]);

const DOC_CLAIMS_EDIT_RE =
  /\b(ajust(?:e|é|amos|ado)|elimin(?:e|é|amos|ado)|actualic(?:e|é|amos|ado)|modifiqu(?:e|é|amos|ado)|reescrib(?:i|í|imos|ido)|ya\s+no\s+(contiene|menciona|incluye)|sin\s+referencias|sin\s+menciones|qued[oó]\s+(ajustad|actualizad)|hemos\s+(ajustad|actualizad|eliminad|modificad)|no\s+(contiene|menciona|incluye)\s+(ya|más)|se\s+(ajust|actualiz|modific|elimin)[oa]|documento\s+(est[aá]|qued[oó])|he\s+(actualizado|modificado|eliminado|ajustado)|actualizaci[oó]n\s+(complet|realiz)|cambios?\s+(aplicad|realizad|incorporad))\b/i;

const CHANGE_INTENT_RE =
  /\b(no\s+veo\s+(los\s+)?cambios|sigue\s+(haciendo\s+)?menci|a[uú]n\s+(dice|menciona|tiene|aparece|contiene)|no\s+se\s+(reflej|aplic|guard)|documento\s+sigue|persiste|sigue\s+igual|no\s+se\s+usar[aá]?|cambiar|cambio|reemplaz|sustitu|modific|actualiz|eliminar|quita(?:r|n|do)?|en\s+vez\s+de|en\s+lugar\s+de|ajust|agrega|añade|corrige|usa[r]?\s+(dokploy|docker|kubernetes))\b/i;

export function chatClaimsDocumentWasModified(text: string): boolean {
  const t = (text ?? "").trim();
  return t.length >= 20 && DOC_CLAIMS_EDIT_RE.test(t);
}

export function looksLikeOrchestratorDocModificationRequest(msg: string): boolean {
  const t = (msg ?? "").trim();
  if (t.length < 8) return false;
  if (/^\s*¿/.test(t) && !CHANGE_INTENT_RE.test(t)) return false;
  return CHANGE_INTENT_RE.test(t);
}

export type OrchestratorDocSnapshotSource = {
  specContent?: string | null;
  architectureContent?: string | null;
  useCasesContent?: string | null;
  userStoriesContent?: string | null;
  blueprintContent?: string | null;
  apiContractsContent?: string | null;
  logicFlowsContent?: string | null;
  tasksContent?: string | null;
  infraContent?: string | null;
  dbgaContent?: string | null;
  uxUiGuideContent?: string | null;
  phase0SummaryContent?: string | null;
  project?: {
    specContent?: string | null;
    architectureContent?: string | null;
    useCasesContent?: string | null;
    userStoriesContent?: string | null;
    blueprintContent?: string | null;
    apiContractsContent?: string | null;
    logicFlowsContent?: string | null;
    tasksContent?: string | null;
    infraContent?: string | null;
    dbgaContent?: string | null;
    uxUiGuideContent?: string | null;
    phase0SummaryContent?: string | null;
    stages?: Array<{ id: string; brdContent?: string | null }>;
  } | null;
  activeStageId?: string | null;
};

export function orchestratorDocSnapshot(source: OrchestratorDocSnapshotSource, tab: string): string {
  const p = source.project;
  switch (tab) {
    case "spec":
      return (source.specContent ?? p?.specContent ?? "").trim();
    case "architecture":
      return (source.architectureContent ?? p?.architectureContent ?? "").trim();
    case "use-cases":
      return (source.useCasesContent ?? p?.useCasesContent ?? "").trim();
    case "user-stories":
      return (source.userStoriesContent ?? p?.userStoriesContent ?? "").trim();
    case "blueprint":
      return (source.blueprintContent ?? p?.blueprintContent ?? "").trim();
    case "api-contracts":
      return (source.apiContractsContent ?? p?.apiContractsContent ?? "").trim();
    case "logic-flows":
      return (source.logicFlowsContent ?? p?.logicFlowsContent ?? "").trim();
    case "tasks":
      return (source.tasksContent ?? p?.tasksContent ?? "").trim();
    case "infra":
      return (source.infraContent ?? p?.infraContent ?? "").trim();
    case "benchmark":
      return (source.dbgaContent ?? p?.dbgaContent ?? "").trim();
    case "ux-ui-guide":
      return (source.uxUiGuideContent ?? p?.uxUiGuideContent ?? "").trim();
    case "phase0":
      return (source.phase0SummaryContent ?? p?.phase0SummaryContent ?? "").trim();
    case "brd": {
      const st = p?.stages?.find((x) => x.id === source.activeStageId);
      return (st?.brdContent ?? "").trim();
    }
    default:
      return "";
  }
}

const TAB_LABELS: Record<string, string> = {
  spec: "Spec",
  architecture: "Arquitectura",
  "use-cases": "Casos de uso",
  "user-stories": "Historias de usuario",
  blueprint: "Blueprint",
  "api-contracts": "Contratos API",
  "logic-flows": "Flujos lógicos",
  tasks: "Tasks",
  infra: "Infraestructura",
  brd: "BRD",
  benchmark: "Benchmark",
  "ux-ui-guide": "Guía UX/UI",
  phase0: "Fase 0",
};

const FIN_TAGS: Record<string, string> = {
  spec: "SPEC",
  architecture: "ARCH",
  "use-cases": "USECASES",
  "user-stories": "STORIES",
  blueprint: "BLUEPRINT",
  "api-contracts": "API",
  "logic-flows": "FLOWS",
  tasks: "TASKS",
  infra: "INFRA",
  brd: "BRD",
  benchmark: "DBGA",
  "ux-ui-guide": "UX_UI",
  phase0: "PHASE0",
};

export function orchestratorDocUnchangedError(tab: string): string {
  const label = TAB_LABELS[tab] ?? "documento";
  const fin = FIN_TAGS[tab] ?? "TAG";
  return `El chat indicó cambios pero ${label} no se actualizó. El asistente debe devolver el markdown completo terminando en ---FIN_${fin}---. Reformula el pedido o pide "aplica los cambios al documento".`;
}

export function extractOrchestratorDocFromDone(
  data: Record<string, unknown>,
  tab: string,
  snapshotSource: OrchestratorDocSnapshotSource,
): string {
  const p = data.project as OrchestratorDocSnapshotSource["project"] | undefined;
  switch (tab) {
    case "spec":
      return clean((data.specContent as string | undefined) ?? p?.specContent);
    case "architecture":
      return clean((data.architectureContent as string | undefined) ?? p?.architectureContent);
    case "use-cases":
      return clean((data.useCasesContent as string | undefined) ?? p?.useCasesContent);
    case "user-stories":
      return clean((data.userStoriesContent as string | undefined) ?? p?.userStoriesContent);
    case "blueprint":
      return clean((data.blueprintContent as string | undefined) ?? p?.blueprintContent);
    case "api-contracts":
      return clean((data.apiContractsContent as string | undefined) ?? p?.apiContractsContent);
    case "logic-flows":
      return clean((data.logicFlowsContent as string | undefined) ?? p?.logicFlowsContent);
    case "tasks":
      return clean((data.tasksContent as string | undefined) ?? p?.tasksContent);
    case "infra":
      return clean((data.infraContent as string | undefined) ?? p?.infraContent);
    case "benchmark":
      return clean((data.dbgaContent as string | undefined) ?? p?.dbgaContent);
    case "ux-ui-guide":
      return clean((data.uxUiGuideContent as string | undefined) ?? p?.uxUiGuideContent);
    case "phase0":
      return clean((data.phase0SummaryContent as string | undefined) ?? p?.phase0SummaryContent);
    case "brd": {
      const stageId = snapshotSource.activeStageId;
      const st = p?.stages?.find((x) => x.id === stageId);
      return clean((data.brdContent as string | undefined) ?? st?.brdContent);
    }
    default:
      return "";
  }
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function lastAssistantChatForTab(
  chatLog: Array<{ role: string; content?: string; tab?: string }> | undefined,
  tab: string,
): string {
  if (!chatLog?.length) return "";
  for (let i = chatLog.length - 1; i >= 0; i--) {
    const m = chatLog[i];
    if (!m) continue;
    if (m.role === "assistant" && (m.tab ?? tab) === tab && typeof m.content === "string") {
      return m.content.trim();
    }
  }
  return "";
}

export function detectOrchestratorDocUnchanged(params: {
  tab: string;
  snapshotBefore: string;
  docAfter: string;
  userMessage: string;
  assistantReply: string;
}): boolean {
  const { tab, snapshotBefore, docAfter, userMessage, assistantReply } = params;
  if (!ORCHESTRATOR_DOC_TABS.has(tab)) return false;
  if (snapshotBefore.length < 80) return false;
  if (docAfter !== snapshotBefore) return false;
  const userWantsEdit = looksLikeOrchestratorDocModificationRequest(userMessage);
  const assistantClaims = chatClaimsDocumentWasModified(assistantReply);
  return userWantsEdit || assistantClaims;
}

export function resolveOrchestratorDocUnchangedError(params: {
  tab: string;
  snapshotBefore: string;
  data: Record<string, unknown>;
  snapshotSource: OrchestratorDocSnapshotSource;
  userMessage: string;
  session?: { chatLog?: Array<{ role: string; content?: string; tab?: string }> } | null;
}): string | null {
  const docAfter = extractOrchestratorDocFromDone(params.data, params.tab, params.snapshotSource);
  const assistantReply = lastAssistantChatForTab(params.session?.chatLog, params.tab);
  if (
    detectOrchestratorDocUnchanged({
      tab: params.tab,
      snapshotBefore: params.snapshotBefore,
      docAfter,
      userMessage: params.userMessage,
      assistantReply,
    })
  ) {
    return orchestratorDocUnchangedError(params.tab);
  }
  return null;
}
