import { Annotation } from "@langchain/langgraph";
import type { CompetitorData, CriticDecision, DBGAStatus } from "./dbga-state.schema.js";

/** Reducer for techStackInsights: last write wins (replace, not append). */
export function reduceTechStackInsights(
  _left: string[],
  right: string | string[],
): string[] {
  return Array.isArray(right) ? right : [right];
}

/**
 * LangGraph State annotation for the DBGA workflow.
 * Strictly typed; matches DBGAState from dbga-state.schema.
 * Use this when building StateGraph<typeof DBGAStateAnnotation.State>.
 */
export const DBGAStateAnnotation = Annotation.Root({
  rawIdea: Annotation<string>(),
  competitors: Annotation<CompetitorData[]>({
    reducer: (_left, right) => (Array.isArray(right) ? right : [right]),
    default: () => [],
  }),
  techStackInsights: Annotation<string[]>({
    reducer: reduceTechStackInsights,
    default: () => [],
  }),
  userPainPoints: Annotation<string[]>({
    reducer: (left, right) =>
      Array.isArray(right) ? left.concat(right) : left.concat([right]),
    default: () => [],
  }),
  gapAnalysis: Annotation<string>(),
  status: Annotation<DBGAStatus>(),
  criticDecision: Annotation<CriticDecision | undefined>(),
  refinedQuery: Annotation<string | undefined>(),
  userPreferences: Annotation<string | undefined>(),
  criticIterations: Annotation<number | undefined>(),
});

/** Inferred state type for nodes: (state: DBGAStateType) => Partial<DBGAStateType> */
export type DBGAStateType = typeof DBGAStateAnnotation.State;

/** Update type returned by nodes */
export type DBGAStateUpdate = typeof DBGAStateAnnotation.Update;
