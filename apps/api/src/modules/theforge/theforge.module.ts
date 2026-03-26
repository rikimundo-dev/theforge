import { Module } from "@nestjs/common";
import { TheForgeContextCacheService } from "./theforge-context-cache.service.js";
import { TheForgeService } from "./theforge.service.js";
import { TheForgeController } from "./theforge.controller.js";

@Module({
  controllers: [TheForgeController],
  providers: [TheForgeContextCacheService, TheForgeService],
  exports: [TheForgeContextCacheService, TheForgeService],
})
export class TheForgeModule {}
