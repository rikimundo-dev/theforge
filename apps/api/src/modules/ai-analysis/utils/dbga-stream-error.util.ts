import { ModelsUnavailableError } from "../../ai/config/llm-model-fallback.js";

const RECURSION_LIMIT_USER_MESSAGE =
  "No se pudieron identificar competidores directos tras varios intentos. Esto suele ocurrir en dominios internos B2B o nichos muy específicos. Puedes continuar con un análisis sin competidores de referencia o reformular la idea con más contexto.";

export interface DbgaStreamErrorPayload {
  message: string;
  code?: string;
}

/** Mensaje y código opcional para eventos `error` del stream DBGA/MDD. */
export function formatDbgaStreamError(err: unknown): DbgaStreamErrorPayload {
  if (err instanceof ModelsUnavailableError) {
    return { message: err.message, code: err.code };
  }
  const raw = err instanceof Error ? err.message : "Error en el análisis";
  const isRecursionLimit =
    /recursion limit/i.test(raw) || /GRAPH_RECURSION/i.test(raw);
  return {
    message: isRecursionLimit ? RECURSION_LIMIT_USER_MESSAGE : raw,
  };
}
