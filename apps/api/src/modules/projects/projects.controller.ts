import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { getRequestUserId, getRequestUserRole } from "../../common/request-user.store.js";
import { DeliverablesQueueService } from "./deliverables-queue.service.js";
import { ProjectsService } from "./projects.service.js";
import {
  createProjectSchema,
  updateProjectSchema,
  phase0DeepResearchBodySchema,
} from "@theforge/shared-types";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly deliverablesQueue: DeliverablesQueueService,
  ) {}

  @Post()
  create(@Body() body: unknown) {
    return this.projects.create(createProjectSchema.parse(body));
  }

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(":projectId/stages")
  listStages(@Param("projectId") projectId: string) {
    return this.projects.listStages(projectId);
  }

  @Post(":projectId/stages")
  createStage(@Param("projectId") projectId: string, @Body() body: unknown) {
    return this.projects.createStage(projectId, body ?? {});
  }

  @Patch(":projectId/stages/:stageId")
  patchStage(
    @Param("projectId") projectId: string,
    @Param("stageId") stageId: string,
    @Body() body: unknown,
  ) {
    return this.projects.patchStage(projectId, stageId, body ?? {});
  }

  /** Estado de un job de cascada (polling); mismo path base que el stream SSE. */
  @Get(":id/deliverables-jobs/:jobId")
  async deliverablesJobStatus(
    @Param("id") projectId: string,
    @Param("jobId") jobId: string,
  ) {
    const job = await this.deliverablesQueue.getJob(jobId);
    if (!job) throw new NotFoundException("Job no encontrado");
    const data = job.data as { projectId: string; userId: string };
    if (data.projectId !== projectId) throw new ForbiddenException();
    if (data.userId !== getRequestUserId()) throw new ForbiddenException();
    const state = await job.getState();
    const progress = job.progress;
    if (state === "completed") {
      const returnvalue = await job.returnvalue;
      return { state, progress, result: returnvalue ?? null };
    }
    if (state === "failed") {
      return { state, progress, failedReason: await job.failedReason };
    }
    return { state, progress };
  }

  /** SSE: progreso de cascada de entregables en cola BullMQ (`REDIS_URL`). */
  @Get(":id/deliverables-jobs/:jobId/stream")
  async deliverablesJobStream(
    @Param("id") projectId: string,
    @Param("jobId") jobId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const job = await this.deliverablesQueue.getJob(jobId);
    if (!job) throw new NotFoundException("Job no encontrado");
    const data = job.data as { projectId: string; userId: string };
    if (data.projectId !== projectId) throw new ForbiddenException();
    if (data.userId !== getRequestUserId()) throw new ForbiddenException();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const tick = async () => {
      const j = await this.deliverablesQueue.getJob(jobId);
      if (!j) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: "job missing" })}\n\n`);
        res.end();
        return;
      }
      const state = await j.getState();
      const progress = j.progress;
      res.write(`event: progress\ndata: ${JSON.stringify({ state, progress })}\n\n`);
      if (state === "completed") {
        try {
          const rv = await j.returnvalue;
          res.write(`event: completed\ndata: ${JSON.stringify(rv ?? null)}\n\n`);
        } catch {
          res.write(`event: completed\ndata: {}\n\n`);
        }
        res.end();
        return;
      }
      if (state === "failed") {
        const reason = await j.failedReason;
        res.write(`event: failed\ndata: ${JSON.stringify({ message: reason })}\n\n`);
        res.end();
        return;
      }
      setTimeout(() => void tick(), 900);
    };
    void tick();
  }

  /** Indica si Hermes Agent está configurado (env vars presentes). */
  @Get("hermes-status")
  hermesStatus() {
    const configured = !!(process.env.HERMES_WEBHOOK_URL?.trim() && process.env.HERMES_API_KEY?.trim());
    return { configured };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projects.findOne(id);
  }

  @Get(":id/conformance")
  getConformance(@Param("id") id: string, @Query("useLlm") useLlm?: string) {
    return this.projects.getConformance(id, { useLlm: useLlm === "true" });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.projects.update(id, updateProjectSchema.partial().parse(body));
  }

  @Post(":id/generate-benchmark")
  generateBenchmark(
    @Param("id") id: string,
    @Body() body: { userIdea?: string; urls?: string[] },
  ) {
    const userIdea = typeof body?.userIdea === "string" ? body.userIdea : "";
    const urls = Array.isArray(body?.urls) ? body.urls.filter((u): u is string => typeof u === "string") : undefined;
    return this.projects.generateBenchmark(id, userIdea, urls);
  }

  /** Greenfield: borrador BRD desde `dbgaContent` (To-Be eliminado del sistema). */
  @Post(":id/suggest-brd-from-dbga")
  suggestBrdFromDbga(
    @Param("id") id: string,
    @Body() body: { stageId?: string },
  ) {
    const stageId = typeof body?.stageId === "string" ? body.stageId : undefined;
    return this.projects.suggestBrdFromDbga(id, { stageId });
  }

  @Post(":id/phase0-deep-research")
  phase0DeepResearch(@Param("id") id: string, @Body() body: unknown) {
    const parsed = phase0DeepResearchBodySchema.parse(body ?? {});
    return this.projects.phase0DeepResearch(id, {
      userIdea: parsed.userIdea,
      urls: parsed.urls,
      includeBenchmark: parsed.includeBenchmark,
    });
  }

  /**
   * Cascada de entregables según `Project.complexity`.
   * Con `REDIS_URL`: encola BullMQ y responde `{ queued: true, jobId }` (seguimiento vía GET …/deliverables-jobs/:jobId/stream).
   */
  @Post(":id/generate-deliverables")
  async generateDeliverablesCascade(@Param("id") id: string) {
    if (this.deliverablesQueue.isEnabled()) {
      const jobId = await this.deliverablesQueue.enqueueCascade(id);
      return { queued: true, jobId, streamPath: `/projects/${id}/deliverables-jobs/${jobId}/stream` };
    }
    return this.projects.generateDeliverablesCascade(id);
  }

  /** Aplica `complexityPending` a `complexity` y limpia HITL (alternativa a confirmar por mensaje en el chat). */
  @Post(":id/confirm-complexity")
  confirmComplexity(@Param("id") id: string) {
    return this.projects.confirmComplexityProposal(id);
  }

  /** Re-infiere propuesta HITL desde DBGA/MDD existentes (re-valorar sin stream DBGA). Body opcional: `{ note?: string }`. */
  @Post(":id/reassess-complexity")
  reassessComplexity(@Param("id") id: string, @Body() body: { note?: string }) {
    return this.projects.reassessComplexity(id, { note: body?.note });
  }

  @Post(":id/generate-spec")
  generateSpec(@Param("id") id: string) {
    return this.projects.generateSpec(id);
  }

  @Post(":id/generate-tasks")
  generateTasks(@Param("id") id: string) {
    return this.projects.generateTasks(id);
  }

  @Post(":id/generate-architecture")
  generateArchitecture(@Param("id") id: string, @Body() body: { preview?: boolean }) {
    if (body?.preview) return this.projects.generateArchitecturePreview(id);
    return this.projects.generateArchitecture(id);
  }

  @Post(":id/generate-use-cases")
  generateUseCases(@Param("id") id: string, @Body() body: { preview?: boolean }) {
    if (body?.preview) return this.projects.generateUseCasesPreview(id);
    return this.projects.generateUseCases(id);
  }

  @Post(":id/generate-user-stories")
  generateUserStories(@Param("id") id: string, @Body() body: { preview?: boolean }) {
    if (body?.preview) return this.projects.generateUserStoriesPreview(id);
    return this.projects.generateUserStories(id);
  }

  @Post(":id/generate-blueprint")
  generateBlueprint(@Param("id") id: string, @Body() body: { preview?: boolean; gapsFeedback?: string }) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    if (body?.preview) return this.projects.generateBlueprintPreview(id, gaps);
    return this.projects.generateBlueprint(id, gaps);
  }

  @Post(":id/generate-api-contracts")
  generateApiContracts(@Param("id") id: string, @Body() body: { preview?: boolean; gapsFeedback?: string }) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    if (body?.preview) return this.projects.generateApiContractsPreview(id, gaps);
    return this.projects.generateApiContracts(id, gaps);
  }

  @Post(":id/generate-logic-flows")
  generateLogicFlows(@Param("id") id: string, @Body() body: { gapsFeedback?: string }) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    return this.projects.generateLogicFlows(id, gaps);
  }

  @Post(":id/generate-infra")
  generateInfra(@Param("id") id: string, @Body() body: { preview?: boolean; gapsFeedback?: string }) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    if (body?.preview) return this.projects.generateInfraPreview(id, gaps);
    return this.projects.generateInfra(id, gaps);
  }

  @Post(":id/verify-deliverable")
  verifyDeliverable(
    @Param("id") id: string,
    @Body() body: { deliverable?: "blueprint" | "api" | "infra" },
  ) {
    const deliverable = body?.deliverable ?? "blueprint";
    return this.projects.verifyDeliverable(id, deliverable);
  }

  /** Notifica a Hermes Agent que este proyecto está listo para desarrollo. */
  @Post(":id/launch-hermes")
  launchHermes(@Param("id") id: string) {
    return this.projects.launchHermes(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    const role = getRequestUserRole();
    if (role !== "admin") {
      throw new ForbiddenException("Solo administradores pueden borrar proyectos");
    }
    return this.projects.remove(id);
  }
}
