/**
 * Utilidades LLM globales (sin claves ni modelos desde env — BYOK por usuario).
 */

export const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_CHAT_MODEL = "nousresearch/hermes-3-llama-3.1-405b";
export const OPENROUTER_DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** Referencia de catálogo OpenRouter; el runtime usa `ProviderInstance.visionModel` (BYOK). */
export const OPENROUTER_DEFAULT_VISION_MODEL = "openai/gpt-4o";

export function llmMaxTokens(): number {
  const raw = process.env.LLM_MAX_TOKENS?.trim();
  if (raw === undefined || raw === "") return 120_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 120_000;
}

/**
 * Dimensión de embeddings: preferir runtime BYOK; env solo como fallback de servidor.
 * @deprecated Preferir `runtime.embeddingDimension` desde `resolveEmbeddingRuntime`.
 */
export function resolveEmbeddingDimension(runtimeDim?: number | null): number {
  if (runtimeDim != null && runtimeDim > 0) return runtimeDim;
  const envDim = process.env.OPENAI_EMBEDDING_DIM || process.env.EMBEDDING_DIM;
  const dim = envDim ? parseInt(envDim, 10) : 0;
  if (Number.isFinite(dim) && dim > 0) return dim;
  return 1536;
}

/**
 * LangChain / ChatOpenAI: temperatura fija coherente con el workshop.
 */
export function resolveLangChainChatTemperature(override?: number): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return 0.5;
}

/** @deprecated BYOK: sin snapshot desde env */
export function getLlmProvidersSnapshot(): { id: string; chatConfigured: boolean; active: boolean }[] {
  return [];
}

/** Fallback 429 en cadena de modelos (cuando el usuario define chatModelFallbacks en extras). */
export function isChatFallbackOn429Enabled(hasFallbacks = true): boolean {
  if (!hasFallbacks) return false;
  const raw = process.env.OPENROUTER_CHAT_FALLBACK_ON_429?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}
