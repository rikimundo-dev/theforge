import { Annotation } from "@langchain/langgraph";
import type { MddStructured } from "./mdd-structured.schema.js";
import type { AuditorGapsState, MDDAuditorDecision, MddPlanStep } from "./mdd-state.schema.js";

/**
 * LangGraph State annotation for the MDD workflow.
 * Use when building StateGraph<typeof MDDStateAnnotation.State>.
 */
export const MDDStateAnnotation = Annotation.Root({
  dbgaContent: Annotation<string>(),
  clarifiedScope: Annotation<string>(),
  mddStructured: Annotation<MddStructured | undefined>(),
  mddDraft: Annotation<string>(),
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
  projectId: Annotation<string | undefined>(),
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
