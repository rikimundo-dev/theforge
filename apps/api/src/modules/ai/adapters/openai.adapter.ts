import OpenAI from "openai";
import type {
  LLMProvider,
  ChatMessage,
  GenerateResponseOptions,
} from "../interfaces/llm-provider.interface.js";
import type { ChecklistResult } from "@the-forge/shared-types";

export class OpenAIAdapter implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey?: string, model = "gpt-4o") {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY is required for OpenAI adapter");
    }
    this.client = new OpenAI({ apiKey: key });
    this.model = model;
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
        ...history.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
        { role: "user", content: prompt },
      );

      const ts = () => new Date().toISOString();
      console.log(`[OpenAIAdapter] ${ts()} → Request enviado a OpenAI:`, { messagesCount: messages.length, model: this.model });
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 8192,
      });

      const content = completion.choices[0]?.message?.content ?? "";
      const choice = completion.choices[0];
      console.log(`[OpenAIAdapter] ${ts()} ← Response recibida de OpenAI:`, {
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
      ...history.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      { role: "user", content: prompt },
    );

    const stream = await this.client.chat.completions.create({
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
      const response = await this.client.chat.completions.create({
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
    try {
      const resp = await this.client.embeddings.create({
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
