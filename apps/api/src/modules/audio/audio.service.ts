import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { resolveOpenRouterApiKey } from "../ai/config/llm-config.js";

@Injectable()
export class AudioService {
  /** Transcribe audio blob via OpenRouter (Whisper‑compatible). */
  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const sttModel = process.env.STT_MODEL?.trim();
    if (!sttModel) {
      throw new Error("STT_MODEL is not configured");
    }
    const apiKey = resolveOpenRouterApiKey();
    if (!apiKey) {
      throw new Error("No API key available for STT");
    }
    const baseURL = process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";

    const client = new OpenAI({ apiKey, baseURL });

    const extension = mimeType.includes("ogg") ? "ogg" : "webm";
    const fileName = `audio.${extension}`;

    const transcription = await client.audio.transcriptions.create({
      model: sttModel,
      file: await OpenAI.toFile(audioBuffer, fileName),
      language: "es",
    });

    return transcription.text ?? "";
  }
}
