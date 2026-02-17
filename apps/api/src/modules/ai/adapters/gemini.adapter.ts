import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  LLMProvider,
  ChatMessage,
  GenerateResponseOptions,
} from "../interfaces/llm-provider.interface.js";
import type { ChecklistResult } from "@the-forge/shared-types";

export class GeminiAdapter implements LLMProvider {
  private readonly genAI: GoogleGenerativeAI;
  private readonly model;

  constructor(apiKey?: string, modelId = "gemini-2.0-flash") {
    const key = apiKey ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY is required for Gemini adapter",
      );
    }
    this.genAI = new GoogleGenerativeAI(key);
    this.model = this.genAI.getGenerativeModel({ model: modelId });
  }

  async generateResponse(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<string> {
    try {
      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
      if (options?.systemPrompt) {
        contents.push({
          role: "user",
          parts: [{ text: `[Instrucciones del sistema]\n${options.systemPrompt}` }],
        });
        contents.push({
          role: "model",
          parts: [{ text: "Entendido. Procedo con la entrevista según las instrucciones." }],
        });
      }
      for (const m of history) {
        if (m.role === "user") {
          contents.push({ role: "user", parts: [{ text: m.content }] });
        } else {
          contents.push({ role: "model", parts: [{ text: m.content }] });
        }
      }
      contents.push({ role: "user", parts: [{ text: prompt }] });

      const ts = () => new Date().toISOString();
      console.log(`[GeminiAdapter] ${ts()} → Request enviado a Gemini:`, { contentsCount: contents.length, promptLength: prompt.length });
      const result = await this.model.generateContent({
        contents,
        generationConfig: { maxOutputTokens: 8192 },
      });
      let text: string;
      try {
        text = result.response.text() ?? "";
      } catch (textErr) {
        // Respuesta vacía o bloqueada (safety/filters): response.text() lanza
        console.error("[GeminiAdapter] response.text() failed (empty/blocked)", textErr);
        throw new Error(
          "La IA no devolvió texto (respuesta vacía o bloqueada). Intenta de nuevo o reformula el mensaje.",
        );
      }
      console.log(`[GeminiAdapter] ${ts()} ← Response recibida de Gemini:`, {
        contentLength: text.length,
        preview: text.slice(0, 200) + (text.length > 200 ? "…" : ""),
      });
      return text;
    } catch (err) {
      console.error("[GeminiAdapter] generateResponse error", err);
      throw err;
    }
  }

  async generateResponseStream(
    prompt: string,
    history: ChatMessage[],
    options?: GenerateResponseOptions,
  ): Promise<AsyncIterable<string>> {
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
    if (options?.systemPrompt) {
      contents.push({
        role: "user",
        parts: [{ text: `[Instrucciones del sistema]\n${options.systemPrompt}` }],
      });
      contents.push({
        role: "model",
        parts: [{ text: "Entendido. Procedo con la entrevista según las instrucciones." }],
      });
    }
    for (const m of history) {
      if (m.role === "user") {
        contents.push({ role: "user", parts: [{ text: m.content }] });
      } else {
        contents.push({ role: "model", parts: [{ text: m.content }] });
      }
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const result = await this.model.generateContentStream({
      contents,
      generationConfig: { maxOutputTokens: 8192 },
    });

    return {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of result.stream) {
          try {
            const text = chunk.text?.() ?? "";
            if (text.length > 0) yield text;
          } catch {
            // chunk might be partial and .text() can throw
          }
        }
      },
    };
  }

  async parseChecklist(text: string): Promise<ChecklistResult> {
    try {
      const result = await this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Parse the following text and return only valid JSON with keys: complete (boolean), items (array of {key, present, value?}).\n\n${text}`,
              },
            ],
          },
        ],
      });
      const raw = result.response.text() ?? "{}";
      const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim()) as ChecklistResult;
      return {
        complete: Boolean(parsed.complete),
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch (err) {
      console.error("[GeminiAdapter] parseChecklist error", err);
      return { complete: false, items: [] };
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const embeddingModel = this.genAI.getGenerativeModel({ model: "embedding-001" });
      const result = await embeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (err) {
      console.error("[GeminiAdapter] generateEmbedding error:", err);
      return [];
    }
  }
}
