import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { LLM_PROVIDER } from "./interfaces/llm-provider.interface.js";
import { createLLMProvider } from "./ai.factory.js";
import { AiService } from "./ai.service.js";
import { DiscoveryService } from "./discovery.service.js";
import { PreferencesService } from "./preferences.service.js";
import { AiController } from "./ai.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [
    {
      provide: LLM_PROVIDER,
      useFactory: createLLMProvider,
    },
    AiService,
    DiscoveryService,
    PreferencesService,
  ],
  exports: [LLM_PROVIDER, AiService, DiscoveryService, PreferencesService],
})
export class AiModule { }
