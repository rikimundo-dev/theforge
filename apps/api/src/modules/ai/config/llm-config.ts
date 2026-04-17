/**
 * Configuración unificada de LLM: un solo punto de lectura de env para chat, embeddings
 * y listado de proveedores configurados (sin nuevas claves secretas; solo alias y flags opcionales).
 */

export type NormalizedLlmProviderId = "openai" | "google" | "kimi";

/**
 * Clave para APIs compatibles con OpenAI (OpenAI, Moonshot/Kimi, etc.).
 * Prioridad: `AI_API_KEY` → `OPENAI_API_KEY` (alias retrocompatible).
 */
export function resolveAiCompatibleApiKey(): string {
  return process.env.AI_API_KEY?.trim() ?? process.env.OPENAI_API_KEY?.trim() ?? "";
}

/** Alias homologados: gemini→google, moonshot→kimi. Fuente: AI_PROVIDER */
export function normalizeLlmProviderId(raw?: string): NormalizedLlmProviderId {
  const p = (raw ?? process.env.AI_PROVIDER ?? "openai").toLowerCase().trim();
  if (p === "google" || p === "gemini") return "google";
  if (p === "kimi" || p === "moonshot") return "kimi";
  return "openai";
}

export interface OpenAiCompatibleRuntime {
  providerId: "openai" | "kimi";
  apiKey: string;
  /** Vacío = cliente OpenAI oficial (default del SDK). */
  baseURL?: string;
  chatModel: string;
}

export interface GoogleRuntime {
  providerId: "google";
  apiKey: string;
  chatModel: string;
}

export type PrimaryChatRuntime = OpenAiCompatibleRuntime | GoogleRuntime;

const KIMI_DEFAULT_BASE = "https://api.moonshot.ai/v1";
const KIMI_DEFAULT_MODEL = "kimi-k2.5";
const OPENAI_DEFAULT_MODEL = "gpt-4o";
const GOOGLE_DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * Runtime del proveedor activo para chat (y mismo adapter salvo embeddings delegados).
 */
export function resolvePrimaryChatRuntime(): PrimaryChatRuntime {
  const id = normalizeLlmProviderId();
  if (id === "google") {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? "";
    if (!apiKey) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY is required when AI_PROVIDER is google",
      );
    }
    const chatModel =
      process.env.GOOGLE_CHAT_MODEL?.trim() ||
      process.env.GEMINI_CHAT_MODEL?.trim() ||
      GOOGLE_DEFAULT_MODEL;
    return { providerId: "google", apiKey, chatModel };
  }

  const apiKey = resolveAiCompatibleApiKey();
  if (!apiKey) {
    throw new Error(
      "AI_API_KEY is required for openai/kimi (o OPENAI_API_KEY; OpenAI oficial o Moonshot/Kimi)",
    );
  }

  const explicitBase = process.env.OPENAI_BASE_URL?.trim();
  const explicitModel = process.env.OPENAI_CHAT_MODEL?.trim();

  if (id === "kimi") {
    return {
      providerId: "kimi",
      apiKey,
      baseURL: explicitBase || KIMI_DEFAULT_BASE,
      chatModel: explicitModel || KIMI_DEFAULT_MODEL,
    };
  }

  return {
    providerId: "openai",
    apiKey,
    baseURL: explicitBase || undefined,
    chatModel: explicitModel || OPENAI_DEFAULT_MODEL,
  };
}

export type ResolvedEmbeddingsBackend = "openai-official" | "gemini";

/**
 * Embeddings: por defecto siguen al proveedor de chat (Google→Gemini; OpenAI→OpenAI).
 * Con kimi: si hay clave Google, embeddings Gemini; si no, OpenAI oficial con AI_API_KEY (falla suave si la clave es solo Moonshot).
 * Override opcional: LLM_EMBEDDINGS_PROVIDER=openai|google
 */
export function resolveEmbeddingsBackend(): ResolvedEmbeddingsBackend {
  const override = process.env.LLM_EMBEDDINGS_PROVIDER?.toLowerCase().trim();
  if (override === "google" || override === "gemini") return "gemini";
  if (override === "openai") return "openai-official";

  const primary = normalizeLlmProviderId();
  if (primary === "google") return "gemini";
  if (primary === "kimi") {
    const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (googleKey) return "gemini";
    return "openai-official";
  }
  return "openai-official";
}

export function getGoogleApiKeyForOptionalEmbeddings(): string | undefined {
  const k = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
  return k?.trim() ? k : undefined;
}

export interface LlmProviderSnapshot {
  id: NormalizedLlmProviderId;
  /** Tiene clave para chat de ese proveedor */
  chatConfigured: boolean;
  /** Proveedor seleccionado como activo */
  active: boolean;
}

/** Vista rápida de qué proveedores tienen clave y cuál está activo (sin exponer secretos). */
export function getLlmProvidersSnapshot(): LlmProviderSnapshot[] {
  const active = normalizeLlmProviderId();
  const openaiKey = Boolean(resolveAiCompatibleApiKey());
  const googleKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim(),
  );

  return [
    {
      id: "openai",
      chatConfigured: openaiKey,
      active: active === "openai",
    },
    {
      id: "google",
      chatConfigured: googleKey,
      active: active === "google",
    },
    {
      id: "kimi",
      chatConfigured: openaiKey,
      active: active === "kimi",
    },
  ];
}
