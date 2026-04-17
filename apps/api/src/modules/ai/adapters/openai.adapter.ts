import OpenAI from "openai";
import type {
  LLMProvider,
  ChatMessage,
  GenerateResponseOptions,
} from "../interfaces/llm-provider.interface.js";
import type { ChatImagePart, ChecklistResult } from "@theforge/shared-types";
import {
  getGoogleApiKeyForOptionalEmbeddings,
  normalizeLlmProviderId,
  resolveEmbeddingsBackend,
  resolvePrimaryChatRuntime,
  type OpenAiCompatibleRuntime,
} from "../config/llm-config.js";
import { generateGeminiTextEmbedding } from "../embeddings/gemini-text-embedding.js";

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

function getOpenAiCompatibleRuntimeStrict(): OpenAiCompatibleRuntime {
  const id = normalizeLlmProviderId();
  if (id === "google") {
    throw new Error("OpenAIAdapter requires AI_PROVIDER openai or kimi");
  }
  return resolvePrimaryChatRuntime() as OpenAiCompatibleRuntime;
}

export class OpenAIAdapter implements LLMProvider {
  private readonly chatClient: OpenAI;
  /** Solo API OpenAI oficial (embeddings); sin baseURL custom. */
  private readonly embeddingOpenAi: OpenAI;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    const runtime = getOpenAiCompatibleRuntimeStrict();
    const key = apiKey ?? runtime.apiKey;
    this.model = model ?? runtime.chatModel;
    this.chatClient = new OpenAI({
      apiKey: key,
      baseURL: runtime.baseURL,
    });
    this.embeddingOpenAi = new OpenAI({ apiKey: key });
  }

  async generateResponse(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<string> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (options?.systemPrompt) {
        messages.push({ role: "system", content: options.systemPrompt });
      }
      messages.push(
        ...historyToOpenAiMessages(history),
        buildOpenAiUserMessage(prompt, options?.userMessageImages),
      );

      const ts = () => new Date().toISOString();
      console.log(`[OpenAIAdapter] ${ts()} → Request enviado (OpenAI-compatible):`, {
        messagesCount: messages.length,
        model: this.model,
      });
      const completion = await this.chatClient.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 8192,
      });

      const content = completion.choices[0]?.message?.content ?? "";
      const choice = completion.choices[0];
      console.log(`[OpenAIAdapter] ${ts()} ← Response recibida:`, {
        contentLength: content.length,
        preview: content.slice(0, 200) + (content.length > 200 ? "…" : ""),
        finishReason: choice?.finish_reason,
        usage: completion.usage,
      });
      return content;
    } catch (err) {
      console.error("[OpenAIAdapter] generateResponse error:", err);
      throw err;
    }
  }

  async generateResponseStream(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<AsyncIterable<string>> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push(
      ...historyToOpenAiMessages(history),
      buildOpenAiUserMessage(prompt, options?.userMessageImages),
    );

    const stream = await this.chatClient.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: 8192,
      stream: true,
    });

    return {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            yield delta;
          }
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
      console.error("[OpenAIAdapter] parseChecklist error", err);
      return { complete: false, items: [] };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const backend = resolveEmbeddingsBackend();
    if (backend === "gemini") {
      const gKey = getGoogleApiKeyForOptionalEmbeddings();
      if (!gKey) {
        console.error("[OpenAIAdapter] generateEmbedding: LLM_EMBEDDINGS_PROVIDER=google pero falta clave Google");
        return [];
      }
      try {
        return await generateGeminiTextEmbedding(text, gKey);
      } catch (err) {
        console.error("[OpenAIAdapter] generateEmbedding (Gemini) error:", err);
        return [];
      }
    }

    try {
      const resp = await this.embeddingOpenAi.embeddings.create({
        model: "text-embedding-3-small",
        input: text.replace(/\n/g, " "),
      });
      return resp.data[0].embedding;
    } catch (err) {
      console.error("[OpenAIAdapter] generateEmbedding error:", err);
      return [];
    }
  }
}
