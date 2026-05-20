const RECURSION_LIMIT_USER_MESSAGE =
  "No se pudieron identificar competidores directos tras varios intentos. Esto suele ocurrir en dominios internos B2B o nichos muy específicos. Puedes continuar con un análisis sin competidores de referencia o reformular la idea con más contexto.";

/** Mensaje de error para el stream DBGA (sin LLM). */
export function formatDbgaStreamError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Error en el análisis";
  const isRecursionLimit =
    /recursion limit/i.test(raw) || /GRAPH_RECURSION/i.test(raw);
  return isRecursionLimit ? RECURSION_LIMIT_USER_MESSAGE : raw;
}
