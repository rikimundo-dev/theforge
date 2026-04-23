import { Module } from "@nestjs/common";
import { DeliverablesQueueService } from "./deliverables-queue.service.js";
import { PROJECTS_ORCHESTRATOR_PORT } from "./projects-service.port.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectEstimationRecalcService } from "./project-estimation-recalc.service.js";
import { EngineModule } from "../engine/engine.module.js";
import { AiModule } from "../ai/ai.module.js";
import { ScraperModule } from "../scraper/scraper.module.js";
import { TheForgeModule } from "../theforge/theforge.module.js";
import { GraphMemoryModule } from "../ai-analysis/graph-memory/graph-memory.module.js";

@Module({
  imports: [EngineModule, AiModule, ScraperModule, TheForgeModule, GraphMemoryModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    { provide: PROJECTS_ORCHESTRATOR_PORT, useExisting: ProjectsService },
    ProjectEstimationRecalcService,
    DeliverablesQueueService,
  ],
  exports: [ProjectsService, PROJECTS_ORCHESTRATOR_PORT, DeliverablesQueueService],
})
export class ProjectsModule { }
