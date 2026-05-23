import { Module, forwardRef } from "@nestjs/common";
import { AiOrchestratorService } from "./ai-orchestrator.service.js";
import { AiOrchestratorController } from "./ai-orchestrator.controller.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { SessionsModule } from "../sessions/sessions.module.js";
import { TheForgeModule } from "../theforge/theforge.module.js";
import { AgentSupervisorModule } from "../agent-supervisor/agent-supervisor.module.js";
import { AiAnalysisModule } from "../ai-analysis/ai-analysis.module.js";
import { AiModule } from "../ai/ai.module.js";

@Module({
  imports: [forwardRef(() => SessionsModule), ProjectsModule, TheForgeModule, AgentSupervisorModule, AiAnalysisModule, AiModule],
  controllers: [AiOrchestratorController],
  providers: [AiOrchestratorService],
  exports: [AiOrchestratorService],
})
export class AiOrchestratorModule { }
