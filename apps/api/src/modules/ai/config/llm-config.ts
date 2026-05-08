/**
 * Configuración unificada de LLM: OpenRouter (chat + embeddings vía API compatible OpenAI).
 */

export const OPENROUTER_DEFAULT_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_DEFAULT_CHAT_MODEL = "nousresearch/hermes-3-llama-3.1-405b";
export const OPENROUTER_DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const OPENROUTER_DEFAULT_VISION_MODEL = "openai/gpt-4o";

export type NormalizedLlmProviderId = "openrouter";

/**
 * Clave OpenRouter. Prioridad: OPENROUTER_API_KEY → AI_API_KEY → OPENAI_API_KEY
 */
export function resolveOpenRouterApiKey(): string {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ??
    process.env.AI_API_KEY?.trim() ??
    process.env.OPENAI_API_KEY?.trim() ??
    ""
  );
}

/** Homologado: el runtime es siempre OpenRouter. */
export function normalizeLlmProviderId(_raw?: string): NormalizedLlmProviderId {
  return "openrouter";
}

export interface OpenRouterRuntime {
  providerId: "openrouter";
  apiKey: string;
  baseURL: string;
  chatModel: string;
  embeddingModel: string;
}

export type PrimaryChatRuntime = OpenRouterRuntime;

/**
 * Runtime único: OpenRouter (chat fijo a Hermes 405B salvo override por env).
 */
export function resolvePrimaryChatRuntime(): OpenRouterRuntime {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY (or AI_API_KEY / OPENAI_API_KEY) is required");
  }
  const baseURL = process.env.OPENROUTER_BASE_URL?.trim() || OPENROUTER_DEFAULT_BASE;
  const chatModel = process.env.OPENROUTER_CHAT_MODEL?.trim() || OPENROUTER_DEFAULT_CHAT_MODEL;
  const embeddingModel =
    process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || OPENROUTER_DEFAULT_EMBEDDING_MODEL;
  return { providerId: "openrouter", apiKey, baseURL, chatModel, embeddingModel };
}

/**
 * Modelo para tareas de visión (imágenes). Lee `VISION_MODEL`; fallback a OPENROUTER_CHAT_MODEL o GPT‑4o.
 */
export function resolveVisionModel(): string {
  return (
    process.env.VISION_MODEL?.trim() ??
    process.env.OPENROUTER_CHAT_MODEL?.trim() ??
    OPENROUTER_DEFAULT_VISION_MODEL
  );
}

/**
 * LangChain / ChatOpenAI: temperatura fija coherente con el workshop.
 */
export function resolveLangChainChatTemperature(_r: Pick<OpenRouterRuntime, "providerId">): number {
  return 0.5;
}

export type ResolvedEmbeddingsBackend = "openrouter" | "none";

/**
 * Embeddings: OpenRouter (mismo base URL) salvo `LLM_EMBEDDINGS_PROVIDER=none|off`.
 * Override dedicado: OPENROUTER_EMBEDDING_API_KEY (misma API, otra clave) para solo embeddings.
 */
export function resolveEmbeddingsBackend(): ResolvedEmbeddingsBackend {
  const o = process.env.LLM_EMBEDDINGS_PROVIDER?.toLowerCase().trim();
  if (o === "none" || o === "off" || o === "0" || o === "false") return "none";
  return "openrouter";
}

/**
 * Clave usada en el cliente de embeddings (OpenRouter). Si `OPENROUTER_EMBEDDING_API_KEY` está
 * vacío, reutiliza la clave de chat.
 */
export function resolveOpenRouterEmbeddingApiKey(): string | undefined {
  if (resolveEmbeddingsBackend() === "none") return undefined;
  const only =
    process.env.OPENROUTER_EMBEDDING_API_KEY?.trim() ?? process.env.OPENAI_EMBEDDING_API_KEY?.trim();
  if (only) return only;
  return resolveOpenRouterApiKey() || undefined;
}

export interface LlmProviderSnapshot {
  id: NormalizedLlmProviderId;
  chatConfigured: boolean;
  active: true;
}

export function getLlmProvidersSnapshot(): LlmProviderSnapshot[] {
  const k = Boolean(resolveOpenRouterApiKey());
  return [{ id: "openrouter", chatConfigured: k, active: true }];
}
