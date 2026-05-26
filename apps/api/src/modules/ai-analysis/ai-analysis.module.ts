import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { AiModule } from "../ai/ai.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { TheForgeModule } from "../theforge/theforge.module.js";
import { AgentSupervisorModule } from "../agent-supervisor/agent-supervisor.module.js";
import { AiAnalysisController } from "./ai-analysis.controller.js";
import { AiAnalysisService } from "./ai-analysis.service.js";
import { CheckpointerService } from "./checkpoint/checkpointer.service.js";
import { NodeCacheService } from "./checkpoint/node-cache.service.js";
import { EstimationService } from "./estimation/estimation.service.js";
import { SddIngestorService } from "./sdd-ingestor.service.js";
import { Phase0InterviewService } from "./phase0/phase0-interview.service.js";
import { GraphMemoryModule } from "./graph-memory/graph-memory.module.js";

@Module({
  imports: [PrismaModule, AiModule, ProjectsModule, TheForgeModule, AgentSupervisorModule, GraphMemoryModule],
  controllers: [AiAnalysisController],
  providers: [NodeCacheService, CheckpointerService, EstimationService, AiAnalysisService, SddIngestorService, Phase0InterviewService],
  exports: [AiAnalysisService, EstimationService, GraphMemoryModule, SddIngestorService, Phase0InterviewService],
})
export class AiAnalysisModule { }
