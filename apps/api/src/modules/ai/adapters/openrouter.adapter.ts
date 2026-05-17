import OpenAI from "openai";
import {
  type APIError,
  RateLimitError,
  InternalServerError,
  APIConnectionError,
} from "openai/error";
import type {
  LLMProvider,
  ChatMessage,
  GenerateResponseOptions,
} from "../interfaces/llm-provider.interface.js";
import type { ChatImagePart, ChecklistResult } from "@theforge/shared-types";
import {
  resolveEmbeddingsBackend,
  resolveOpenRouterEmbeddingApiKey,
  resolvePrimaryChatRuntime,
  resolveVisionModel,
  type OpenRouterRuntime,
} from "../config/llm-config.js";

/** Máximo de reintentos para fallos transitorios (429, 5xx, EHOSTUNREACH, etc.). */
const MAX_RETRIES = 3;
/** Backoff base en ms — 2s, 4s, 8s. */
const BASE_DELAY_MS = 2_000;

/**
 * Determina si un error es recuperable (transitorio).
 */
function isRetryableError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true; // HTTP 429
  if (err instanceof InternalServerError) return true; // HTTP 5xx
  if (err instanceof APIConnectionError) return true; // EHOSTUNREACH, ECONNRESET, ENOTFOUND, etc.
  // Fallback: errores genéricos de red en Node.js
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("ehostunreach") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("etimedout") ||
      msg.includes("socket hang up") ||
      msg.includes("network") ||
      msg.includes("429") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Extrae `Retry-After` (segundos) del header si existe.
 */
function retryAfterSeconds(err: unknown): number | undefined {
  if (err instanceof RateLimitError && typeof (err as any).headers?.get === "function") {
    const raw = (err as any).headers.get("retry-after") as string | null;
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) return Math.min(n, 30); // cap at 30s
    }
  }
  return undefined;
}

/**
 * Jitter: random entre 0.5x y 1.5x de baseDelay^attempt.
 */
function backoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter != null) return retryAfter * 1000;
  const base = BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
  const jitter = 0.5 + Math.random(); // 0.5–1.5
  return Math.round(base * jitter);
}

