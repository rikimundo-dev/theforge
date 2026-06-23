import { Module, forwardRef } from "@nestjs/common";
import { DeliverablesQueueService } from "./deliverables-queue.service.js";
import { PROJECTS_ORCHESTRATOR_PORT } from "./projects-service.port.js";
import { ProjectsService } from "./projects.service.js";
import { ProjectMergeService } from "./project-merge.service.js";
import { ProjectsController } from "./projects.controller.js";
import { ProjectIntegrationController } from "./integration/project-integration.controller.js";
import { ProjectIntegrationService } from "./integration/project-integration.service.js";
import { ProjectEstimationRecalcService } from "./project-estimation-recalc.service.js";
import { EngineModule } from "../engine/engine.module.js";
import { AiModule } from "../ai/ai.module.js";
import { Phase0Module } from "../ai-analysis/phase0/phase0.module.js";
import { ScraperModule } from "../scraper/scraper.module.js";
import { TheForgeModule } from "../theforge/theforge.module.js";
import { GraphMemoryModule } from "../ai-analysis/graph-memory/graph-memory.module.js";
import { ChangeLogModule } from "../change-log/change-log.module.js";
import { LegacyFlowModule } from "../legacy-flow/legacy-flow.module.js";
import { SddIntegrationService } from "./sdd-integration.service.js";

@Module({
  imports: [
    EngineModule,
    AiModule,
    Phase0Module,
    ScraperModule,
    TheForgeModule,
    GraphMemoryModule,
    ChangeLogModule,
    forwardRef(() => LegacyFlowModule),
  ],
  controllers: [ProjectsController, ProjectIntegrationController],
  providers: [
    ProjectsService,
    ProjectIntegrationService,
    ProjectMergeService,
    SddIntegrationService,
    { provide: PROJECTS_ORCHESTRATOR_PORT, useExisting: ProjectsService },
    ProjectEstimationRecalcService,
    DeliverablesQueueService,
  ],
  exports: [ProjectsService, ProjectIntegrationService, ProjectMergeService, PROJECTS_ORCHESTRATOR_PORT, DeliverablesQueueService],
})
export class ProjectsModule { }
