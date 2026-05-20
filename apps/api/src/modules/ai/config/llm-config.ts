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
  /** Modelos de respaldo (sin el primario); vacío si no hay fallback configurado. */
  chatModelFallbacks: string[];
  embeddingModel: string;
}

function dedupeModelsInOrder(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

function parseConfiguredChatFallbacks(): string[] {
  const listRaw = process.env.OPENROUTER_CHAT_MODEL_FALLBACKS?.trim();
  if (listRaw) {
    return listRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const single = process.env.OPENROUTER_CHAT_MODEL_FALLBACK?.trim();
  if (single) return [single];
  return [];
}

/**
 * Cadena de chat: [primary, ...fallbacks] sin duplicados. Sin fallbacks en env → solo primary.
 */
export function resolveChatModelChain(): string[] {
  const primary = process.env.OPENROUTER_CHAT_MODEL?.trim() || OPENROUTER_DEFAULT_CHAT_MODEL;
  const configured = parseConfiguredChatFallbacks();
  if (configured.length === 0) return [primary];
  return dedupeModelsInOrder([primary, ...configured]);
}

export function hasChatModelFallback(): boolean {
  return resolveChatModelChain().length > 1;
}

/**
 * 429 → siguiente modelo solo si hay fallbacks y no está desactivado (`OPENROUTER_CHAT_FALLBACK_ON_429=0`).
 */
export function isChatFallbackOn429Enabled(): boolean {
  if (!hasChatModelFallback()) return false;
  const raw = process.env.OPENROUTER_CHAT_FALLBACK_ON_429?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
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
  const chain = resolveChatModelChain();
  const chatModel = chain[0]!;
  const chatModelFallbacks = chain.slice(1);
  const embeddingModel =
    process.env.OPENROUTER_EMBEDDING_MODEL?.trim() || OPENROUTER_DEFAULT_EMBEDDING_MODEL;
  return { providerId: "openrouter", apiKey, baseURL, chatModel, chatModelFallbacks, embeddingModel };
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
 * Cadena visión: primary + `VISION_MODEL_FALLBACK` o, si no hay, fallbacks de chat cuando existan.
 */
export function resolveVisionModelChain(): string[] {
  const primary = resolveVisionModel();
  const visionFallback = process.env.VISION_MODEL_FALLBACK?.trim();
  if (visionFallback) {
    return dedupeModelsInOrder([primary, visionFallback]);
  }
  if (hasChatModelFallback()) {
    const chatFallbacks = resolveChatModelChain().slice(1);
    if (chatFallbacks.length > 0) {
      return dedupeModelsInOrder([primary, ...chatFallbacks]);
    }
  }
  return [primary];
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
