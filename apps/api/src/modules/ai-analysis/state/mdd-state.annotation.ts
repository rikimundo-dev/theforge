import { Annotation } from "@langchain/langgraph";
import type { MddStructured } from "./mdd-structured.schema.js";
import type { AuditorGapsState, MDDAuditorDecision, MddPlanStep } from "./mdd-state.schema.js";

/**
 * Combina actualizaciones concurrentes de mddDraft en el mismo paso del grafo.
 * Evita INVALID_CONCURRENT_GRAPH_UPDATE (LastValue) cuando resume + nodo escriben el borrador.
 * Prefiere el texto más largo (suele ser el documento completo vs. fragmento).
 */
export function reduceMddDraft(left: string, right: string): string {
  const a = (left ?? "").trim();
  const b = (right ?? "").trim();
  if (!b) return a;
  if (!a) return b;
  return b.length >= a.length ? b : a;
}

/** Fusiona escrituras concurrentes de escalares (p. ej. projectId en Command.update + nodo reanudado). */
export function reducePreferDefined<T>(left: T | undefined, right: T | undefined): T | undefined {
  if (right !== undefined && right !== null) return right;
  return left;
}

/**
 * LangGraph State annotation for the MDD workflow.
 * Use when building StateGraph<typeof MDDStateAnnotation.State>.
 */
export const MDDStateAnnotation = Annotation.Root({
  dbgaContent: Annotation<string>(),
  clarifiedScope: Annotation<string>(),
  mddStructured: Annotation<MddStructured | undefined>(),
  mddDraft: Annotation<string>({
    reducer: reduceMddDraft,
    default: () => "",
  }),
  auditorScore: Annotation<number>(),
  auditorFeedback: Annotation<string | undefined>(),
  auditorGaps: Annotation<AuditorGapsState | undefined>(),
  auditorDecision: Annotation<MDDAuditorDecision | undefined>(),
  mddIteration: Annotation<number | undefined>(),
  managerQuestions: Annotation<string[] | undefined>(),
  userInputAccumulated: Annotation<string | undefined>(),
  managerRound: Annotation<number | undefined>(),
  lastUserMessage: Annotation<string | undefined>(),
  requestQuestionsOnly: Annotation<boolean | undefined>(),
  clarifierJustGeneratedQuestions: Annotation<boolean | undefined>(),
  askedInitialTopicQuestion: Annotation<boolean | undefined>(),
  delegateTarget: Annotation<"clarifier_only" | "full_pipeline" | "sections" | undefined>(),
  previousMddDraftForMerge: Annotation<string | undefined>(),
  sectionsToRun: Annotation<string[] | undefined>(),
  acceptedProposalDirective: Annotation<string | undefined>(),
  lastStepFailed: Annotation<{ node: string; error: string } | undefined>(),
  mddPlan: Annotation<MddPlanStep[] | undefined>(),
  pendingPlanApproval: Annotation<{
    mddPlan: MddPlanStep[];
    delegateTarget: "clarifier_only" | "full_pipeline" | "sections";
    sectionsToRun?: string[];
    previousMddDraftForMerge?: string;
    goto: string;
  } | undefined>(),
  planUserIntent: Annotation<string | undefined>(),
  executorControlled: Annotation<boolean | undefined>(),
  mddPlanCurrentStep: Annotation<number | undefined>(),
  currentStepAllowedTools: Annotation<string[] | undefined>(),
  currentStepGoal: Annotation<string | undefined>(),
  architectCriticFeedback: Annotation<string | undefined>(),
  architectCriticAttempts: Annotation<number | undefined>(),
  projectId: Annotation<string | undefined>({ reducer: reducePreferDefined }),
  activeStageId: Annotation<string | undefined>({ reducer: reducePreferDefined }),
  isLegacyProject: Annotation<boolean | undefined>({ reducer: reducePreferDefined }),
  theforgeProjectId: Annotation<string | undefined>({ reducer: reducePreferDefined }),
  episodicMemoryContext: Annotation<string | undefined>({ reducer: reducePreferDefined }),
  mddComplexity: Annotation<"LOW" | "MEDIUM" | "HIGH" | undefined>({ reducer: reducePreferDefined }),
  /** Lista de directivas internas enviadas entre agentes (Mesh Topology). */
  internalDirectives: Annotation<
    Array<{ from: string; to: string; message: string; timestamp?: string }> | undefined
  >({
    reducer: (old, newVal) => {
      // Si se pasa un array vacío, reseteamos la lista (consumo de directivas)
      if (newVal && Array.isArray(newVal) && newVal.length === 0) return [];
      if (!newVal) return old;
      return (old ?? []).concat(newVal);
    },
    default: () => [],
  }),
  impactSummary: Annotation<string | undefined>(),
  blackboardReasoning: Annotation<string | undefined>(),
});

export type MDDStateType = typeof MDDStateAnnotation.State;
export type MDDStateUpdate = typeof MDDStateAnnotation.Update;
