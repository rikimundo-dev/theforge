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
import { requireAdmin } from "../../common/guards/role.helpers.js";
import { DeliverablesQueueService, type GenerateJobType } from "./deliverables-queue.service.js";
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

  /** Estado de un job de cola (polling). */
  @Get(":id/deliverables-jobs/:jobId")
  async deliverablesJobStatus(
    @Param("id") projectId: string,
    @Param("jobId") jobId: string,
  ) {
    const status = await this.deliverablesQueue.getJobStatus(jobId);
    if (status.status === "unknown") throw new NotFoundException("Job no encontrado");
    const data = status as any;
    if (data.projectId !== projectId) throw new ForbiddenException();
    return status;
  }

  /** SSE: progreso de cascada de entregables en cola BullMQ (`REDIS_URL`). */
  @Get(":id/deliverables-jobs/:jobId/stream")
  async deliverablesJobStream(
    @Param("jobId") jobId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const status = await this.deliverablesQueue.getJobStatus(jobId);
    if (status.status === "unknown") throw new NotFoundException("Job no encontrado");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const tick = async () => {
      const s = await this.deliverablesQueue.getJobStatus(jobId);
      res.write(`event: progress\ndata: ${JSON.stringify({ state: s.status, progress: s.progress })}\n\n`);
      if (s.status === "completed") {
        res.write(`event: completed\ndata: ${JSON.stringify(s.result ?? null)}\n\n`);
        res.end();
        return;
      }
      if (s.status === "failed") {
        res.write(`event: failed\ndata: ${JSON.stringify({ message: s.error })}\n\n`);
        res.end();
        return;
      }
      if (s.status === "retrying") {
        res.write(`event: retrying\ndata: ${JSON.stringify({ message: s.error })}\n\n`);
        // Seguir sondeando en vez de terminar — el worker reintentará
      }
      setTimeout(() => void tick(), 900);
    };
    void tick();
  }

  /** Estado genérico de cualquier job (para polling desde frontend). */
  @Get("jobs/:jobId")
  async jobStatus(@Param("jobId") jobId: string) {
    const status = await this.deliverablesQueue.getJobStatus(jobId);
    if (status.status === "unknown") throw new NotFoundException("Job no encontrado");
    return status;
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
   * Con `REDIS_URL`: encola BullMQ y responde `{ queued: true, jobId }`.
   */
  @Post(":id/generate-deliverables")
  async generateDeliverablesCascade(@Param("id") id: string) {
    if (this.deliverablesQueue.isEnabled()) {
      const jobId = await this.deliverablesQueue.enqueue({ type: "cascade", projectId: id });
      return { queued: true, jobId, statusPath: `/projects/jobs/${jobId}` };
    }
    return this.projects.generateDeliverablesCascade(id);
  }

  /** Aplica `complexityPending` a `complexity` y limpia HITL. */
  @Post(":id/confirm-complexity")
  confirmComplexity(@Param("id") id: string) {
    return this.projects.confirmComplexityProposal(id);
  }

  /** Re-infiere propuesta HITL desde DBGA/MDD existentes. */
  @Post(":id/reassess-complexity")
  reassessComplexity(@Param("id") id: string, @Body() body: { note?: string }) {
    return this.projects.reassessComplexity(id, { note: body?.note });
  }

  @Post(":id/generate-spec")
  generateSpec(@Param("id") id: string, @Query("queue") queue?: string) {
    return this.queueOrSync(id, "tasks", {}, queue);
    // spec no está en el switch del worker — cae a síncrono.
    // Si se implementa el worker, cambiar 'tasks' por el type real.
  }

  @Post(":id/generate-tasks")
  generateTasks(@Param("id") id: string, @Query("queue") queue?: string) {
    return this.queueOrSync(id, "tasks", {}, queue);
  }

  @Post(":id/repair-ux-ui-guide")
  repairUxUiGuide(@Param("id") id: string) {
    return this.projects.repairUxUiGuideYaml(id);
  }

  @Post(":id/generate-architecture")
  generateArchitecture(
    @Param("id") id: string,
    @Body() body: { preview?: boolean },
    @Query("queue") queue?: string,
  ) {
    if (body?.preview) return this.projects.generateArchitecturePreview(id);
    return this.queueOrSync(id, "architecture", { preview: false }, queue);
  }

  @Post(":id/generate-use-cases")
  generateUseCases(
    @Param("id") id: string,
    @Body() body: { preview?: boolean },
    @Query("queue") queue?: string,
  ) {
    if (body?.preview) return this.projects.generateUseCasesPreview(id);
    return this.queueOrSync(id, "use-cases", { preview: false }, queue);
  }

  @Post(":id/generate-user-stories")
  generateUserStories(
    @Param("id") id: string,
    @Body() body: { preview?: boolean },
    @Query("queue") queue?: string,
  ) {
    if (body?.preview) return this.projects.generateUserStoriesPreview(id);
    return this.queueOrSync(id, "user-stories", { preview: false }, queue);
  }

  @Post(":id/generate-blueprint")
  generateBlueprint(
    @Param("id") id: string,
    @Body() body: { preview?: boolean; gapsFeedback?: string },
    @Query("queue") queue?: string,
  ) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    if (body?.preview) return this.projects.generateBlueprintPreview(id, gaps);
    return this.queueOrSync(id, "blueprint", { preview: false, gapsFeedback: gaps ?? null }, queue);
  }

  @Post(":id/generate-api-contracts")
  generateApiContracts(
    @Param("id") id: string,
    @Body() body: { preview?: boolean; gapsFeedback?: string },
    @Query("queue") queue?: string,
  ) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    if (body?.preview) return this.projects.generateApiContractsPreview(id, gaps);
    return this.queueOrSync(id, "api-contracts", { preview: false, gapsFeedback: gaps ?? null }, queue);
  }

  @Post(":id/generate-logic-flows")
  generateLogicFlows(
    @Param("id") id: string,
    @Body() body: { gapsFeedback?: string },
    @Query("queue") queue?: string,
  ) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    return this.queueOrSync(id, "logic-flows", { gapsFeedback: gaps ?? null }, queue);
  }

  @Post(":id/generate-infra")
  generateInfra(
    @Param("id") id: string,
    @Body() body: { preview?: boolean; gapsFeedback?: string },
    @Query("queue") queue?: string,
  ) {
    const gaps = typeof body?.gapsFeedback === "string" ? body.gapsFeedback.trim() || undefined : undefined;
    if (body?.preview) return this.projects.generateInfraPreview(id, gaps);
    return this.queueOrSync(id, "infra", { preview: false, gapsFeedback: gaps ?? null }, queue);
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
    requireAdmin();
    return this.projects.remove(id);
  }

  @Get("favorites")
  listFavorites() {
    return this.projects.getUserFavoriteIds().then((s) => Array.from(s));
  }

  @Post(":id/favorite")
  toggleFavorite(@Param("id") id: string) {
    return this.projects.toggleFavorite(id);
  }

  /**
   * Helper: si la cola está habilitada y el cliente envió `?queue=true`,
   * encola el job y devuelve `{ queued: true, jobId }`.
   * Si no, ejecuta síncrono (comportamiento actual).
   */
  private async queueOrSync(
    projectId: string,
    type: GenerateJobType,
    extra: Record<string, unknown>,
    queueParam?: string,
  ): Promise<unknown> {
    const shouldQueue = queueParam === "true" && this.deliverablesQueue.isEnabled();
    if (shouldQueue) {
      const jobId = await this.deliverablesQueue.enqueue({
        type,
        projectId,
        preview: (extra.preview as boolean) ?? false,
        gapsFeedback: (extra.gapsFeedback as string | null) ?? null,
      });
      return { queued: true, jobId, statusPath: `/projects/jobs/${jobId}` };
    }
    // Fallback síncrono
    switch (type) {
      case "blueprint":
        return this.projects.generateBlueprint(projectId, (extra.gapsFeedback as string | undefined) ?? undefined);
      case "api-contracts":
        return this.projects.generateApiContracts(projectId, (extra.gapsFeedback as string | undefined) ?? undefined);
      case "logic-flows":
        return this.projects.generateLogicFlows(projectId, (extra.gapsFeedback as string | undefined) ?? undefined);
      case "tasks":
        return this.projects.generateTasks(projectId);
      case "infra":
        return this.projects.generateInfra(projectId, (extra.gapsFeedback as string | undefined) ?? undefined);
      case "architecture":
        return this.projects.generateArchitecture(projectId);
      case "use-cases":
        return this.projects.generateUseCases(projectId);
      case "user-stories":
        return this.projects.generateUserStories(projectId);
      default:
        return this.projects.generateBlueprint(projectId);
    }
  }
}