/**
 * Wrapper que reintenta `fn` hasta MAX_RETRIES veces si el error es transitorio.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt === MAX_RETRIES) {
        console.error(`[OpenRouterAdapter] ${label} — error no recuperable o agotados reintentos:`, err);
        throw err;
      }
      const after = retryAfterSeconds(err);
      const delayMs = backoffDelay(attempt, after);
      console.warn(
        `[OpenRouterAdapter] ${label} — intento ${attempt + 1}/${MAX_RETRIES} falló, reintentando en ${Math.round(delayMs / 1000)}s:`,
        err instanceof Error ? err.message : String(err),
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr; // never reached, but TS needs it
}

function buildOpenAiUserMessage(
  text: string,
  images?: ChatImagePart[],
): OpenAI.Chat.ChatCompletionUserMessageParam {
  const trimmed = text.trim();
  const hasImages = images != null && images.length > 0;
  if (!hasImages) {
    return { role: "user", content: trimmed.length > 0 ? trimmed : "(sin texto)" };
  }
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
  parts.push({
    type: "text",
    text:
      trimmed.length > 0
        ? trimmed
        : "(El usuario adjuntó solo imágenes; intégralas según el contexto de la conversación y el documento activo.)",
  });
  for (const img of images) {
    parts.push({
      type: "image_url",
      image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
    });
  }
  return { role: "user", content: parts };
}

function historyToOpenAiMessages(history: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  return history.map((m) => {
    if (m.role === "assistant") {
      return { role: "assistant", content: m.content };
    }
    if (m.images?.length) {
      return buildOpenAiUserMessage(m.content, m.images);
    }
    return { role: "user", content: m.content };
  });
}

function llmMaxTokens(): number {
  const raw = process.env.LLM_MAX_TOKENS?.trim();
  if (raw === undefined || raw === "") return 120_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1_000_000) : 120_000;
}

function openRouterDefaultHeaders(): Record<string, string> | undefined {
  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (!referer && !title) return undefined;
  return {
    ...(referer ? { "HTTP-Referer": referer } : {}),
    ...(title ? { "X-OpenRouter-Title": title } : {}),
  };
}

export class OpenRouterAdapter implements LLMProvider {
  private static warnedEmbeddingNone = false;

  private readonly chatClient: OpenAI;
  /** Cliente embeddings: misma base URL; clave puede ser OPENROUTER_EMBEDDING_API_KEY. */
  private readonly embeddingClient: OpenAI;
  private readonly model: string;
  private readonly visionModel: string;
  private readonly embeddingModel: string;

  constructor() {
    const runtime = resolvePrimaryChatRuntime() as OpenRouterRuntime;
    this.model = runtime.chatModel;
    this.visionModel = resolveVisionModel();
    this.embeddingModel = runtime.embeddingModel;
    const headers = openRouterDefaultHeaders();
    this.chatClient = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL,
      defaultHeaders: headers,
    });
    const embKey = resolveOpenRouterEmbeddingApiKey() ?? runtime.apiKey;
    this.embeddingClient = new OpenAI({
      apiKey: embKey,
      baseURL: runtime.baseURL,
      defaultHeaders: headers,
    });
  }

  async generateResponse(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<string> {
    const hasImages = options?.userMessageImages != null && options.userMessageImages.length > 0;
    const activeModel = hasImages ? this.visionModel : this.model;
    return withRetry(async () => {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push(
        ...historyToOpenAiMessages(history),
        buildOpenAiUserMessage(prompt, options?.userMessageImages),
      );

      const ts = () => new Date().toISOString();
      console.log(`[OpenRouterAdapter] ${ts()} → Request enviado:`, {
        messagesCount: messages.length,
        model: activeModel,
        hasImages,
      });
      const completion = await this.chatClient.chat.completions.create({
        model: activeModel,
        messages,
        max_tokens: options?.maxTokensOverride ?? llmMaxTokens(),
      });

      const content = completion.choices[0]?.message?.content ?? "";
      const choice = completion.choices[0];
      console.log(`[OpenRouterAdapter] ${ts()} ← Response recibida:`, {
        contentLength: content.length,
        preview: content.slice(0, 200) + (content.length > 200 ? "…" : ""),
        finishReason: choice?.finish_reason,
        usage: completion.usage,
      });
      return content;
    }, "generateResponse");
  }

  async generateResponseStream(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<AsyncIterable<string>> {
    const hasImages = options?.userMessageImages != null && options.userMessageImages.length > 0;
    const activeModel = hasImages ? this.visionModel : this.model;

    // El retry se hace al crear el stream (antes de que llegue el primer chunk).
    // Si el stream se corta a medio camino no se reintenta — la capa superior
    // (LangGraph / session) debe manejar eso con checkpointing.
    const stream = await withRetry(async () => {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push(
        ...historyToOpenAiMessages(history),
        buildOpenAiUserMessage(prompt, options?.userMessageImages),
      );

      return this.chatClient.chat.completions.create({
        model: activeModel,
        messages,
        max_tokens: llmMaxTokens(),
        stream: true,
      });
    }, "generateResponseStream");

    return {
      async *[Symbol.asyncIterator]() {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              yield delta;
            }
          }
        } catch (err) {
          // Si el stream se corta a medio camino, loggeamos y propagamos.
          // La capa superior (LangGraph / sesiones) debe decidir si reintenta o no.
          console.error("[OpenRouterAdapter] generateResponseStream error durante streaming:", err);
          throw err;
        }
      },
    };
  }

  async parseChecklist(text: string): Promise<ChecklistResult> {
    try {
      const response = await this.chatClient.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "Parse the following text and return a JSON object with keys: complete (boolean), items (array of {key, present, value?}).",
          },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as ChecklistResult;
      return {
        complete: Boolean(parsed.complete),
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch (err) {
      console.error("[OpenRouterAdapter] parseChecklist error", err);
      return { complete: false, items: [] };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (resolveEmbeddingsBackend() === "none") {
      if (!OpenRouterAdapter.warnedEmbeddingNone) {
        OpenRouterAdapter.warnedEmbeddingNone = true;
        console.warn(
          "[OpenRouterAdapter] Embeddings desactivados (LLM_EMBEDDINGS_PROVIDER=none). " +
            "Semantic search / ADRs limitados. OPENAI_EMBEDDING_DIM fija la dimensión sin llamar API.",
        );
      }
      return [];
    }

    try {
      const resp = await this.embeddingClient.embeddings.create({
        model: this.embeddingModel,
        input: text.replace(/\n/g, " "),
      });
      return resp.data[0].embedding;
    } catch (err) {
      console.error("[OpenRouterAdapter] generateEmbedding error:", err);
      return [];
    }
  }
}
