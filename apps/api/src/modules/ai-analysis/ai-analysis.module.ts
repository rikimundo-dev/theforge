import { Module, forwardRef } from "@nestjs/common";
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
import { MddManualAuditService } from "./mdd/mdd-manual-audit.service.js";
import { GraphMemoryModule } from "./graph-memory/graph-memory.module.js";
import { Phase0Module } from "./phase0/phase0.module.js";

@Module({
  imports: [
    PrismaModule,
    AiModule,
    forwardRef(() => ProjectsModule),
    TheForgeModule,
    AgentSupervisorModule,
    GraphMemoryModule,
    Phase0Module,
  ],
  controllers: [AiAnalysisController],
  providers: [NodeCacheService, CheckpointerService, EstimationService, AiAnalysisService, SddIngestorService, MddManualAuditService],
  exports: [AiAnalysisService, EstimationService, GraphMemoryModule, SddIngestorService, Phase0Module, MddManualAuditService],
})
export class AiAnalysisModule { }
