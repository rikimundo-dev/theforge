import { Module } from "@nestjs/common";
import { AudioController } from "./audio.controller.js";
import { AudioService } from "./audio.service.js";

@Module({
  controllers: [AudioController],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
