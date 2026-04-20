import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module.js";
import { AgentSupervisorModule } from "../agent-supervisor/agent-supervisor.module.js";
import { AiModule } from "../ai/ai.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { TheForgeModule } from "../theforge/theforge.module.js";
import { LegacyFlowController } from "./legacy-flow.controller.js";
import { LegacyCoordinatorService } from "./legacy-coordinator.service.js";
import { LegacyReviewerService } from "./legacy-reviewer.service.js";

@Module({
  imports: [PrismaModule, AiModule, ProjectsModule, TheForgeModule, AiAnalysisModule, AgentSupervisorModule],
  controllers: [LegacyFlowController],
  providers: [LegacyCoordinatorService, LegacyReviewerService],
  exports: [LegacyCoordinatorService, LegacyReviewerService],
})
export class LegacyFlowModule {}
