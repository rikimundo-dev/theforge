import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AudioService } from "./audio.service.js";
import { getRequestUserId } from "../../common/request-user.store.js";

/** Minimal file shape from multer. */
interface UploadedAudioFile {
  buffer: Buffer;
  mimetype: string;
}

@Controller("audio")
export class AudioController {
  constructor(private readonly audio: AudioService) {}

  /**
   * STT y visión de la instancia activa (tenant o BYOK). Sin auth devuelve todo null.
   */
  @Get("config")
  async getConfig(): Promise<{
    sttModel: string | null;
    visionModel: string | null;
    supportsVision: boolean;
    supportsStt: boolean;
  }> {
    try {
      const userId = getRequestUserId();
      return await this.audio.getMediaConfigForUser(userId);
    } catch {
      return {
        sttModel: null,
        visionModel: null,
        supportsVision: false,
        supportsStt: false,
      };
    }
  }

  /** Transcribe an audio file using the user's configured STT model. */
  @Post("transcribe")
  @UseInterceptors(FileInterceptor("audio"))
  async transcribe(
    @UploadedFile() file: UploadedAudioFile,
  ): Promise<{ text: string }> {
    if (!file) {
      throw new BadRequestException("No se proporcionó archivo de audio");
    }
    const text = await this.audio.transcribe(file.buffer, file.mimetype);
    return { text };
  }
}
