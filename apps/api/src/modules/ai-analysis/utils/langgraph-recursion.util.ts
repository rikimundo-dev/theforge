/** LangGraph default recursion limit is 25; MDD con Manager puede superarlo. Override: `LANGGRAPH_RECURSION_LIMIT` (10–500). */
export function resolveLangGraphRecursionLimit(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.LANGGRAPH_RECURSION_LIMIT?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 10 && n <= 500) return Math.floor(n);
  }
  return 100;
}
