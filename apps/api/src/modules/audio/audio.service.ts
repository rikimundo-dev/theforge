import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import type { UserLLMRuntime } from "../ai/providers/llm-runtime.types.js";
import { AIFactory } from "../ai/ai.factory.js";
import { getRequestUserId } from "../../common/request-user.store.js";

/**
 * Whisper hallucina cuando el audio es corto, silencioso o con poco habla.
 * Genera URLs, frases publicitarias o texto genérico repetitivo.
 */
const HALLUCINATION_RE =
  /\bwww\.\w+\.\w+|https?:\/\/\S+|\bsuscr[íi]b[ea]te\b|\bmás información\b|\bsubtítulos\b.*\bcomunidad\b/i;

/**
 * STT vía API compatible OpenAI del proveedor activo del usuario (sttModel en BYOK).
 *
 * OpenRouter expone /audio/transcriptions con JSON + base64, no multipart;
 * OpenAI y Groq usan el SDK estándar con multipart file upload.
 */
@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(private readonly aiFactory: AIFactory) {}

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    const runtime = await this.aiFactory.resolveSttRuntime(getRequestUserId());
    const format = mimeType.includes("ogg") ? "ogg" : "webm";

    this.logger.debug(
      `STT ${runtime.providerId} model=${runtime.sttModel} format=${format} bytes=${audioBuffer.length}`,
    );

    let text: string;
    if (runtime.providerId === "openrouter") {
      text = await this.transcribeViaOpenRouter(audioBuffer, format, runtime);
    } else {
      text = await this.transcribeViaOpenAiSdk(audioBuffer, format, runtime);
    }

    if (HALLUCINATION_RE.test(text)) {
      this.logger.warn(`STT hallucination filtered: "${text}"`);
      return "";
    }

    return text;
  }

  /** OpenRouter: JSON body con audio base64 (no acepta multipart). */
  private async transcribeViaOpenRouter(
    audioBuffer: Buffer,
    format: string,
    runtime: UserLLMRuntime & { sttModel: string },
  ): Promise<string> {
    const base64Audio = audioBuffer.toString("base64");
    const url = `${runtime.baseURL.replace(/\/+$/, "")}/audio/transcriptions`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
    };
    const referer =
      typeof runtime.extras?.httpReferer === "string" && runtime.extras.httpReferer.trim();
    const title =
      typeof runtime.extras?.appTitle === "string" && runtime.extras.appTitle.trim();
    if (referer) headers["HTTP-Referer"] = referer;
    if (title) headers["X-OpenRouter-Title"] = title;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: runtime.sttModel,
        input_audio: { data: base64Audio, format },
        language: "es",
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      this.logger.error(
        `OpenRouter STT ${res.status} model=${runtime.sttModel} format=${format} audioBytes=${audioBuffer.length}: ${body}`,
      );
      throw new BadRequestException(
        `Error de transcripción (OpenRouter ${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as { text?: string };
    return data.text ?? "";
  }

  /** OpenAI / Groq: SDK estándar con multipart file upload. */
  private async transcribeViaOpenAiSdk(
    audioBuffer: Buffer,
    extension: string,
    runtime: UserLLMRuntime & { sttModel: string },
  ): Promise<string> {
    const client = new OpenAI({ apiKey: runtime.apiKey, baseURL: runtime.baseURL });
    const fileName = `audio.${extension}`;

    const transcription = await client.audio.transcriptions.create({
      model: runtime.sttModel,
      file: await OpenAI.toFile(audioBuffer, fileName),
      language: "es",
      temperature: 0,
    });

    return transcription.text ?? "";
  }

  /** STT y visión desde la instancia activa del usuario (no env). */
  async getMediaConfigForUser(userId: string): Promise<{
    sttModel: string | null;
    visionModel: string | null;
    supportsVision: boolean;
    supportsStt: boolean;
  }> {
    return this.aiFactory.getRuntimeMediaConfig(userId);
  }
}
