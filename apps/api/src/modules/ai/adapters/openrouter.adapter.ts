import OpenAI from "openai";
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
  resolveChatModelChain,
  resolveVisionModelChain,
  type OpenRouterRuntime,
} from "../config/llm-config.js";
import { runWithModelFallback } from "../config/llm-model-fallback.js";

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
  private readonly chatModels: string[];
  private readonly visionModels: string[];
  private readonly embeddingModel: string;

  constructor() {
    const runtime = resolvePrimaryChatRuntime() as OpenRouterRuntime;
    this.chatModels = resolveChatModelChain();
    this.visionModels = resolveVisionModelChain();
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
    const models = hasImages ? this.visionModels : this.chatModels;

    return runWithModelFallback({
      models,
      label: "OpenRouterAdapter.generateResponse",
      run: async (activeModel) => {
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
      },
    });
  }

  async generateResponseStream(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<AsyncIterable<string>> {
    const hasImages = options?.userMessageImages != null && options.userMessageImages.length > 0;
    const models = hasImages ? this.visionModels : this.chatModels;

    // El retry y el fallback de modelo ocurren al crear el stream (antes del primer chunk).
    const stream = await runWithModelFallback({
      models,
      label: "OpenRouterAdapter.generateResponseStream",
      run: async (activeModel) => {
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
      },
    });

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
          console.error("[OpenRouterAdapter] generateResponseStream error durante streaming:", err);
          throw err;
        }
      },
    };
  }

  async parseChecklist(text: string): Promise<ChecklistResult> {
    try {
      const response = await runWithModelFallback({
        models: this.chatModels,
        label: "OpenRouterAdapter.parseChecklist",
        run: (model) =>
          this.chatClient.chat.completions.create({
            model,
            messages: [
              {
                role: "system",
                content:
                  "Parse the following text and return a JSON object with keys: complete (boolean), items (array of {key, present, value?}).",
              },
              { role: "user", content: text },
            ],
            response_format: { type: "json_object" },
          }),
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
