import type { DBGAStateType } from "../state/index.js";

/** Máximo de bucles scout→auditor→critic antes de forzar síntesis. */
export const MAX_CRITIC_ITERATIONS = 2;

/** After Critic: re-research (scout) or continue to Synthesis. */
export function routeDbgaAfterCritic(
  state: Pick<DBGAStateType, "criticIterations" | "competitors" | "criticDecision">,
  maxIterations = MAX_CRITIC_ITERATIONS,
): "scout" | "synthesis" {
  const iterations = state.criticIterations ?? 0;
  if (iterations >= maxIterations) return "synthesis";
  if (state.competitors.length === 0 && iterations >= 2) return "synthesis";
  return state.criticDecision === "scout" ? "scout" : "synthesis";
}
