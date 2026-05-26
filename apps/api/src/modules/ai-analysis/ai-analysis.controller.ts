import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { Readable } from "node:stream";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AiAnalysisService } from "./ai-analysis.service.js";
import { EstimationService } from "./estimation/estimation.service.js";
import { Phase0InterviewService } from "./phase0/phase0-interview.service.js";
import { parseChatImageAttachments } from "../ai/utils/chat-image-attachments.util.js";
import { formatDbgaStreamError } from "./utils/dbga-stream-error.util.js";

@Controller("ai-analysis")
export class AiAnalysisController {
  constructor(
    private readonly aiAnalysis: AiAnalysisService,
    private readonly estimationService: EstimationService,
    private readonly phase0Interview: Phase0InterviewService,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Métricas en vivo de estimación (Semáforo + MXN) para un proyecto.
   * GET: usa borrador en vivo si hay stream MDD activo; sino mddContent del proyecto en DB.
   * POST: si body.mddContent está presente, calcula métricas sobre ese contenido (lo que ve el usuario); sino igual que GET.
   */
  @Get("estimation")
  async getEstimation(
    @Query("projectId") projectId: string,
    @Query("stageId") stageId?: string,
  ) {
    const id = typeof projectId === "string" ? projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    const sid = typeof stageId === "string" ? stageId.trim() || undefined : undefined;
    const metrics = await this.estimationService.getLiveMetricsForProject(id, undefined, sid);
    const mddContent = await this.estimationService.getMddContentForProject(id, sid);
    const precisionBreakdown =
      mddContent && mddContent.trim().length > 80
        ? this.estimationService.getPrecisionBreakdown(mddContent, { projectId: id, stageId: sid ?? null })
        : undefined;
    return { ...metrics, precisionBreakdown };
  }

  @Post("estimation")
  async postEstimation(@Body() body: { projectId?: string; mddContent?: string; stageId?: string }) {
    const id = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    const sid = typeof body?.stageId === "string" ? body.stageId.trim() || undefined : undefined;
    const mddContent =
      typeof body?.mddContent === "string" ? body.mddContent.trim() || undefined : undefined;
    const metrics = await this.estimationService.getLiveMetricsForProject(id, mddContent, sid);
    const contentForBreakdown =
      mddContent ?? (await this.estimationService.getMddContentForProject(id, sid));
    const precisionBreakdown =
      contentForBreakdown && contentForBreakdown.trim().length > 80
        ? this.estimationService.getPrecisionBreakdown(contentForBreakdown, { projectId: id, stageId: sid ?? null })
        : undefined;
    return { ...metrics, precisionBreakdown };
  }

  /**
   * Limpia el borrador en vivo del proyecto (para que la estimación use mddContent guardado en DB).
   * Llamar tras PATCH project con mddContent para que el semáforo refleje el contenido guardado.
   */
  @Post("estimation/clear-draft")
  async clearEstimationDraft(@Body() body: { projectId?: string; stageId?: string }) {
    const id = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    const sid = typeof body?.stageId === "string" ? body.stageId.trim() || undefined : undefined;
    this.estimationService.clearLiveDraft(id, sid);
    return { ok: true };
  }

  /**
   * Borra el checkpoint LangGraph del hilo DBGA (mddStageId vacío) para el proyecto.
   * Usar al limpiar el benchmark en el taller para no reanudar un grafo antiguo.
   */
  @Delete("dbga/checkpoint")
  async clearDbgaCheckpoint(@Query("projectId") projectId: string) {
    const id = typeof projectId === "string" ? projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    await this.aiAnalysis.clearMddCheckpoint(id, "");
    return { ok: true };
  }

  /**
   * Starts a DBGA analysis for the given idea.
   * Body: { idea: string, projectId?: string }. Si projectId viene, se persiste estado por thread para retomar Fase 0.
   */
  @Post("start")
  startAnalysis(@Body() body: { idea?: string; projectId?: string }) {
    const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
    if (!idea) {
      throw new BadRequestException("idea is required");
    }
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() || undefined : undefined;
    return this.aiAnalysis.startAnalysis(idea, projectId);
  }

  /**
   * Streams the DBGA analysis: NDJSON con eventos { type: "progress"|"done"|"error", agent?, message?, markdown? }.
   * Body: { idea: string, projectId?: string }.
   */
  @Post("stream")
  async streamAnalysis(
    @Body() body: { idea?: string; projectId?: string },
    @Res() res: Response,
  ) {
    const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
    if (!idea) {
      throw new BadRequestException("idea is required");
    }
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() || undefined : undefined;

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const service = this.aiAnalysis;
    const stream = Readable.from(
      (async function* () {
        try {
          for await (const event of service.streamAnalysis(idea, projectId)) {
            yield JSON.stringify(event) + "\n";
          }
        } catch (err) {
          const payload = formatDbgaStreamError(err);
          console.error("[DBGA stream] error:", payload.message);
          yield JSON.stringify({ type: "error", ...payload }) + "\n";
        }
      })(),
    );
    res.on("close", () => { stream.destroy(); });
    stream.on("error", (err) => {
      console.error("[DBGA stream] stream error:", err);
      if (!res.destroyed) {
        try { res.end(); } catch { /* ignore */ }
      }
    });
    stream.pipe(res);
  }

  /**
   * Revisión de consistencia del MDD: re-deriva diagramas (ER desde SQL, etc.) y devuelve el documento actualizado.
   * Body: { projectId: string, mddContent?: string }. Si mddContent no viene, se usa el del proyecto en DB.
   * Respuesta: { mddContent: string }.
   */
  @Post("mdd/review")
  async reviewMdd(@Body() body: { projectId?: string; mddContent?: string }) {
    const id = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    const mddContent =
      typeof body?.mddContent === "string" ? body.mddContent.trim() || undefined : undefined;
    const updated = await this.aiAnalysis.reviewMddConsistency(id, mddContent);
    return { mddContent: updated };
  }

  /**
   * Devuelve el threadId del flujo MDD para el proyecto, si existe.
   * El frontend lo usa para rehidratar managerThreadId al reabrir la app y seguir con resume.
   */
  @Get("mdd/thread")
  async getMddThread(@Query("projectId") projectId: string, @Query("stageId") stageId?: string) {
    const id = typeof projectId === "string" ? projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    const sid = typeof stageId === "string" ? stageId.trim() || undefined : undefined;
    const threadId = await this.aiAnalysis.getMddThreadId(id, sid);
    return { threadId };
  }

  /**
   * Streams the MDD (Master Design Document) pipeline: Clarificador → Security → Integration → Auditor.
   * NDJSON: { type: "progress"|"done"|"error", agent?, message?, markdown? }.
   * Body: { dbgaContent?: string, projectId?: string }. dbgaContent opcional; si no hay Benchmark, los agentes generan un MDD base.
   */
  @Post("mdd/stream")
  async streamMdd(
    @Body() body: { dbgaContent?: string; projectId?: string; stageId?: string },
    @Res() res: Response,
  ) {
    const dbgaContent = typeof body?.dbgaContent === "string" ? body.dbgaContent.trim() : "";
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() || undefined : undefined;
    const stageId = typeof body?.stageId === "string" ? body.stageId.trim() || undefined : undefined;

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const service = this.aiAnalysis;
    const stream = Readable.from(
      (async function* () {
        try {
          for await (const event of service.streamMddAnalysis(dbgaContent, projectId, stageId)) {
            yield JSON.stringify(event) + "\n";
          }
        } catch (err) {
          const payload = formatDbgaStreamError(err);
          console.error("[MDD stream] error:", payload.message);
          yield JSON.stringify({ type: "error", ...payload }) + "\n";
        }
      })(),
    );
    // Si el cliente se desconecta, destruir el stream para no quedarlo colgado
    res.on("close", () => { stream.destroy(); });
    stream.on("error", (err) => {
      console.error("[MDD stream] stream error:", err);
      if (!res.destroyed) {
        try { res.end(); } catch { /* ignore */ }
      }
    });
    stream.pipe(res);
  }

  /**
   * Flujo MDD con Manager (Supervisor): conversación o entrevista; el Manager responde, hace preguntas o delega en agentes.
   * NDJSON: progress | interrupt { threadId, reply?, questions? } | done | error.
   * Body: { dbgaContent?: string, projectId: string, initialMessage?: string, mddContent?: string }. Requiere projectId.
   * mddContent = borrador actual del MDD para no perder contenido al delegar.
   */
  @Post("mdd/stream/manager")
  async streamMddManager(
    @Body() body: {
      dbgaContent?: string;
      projectId?: string;
      initialMessage?: string;
      mddContent?: string;
      stageId?: string;
      images?: unknown;
    },
    @Res() res: Response,
  ) {
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      throw new BadRequestException("projectId is required for the Manager flow");
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (project && (project as { projectType?: string }).projectType === "LEGACY") {
      throw new BadRequestException(
        "Generar MDD con agentes (Manager) es solo para proyectos nuevos. En legacy usa el flujo de modificaciones.",
      );
    }
    const dbgaContent = typeof body?.dbgaContent === "string" ? body.dbgaContent.trim() : "";
    const initialMessage = typeof body?.initialMessage === "string" ? body.initialMessage.trim() : undefined;
    const mddContent = typeof body?.mddContent === "string" ? body.mddContent.trim() : undefined;
    const stageId = typeof body?.stageId === "string" ? body.stageId.trim() || undefined : undefined;
    const imageAttachments = parseChatImageAttachments(body?.images);

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const service = this.aiAnalysis;
    const stream = Readable.from(
      (async function* () {
        try {
          for await (const event of service.streamMddAnalysisWithManager(
            dbgaContent,
            projectId,
            initialMessage,
            mddContent,
            stageId,
            imageAttachments,
          )) {
            yield JSON.stringify(event) + "\n";
          }
        } catch (err) {
          const payload = formatDbgaStreamError(err);
          console.error("[MDD stream/manager] error:", payload.message);
          yield JSON.stringify({ type: "error", ...payload }) + "\n";
        }
      })(),
    );
    // Si el cliente se desconecta, destruir el stream para no quedarlo colgado
    res.on("close", () => { stream.destroy(); });
    stream.on("error", (err) => {
      console.error("[MDD stream/manager] stream error:", err);
      if (!res.destroyed) {
        try { res.end(); } catch { /* ignore */ }
      }
    });
    stream.pipe(res);
  }

  /**
   * Regenera solo una sección del MDD (2–7) con el resto del documento como contexto.
   * Usado por comandos / en el chat (ej. /infraestructura).
   * Body: { projectId: string, section: number, mddContent?: string }. NDJSON: progress | done | error.
   */
  @Post("mdd/stream/regenerate-section")
  async streamMddRegenerateSection(
    @Body() body: { projectId?: string; section?: number; mddContent?: string; stageId?: string },
    @Res() res: Response,
  ) {
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const section = typeof body?.section === "number" ? body.section : Number(body?.section);
    const mddContent = typeof body?.mddContent === "string" ? body.mddContent.trim() : undefined;
    const stageId = typeof body?.stageId === "string" ? body.stageId.trim() || undefined : undefined;
    if (!projectId) {
      res.status(400).json({ message: "projectId is required" });
      return;
    }
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (project && (project as { projectType?: string }).projectType === "LEGACY") {
      throw new BadRequestException(
        "Regenerar sección MDD es solo para proyectos nuevos. En legacy usa el flujo de modificaciones.",
      );
    }
    if (!Number.isInteger(section) || section < 1 || section > 7) {
      res.status(400).json({ message: "section must be 1–7" });
      return;
    }
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const service = this.aiAnalysis;
    const stream = Readable.from(
      (async function* () {
        try {
          for await (const event of service.streamMddRegenerateSection(projectId, section, mddContent, stageId)) {
            yield JSON.stringify(event) + "\n";
          }
        } catch (err) {
          const payload = formatDbgaStreamError(err);
          console.error("[MDD stream/regenerate-section] error:", payload.message);
          yield JSON.stringify({ type: "error", ...payload }) + "\n";
        }
      })(),
    );
    res.on("close", () => { stream.destroy(); });
    stream.on("error", (err) => {
      console.error("[MDD stream/regenerate-section] stream error:", err);
      if (!res.destroyed) {
        try { res.end(); } catch { /* ignore */ }
      }
    });
    stream.pipe(res);
  }

  /**
   * Reanuda el flujo MDD con Manager tras la respuesta del usuario.
   * Body: { projectId: string, threadId: string, userMessage: string, mddContent?: string }.
   * mddContent opcional: si viene, se inyecta en el estado para no perder el documento actual (evita revertir al checkpoint viejo).
   */
  @Post("mdd/stream/resume")
  async streamMddResume(
    @Body() body: {
      projectId?: string;
      threadId?: string;
      userMessage?: string;
      mddContent?: string;
      images?: unknown;
    },
    @Res() res: Response,
  ) {
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
    const userMessage = typeof body?.userMessage === "string" ? body.userMessage.trim() : "";
    const mddContent = typeof body?.mddContent === "string" ? body.mddContent.trim() : undefined;
    const imageAttachments = parseChatImageAttachments(body?.images);
    if (!projectId || !threadId) {
      throw new BadRequestException("projectId and threadId are required");
    }
    if (!userMessage && !imageAttachments.length) {
      throw new BadRequestException("userMessage or images are required");
    }

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const service = this.aiAnalysis;
    const stream = Readable.from(
      (async function* () {
        try {
          for await (const event of service.streamMddResume(
            projectId,
            threadId,
            userMessage,
            mddContent,
            imageAttachments,
          )) {
            yield JSON.stringify(event) + "\n";
          }
        } catch (err) {
          const payload = formatDbgaStreamError(err);
          console.error("[MDD stream/resume] error:", payload.message);
          yield JSON.stringify({ type: "error", ...payload }) + "\n";
        }
      })(),
    );
    // Si el cliente se desconecta, destruir el stream para no quedarlo colgado
    res.on("close", () => { stream.destroy(); });
    stream.on("error", (err) => {
      console.error("[MDD stream/resume] stream error:", err);
      if (!res.destroyed) {
        try { res.end(); } catch { /* ignore */ }
      }
    });
    stream.pipe(res);
  }

  /**
   * Obtiene las decisiones arquitectónicas (ADRs) guardadas para el proyecto.
   */
  @Get("mdd/adrs")
  async getAdrs(@Query("projectId") projectId: string) {
    const id = typeof projectId === "string" ? projectId.trim() : "";
    if (!id) {
      throw new BadRequestException("projectId is required");
    }
    return this.aiAnalysis.getProjectDecisions(id);
  }

  // ─── Fase 0 — Entrevista Interactiva ─────────────────────────────

  /**
   * Inicia la Fase 0: toma idea o documento externo, ejecuta prompt de arranque,
   * devuelve borrador inicial + gaps.
   */
  @Post("phase0/start")
  async startPhase0(@Body() body: { idea?: string; projectId?: string }) {
    const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
    const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
    if (!idea) throw new BadRequestException("idea is required");
    if (!projectId) throw new BadRequestException("projectId is required");
    return this.phase0Interview.start(idea, projectId);
  }

  /**
   * Obtiene la siguiente pregunta del entrevistador.
   */
  @Get("phase0/question/:threadId")
  async getPhase0Question(@Param("threadId") threadId: string) {
    if (!threadId) throw new BadRequestException("threadId is required");
    return this.phase0Interview.getQuestion(threadId);
  }

  /**
   * Envía respuesta a la última pregunta y recibe borrador actualizado.
   */
  @Post("phase0/answer")
  async answerPhase0(@Body() body: { threadId?: string; answer?: string }) {
    const threadId = typeof body?.threadId === "string" ? body.threadId.trim() : "";
    const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
    if (!threadId) throw new BadRequestException("threadId is required");
    if (!answer) throw new BadRequestException("answer is required");
    return this.phase0Interview.processAnswer(threadId, answer);
  }

  /**
   * Obtiene el estado actual de la entrevista Fase 0.
   */
  @Get("phase0/state/:threadId")
  async getPhase0State(@Param("threadId") threadId: string) {
    const state = this.phase0Interview.getState(threadId);
    if (!state) throw new BadRequestException("Thread no encontrado");
    return {
      status: state.status,
      preguntasRealizadas: state.preguntasRealizadas,
      maxPreguntas: state.maxPreguntas,
      borrador: state.borrador,
      gaps: state.gaps,
    };
  }
}
