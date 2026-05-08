import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Public } from "../../common/decorators/public.decorator.js";
import { AudioService } from "./audio.service.js";

/** Minimal file shape from multer. */
interface UploadedAudioFile {
  buffer: Buffer;
  mimetype: string;
}

@Controller("audio")
export class AudioController {
  constructor(private readonly audio: AudioService) {}

  /** Public config: frontend checks STT_MODEL availability. */
  @Public()
  @Get("config")
  getConfig(): { sttModel: string | null } {
    const sttModel = process.env.STT_MODEL?.trim() || null;
    return { sttModel };
  }

  /** Transcribe an audio file using the configured STT_MODEL. */
  @Public()
  @Post("transcribe")
  @UseInterceptors(FileInterceptor("audio"))
  async transcribe(
    @UploadedFile() file: UploadedAudioFile,
  ): Promise<{ text: string }> {
    if (!file) {
      throw new BadRequestException("No audio file provided");
    }
    if (!process.env.STT_MODEL?.trim()) {
      throw new BadRequestException("STT_MODEL is not configured");
    }
    const text = await this.audio.transcribe(file.buffer, file.mimetype);
    return { text };
  }
}
