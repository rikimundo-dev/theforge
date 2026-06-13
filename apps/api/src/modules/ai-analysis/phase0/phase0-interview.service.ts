/**
 * Phase0InterviewService — orquesta el loop de entrevista interactiva.
 *
 * Pipeline:
 *   start()  → Prompt Arranque → borrador inicial + gaps + plan de preguntas
 *   question() → siguiente pregunta del plan (sin LLM extra)
 *   answer() → Prompt Actualización → borrador + **siguiente pregunta en la misma respuesta**
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AIFactory } from "../../ai/ai.factory.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { createDbgaLLM } from "../llm/create-dbga-llm.js";
import { PHASE0_ARRANQUE_PROMPT, PHASE0_EXTRACT_DBGA_PROMPT, PHASE0_UPDATE_PROMPT } from "../prompts/load-prompts.js";
import { analyzeGaps, buildQuestionPlan, filterResolvedGaps, isAskableGap } from "./phase0-gap-analyzer.js";
import { parsePhase0LlmJson } from "./phase0-llm-json.util.js";
import {
  parsePhase0GapsEnvelope,
  rehydrateInterviewState,
  serializePhase0GapsEnvelope,
} from "./phase0-interview-persist.util.js";
import {
  emptyPhase0Document,
  mergePhase0Borrador,
  normalizePhase0Document,
} from "./phase0-normalize.util.js";
import { shouldReplacePhase0SummaryWithBorrador } from "@theforge/shared-types";
import { phase0ToMarkdown } from "./phase0-to-markdown.js";
import {
  hasAuditDocument,
  hasBorradorContent,
  heuristicBorradorFromFreeformDbga,
  isFreeformDbgaContent,
  loadProjectBorrador,
} from "./phase0-load-borrador.util.js";
import type {
  Phase0Document,
  Phase0InterviewState,
  Phase0Gap,
  Phase0StreamEvent,
} from "./phase0.types.js";
import { GAP_WEIGHT } from "./phase0.types.js";
import {
  isPhase0FatalLlmError,
  phase0ProviderUnavailableEvent,
  toPhase0ErrorEvent,
} from "./phase0-llm-error.util.js";

const MAX_PREGUNTAS = 5;

const AUDIT_COMPLETE_MESSAGE =
  "No quedan gaps críticos ni importantes por definir en Paso 0. El documento está listo para Benchmark y MDD.";

const AUDIT_DONE_MESSAGE =
  "Auditoría completada. El borrador de Paso 0 se actualizó con tus respuestas.";

function parseBorradorFromProject(
  dbgaContent: string | null | undefined,
  phase0SummaryContent: string | null | undefined,
): Phase0Document {
  return loadProjectBorrador(dbgaContent, phase0SummaryContent);
}

@Injectable()
export class Phase0InterviewService {
  private readonly logger = new Logger(Phase0InterviewService.name);
  /** En memoria: estado activo por threadId */
  private readonly states = new Map<string, Phase0InterviewState>();
  /** threadId → projectId para rehidratar tras reload del proceso */
  private readonly threadProjectId = new Map<string, string>();

  constructor(
    private readonly aiFactory: AIFactory,
    private readonly prisma: PrismaService,
  ) {}

  async start(idea: string, projectId: string): Promise<Phase0StreamEvent> {
    const threadId = randomUUID();

    const llm = await this.getUserLLM(projectId);
    if (!llm) {
      return phase0ProviderUnavailableEvent();
    }

    const inputType =
      idea.length > 200 || idea.includes("#") || idea.includes("##") ? "external_doc" : "idea";

    const inputLabel =
      inputType === "external_doc"
        ? "A continuación, un documento externo del usuario. Extrae toda la información posible:\n\n"
        : "A continuación, la idea del usuario. Infiere todo lo posible:\n\n";

    try {
      const response = await llm.invoke([
        { role: "system", content: PHASE0_ARRANQUE_PROMPT },
        { role: "user", content: `${inputLabel}${idea}` },
      ]);

      const content =
        typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = parsePhase0LlmJson(content);

      const borrador = normalizePhase0Document(parsed.borrador ?? emptyPhase0Document());
      const llmGaps = (parsed.gaps as Phase0Gap[] | undefined) ?? [];

      const logicGaps = analyzeGaps(borrador);
      const mergedGaps = mergeGaps(llmGaps, logicGaps);
      const questionPlan = buildQuestionPlan(mergedGaps, MAX_PREGUNTAS);
      const hasInterview = questionPlan.length > 0;

      const state: Phase0InterviewState = {
        projectId,
        threadId,
        borrador,
        gaps: mergedGaps,
        preguntasRealizadas: 0,
        maxPreguntas: MAX_PREGUNTAS,
        questionPlan,
        planCursor: 0,
        status: hasInterview ? "interviewing" : "done",
        inputRaw: idea,
        inputType,
        historial: [],
        mode: "interview",
        sourceFormat: "structured",
      };

      this.rememberState(state);

      await this.persistInterviewState(state);

      if (!hasInterview) {
        const markdown = await this.finalizePhase0(state);
        return { type: "done", borrador, gaps: mergedGaps, markdown };
      }

      return { type: "init", threadId, borrador };
    } catch (err) {
      this.logger.error(`[Phase0] start error: ${err}`);
      return toPhase0ErrorEvent(err);
    }
  }

  async getQuestion(threadId: string, projectIdHint?: string): Promise<Phase0StreamEvent> {
    const state = await this.ensureState(threadId, projectIdHint);
    if (!state) {
      return { type: "error", message: "Thread no encontrado. Inicia la Fase 0 primero." };
    }

    return await this.questionForCurrentPlan(state);
  }

  async processAnswer(
    threadId: string,
    answer: string,
    projectIdHint?: string,
  ): Promise<Phase0StreamEvent> {
    const state = await this.ensureState(threadId, projectIdHint);
    if (!state) {
      return { type: "error", message: "Thread no encontrado. Inicia la Fase 0 primero." };
    }

    state.historial.push({ pregunta: state.ultimaPregunta ?? "—", respuesta: answer });
    state.preguntasRealizadas += 1;
    state.planCursor += 1;

    const llm = await this.getUserLLM(state.projectId);
    if (llm) {
      try {
        const updatePrompt = this.buildUpdatePrompt(state, answer);
        const response = await llm.invoke([
          { role: "system", content: PHASE0_UPDATE_PROMPT },
          { role: "user", content: updatePrompt },
        ]);

        const content =
          typeof response.content === "string" ? response.content : JSON.stringify(response.content);
        const parsed = parsePhase0LlmJson(content);

        if (parsed.borrador) {
          state.borrador = mergePhase0Borrador(
            state.borrador,
            normalizePhase0Document(parsed.borrador),
          );
        }

        const logicGaps = analyzeGaps(state.borrador);
        const llmGaps = (parsed.gaps as Phase0Gap[] | undefined) ?? [];
        state.gaps = filterResolvedGaps(
          mergeGaps(llmGaps, logicGaps),
          state.borrador,
          state.ultimaPregunta,
        );
      } catch (err) {
        this.logger.error(`[Phase0] answer LLM error: ${err}`);
        if (isPhase0FatalLlmError(err)) {
          return toPhase0ErrorEvent(err);
        }
        state.gaps = filterResolvedGaps(
          analyzeGaps(state.borrador),
          state.borrador,
          state.ultimaPregunta,
        );
      }
    } else {
      state.gaps = filterResolvedGaps(
        analyzeGaps(state.borrador),
        state.borrador,
        state.ultimaPregunta,
      );
    }

    await this.persistInterviewState(state);

    const next = await this.questionForCurrentPlan(state);
    if (next.type === "question") {
      return {
        ...next,
        borrador: state.borrador,
        gaps: state.gaps,
      };
    }
    return next;
  }

  /**
   * Repara proyectos con borrador JSON guardado pero sin dbgaContent (markdown).
   */
  async syncMarkdown(projectId: string): Promise<{ markdown: string | null }> {
    const pid = projectId?.trim();
    if (!pid) return { markdown: null };

    const project = await this.prisma.project.findUnique({
      where: { id: pid },
      select: { phase0SummaryContent: true, dbgaContent: true },
    });
    if (!project) return { markdown: null };

    if (project.dbgaContent?.trim()) {
      return { markdown: project.dbgaContent.trim() };
    }

    const borrador = parseBorradorFromProject(project.dbgaContent, project.phase0SummaryContent);
    if (!hasBorradorContent(borrador)) return { markdown: null };

    const markdown = await this.finalizePhase0FromBorrador(pid, borrador);
    return { markdown };
  }

  /**
   * Auditoría manual del documento DBGA visible (dbgaContent).
   */
  async audit(projectId: string): Promise<Phase0StreamEvent> {
    const pid = projectId?.trim();
    if (!pid) {
      return { type: "error", message: "projectId es requerido" };
    }

    const project = await this.prisma.project.findUnique({
      where: { id: pid },
      select: { phase0SummaryContent: true, phase0Gaps: true, dbgaContent: true },
    });
    if (!project) {
      return { type: "error", message: "Proyecto no encontrado" };
    }

    const dbgaMarkdown = project.dbgaContent?.trim() ?? "";

    if (!hasAuditDocument(project.dbgaContent, project.phase0SummaryContent)) {
      return {
        type: "error",
        message:
          "No hay documento de Fase 0 (DBGA) para auditar. Escribe o genera el análisis en la pestaña Fase 0.",
      };
    }

    const freeform = isFreeformDbgaContent(project.dbgaContent);
    let borrador: Phase0Document;
    let sourceFormat: Phase0InterviewState["sourceFormat"] = "structured";

    if (freeform) {
      sourceFormat = "freeform_dbga";
      borrador = await this.extractBorradorFromDbgaMarkdown(pid, dbgaMarkdown);
      if (!hasBorradorContent(borrador)) {
        borrador = heuristicBorradorFromFreeformDbga(dbgaMarkdown);
      }
    } else {
      borrador = parseBorradorFromProject(project.dbgaContent, project.phase0SummaryContent);
    }

    const gaps = analyzeGaps(borrador);
    const askable = gaps.filter(isAskableGap);

    if (askable.length === 0) {
      await this.prisma.project.update({
        where: { id: pid },
        data: {
          phase0Gaps: JSON.stringify({ v: 1, gaps }),
          phase0Status: "done",
        },
      });
      return {
        type: "audit_complete",
        message: AUDIT_COMPLETE_MESSAGE,
        borrador,
        gaps,
      };
    }

    const questionPlan = buildQuestionPlan(gaps, MAX_PREGUNTAS);
    const threadId = randomUUID();
    const state: Phase0InterviewState = {
      projectId: pid,
      threadId,
      borrador,
      gaps,
      preguntasRealizadas: 0,
      maxPreguntas: questionPlan.length,
      questionPlan,
      planCursor: 0,
      status: "interviewing",
      inputRaw: dbgaMarkdown.slice(0, 2000),
      inputType: "external_doc",
      historial: [],
      mode: "audit",
      sourceFormat,
    };

    this.rememberState(state);
    await this.persistInterviewState(state);

    const first = await this.questionForCurrentPlan(state);
    if (first.type !== "question") {
      return { type: "error", message: "No se pudo iniciar la auditoría de Paso 0" };
    }

    return {
      type: "audit_started",
      threadId,
      borrador: state.borrador,
      gaps: askable,
      question: first.question,
      n: first.n,
      total: first.total,
    };
  }

  private async questionForCurrentPlan(state: Phase0InterviewState): Promise<Phase0StreamEvent> {
    if (state.preguntasRealizadas >= state.maxPreguntas) {
      return await this.finalizeAndReturn(state);
    }

    const targetGap = state.questionPlan[state.planCursor];
    if (!targetGap) {
      return await this.finalizeAndReturn(state);
    }

    state.ultimaPregunta = targetGap.sugerenciaPregunta;
    state.status = "interviewing";
    return this.questionEvent(state, targetGap.sugerenciaPregunta);
  }

  private questionEvent(state: Phase0InterviewState, question: string): Phase0StreamEvent {
    const total = Math.max(state.questionPlan.length, 1);
    return {
      type: "question",
      question,
      n: state.planCursor + 1,
      total,
    };
  }

  private async finalizeAndReturn(state: Phase0InterviewState): Promise<Phase0StreamEvent> {
    const remainingGaps = state.gaps.filter(
      (g) => g.criticidad === "importante" || g.criticidad === "opcional",
    );
    state.borrador.preguntasPendientes = remainingGaps.map((g) => g.descripcion);
    state.status = "done";
    const markdown = await this.finalizePhase0(state);
    const message =
      state.mode === "audit"
        ? state.gaps.filter(isAskableGap).length === 0
          ? AUDIT_COMPLETE_MESSAGE
          : AUDIT_DONE_MESSAGE
        : undefined;
    return { type: "done", borrador: state.borrador, gaps: state.gaps, message, markdown };
  }

  private rememberState(state: Phase0InterviewState): void {
    this.states.set(state.threadId, state);
    this.threadProjectId.set(state.threadId, state.projectId);
  }

  private async ensureState(
    threadId: string,
    projectIdHint?: string,
  ): Promise<Phase0InterviewState | null> {
    const cached = this.states.get(threadId);
    if (cached) return cached;

    const projectId = (this.threadProjectId.get(threadId) ?? projectIdHint)?.trim();
    if (!projectId) return null;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { phase0SummaryContent: true, phase0Gaps: true, dbgaContent: true },
    });
    if (!project) return null;

    const envelope = parsePhase0GapsEnvelope(project.phase0Gaps);
    if (!envelope?.interview) return null;

    const borrador = parseBorradorFromProject(project.dbgaContent, project.phase0SummaryContent);
    const rehydrated = rehydrateInterviewState(projectId, borrador, envelope, threadId);
    if (!rehydrated) return null;

    this.rememberState(rehydrated);
    this.logger.log(`[Phase0] state rehydrated threadId=${threadId} planCursor=${rehydrated.planCursor}`);
    return rehydrated;
  }

  private async finalizePhase0(state: Phase0InterviewState): Promise<string> {
    return this.finalizePhase0FromBorrador(state.projectId, state.borrador, state);
  }

  private async finalizePhase0FromBorrador(
    projectId: string,
    borrador: Phase0Document,
    state?: Phase0InterviewState,
  ): Promise<string> {
    const markdown = phase0ToMarkdown(borrador);
    const syncDbga = this.shouldSyncDbgaMarkdown(state);
    try {
      const existing = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { phase0SummaryContent: true },
      });
      const data: {
        phase0SummaryContent?: string;
        phase0Gaps?: string;
        phase0Status: "done";
        phase0Questions?: number;
        dbgaContent?: string;
      } = {
        phase0Gaps: state ? serializePhase0GapsEnvelope(state) : undefined,
        phase0Status: "done",
        phase0Questions: state?.preguntasRealizadas,
        ...(syncDbga ? { dbgaContent: markdown } : {}),
      };
      if (shouldReplacePhase0SummaryWithBorrador(existing?.phase0SummaryContent)) {
        data.phase0SummaryContent = JSON.stringify(borrador, null, 2);
      }
      await this.prisma.project.update({
        where: { id: projectId },
        data,
      });
    } catch (err) {
      this.logger.warn(`[Phase0] finalize persist failed for ${projectId}: ${err}`);
    }
    return syncDbga ? markdown : "";
  }

  private shouldSyncDbgaMarkdown(state?: Phase0InterviewState): boolean {
    if (!state) return true;
    if (state.sourceFormat === "freeform_dbga") return false;
    return true;
  }

  private async extractBorradorFromDbgaMarkdown(
    projectId: string,
    markdown: string,
  ): Promise<Phase0Document> {
    const llm = await this.getUserLLM(projectId);
    if (!llm) {
      this.logger.warn(`[Phase0] extract DBGA: no LLM, using heuristic for ${projectId}`);
      return heuristicBorradorFromFreeformDbga(markdown);
    }

    try {
      const response = await llm.invoke([
        { role: "system", content: PHASE0_EXTRACT_DBGA_PROMPT },
        { role: "user", content: markdown.slice(0, 24_000) },
      ]);
      const content =
        typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = parsePhase0LlmJson(content);
      const borrador = normalizePhase0Document(parsed.borrador ?? emptyPhase0Document());
      if (hasBorradorContent(borrador)) return borrador;
    } catch (err) {
      this.logger.warn(`[Phase0] extract DBGA LLM failed for ${projectId}: ${err}`);
    }

    return heuristicBorradorFromFreeformDbga(markdown);
  }

  private async persistInterviewState(
    state: Phase0InterviewState,
    existingPhase0Summary?: string | null,
  ): Promise<void> {
    try {
      let existing = existingPhase0Summary;
      if (existing === undefined) {
        const row = await this.prisma.project.findUnique({
          where: { id: state.projectId },
          select: { phase0SummaryContent: true },
        });
        existing = row?.phase0SummaryContent;
      }

      const summaryJson = JSON.stringify(state.borrador, null, 2);
      const data: {
        phase0SummaryContent?: string;
        phase0Gaps: string;
        phase0Status: Phase0InterviewState["status"];
        phase0Questions: number;
        dbgaContent?: string;
      } = {
        phase0Gaps: serializePhase0GapsEnvelope(state),
        phase0Status: state.status,
        phase0Questions: state.preguntasRealizadas,
      };
      if (shouldReplacePhase0SummaryWithBorrador(existing)) {
        data.phase0SummaryContent = summaryJson;
      }
      if (this.shouldSyncDbgaMarkdown(state)) {
        data.dbgaContent = phase0ToMarkdown(state.borrador);
      }
      await this.prisma.project.update({
        where: { id: state.projectId },
        data,
      });
    } catch (err) {
      this.logger.warn(`[Phase0] persist failed for ${state.projectId}: ${err}`);
    }
  }

  private async getUserLLM(projectId: string) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });
      if (!project) return null;
      return await createDbgaLLM(this.aiFactory, project.userId);
    } catch (err) {
      this.logger.warn(`[Phase0] getUserLLM failed for ${projectId}: ${err}`);
      return null;
    }
  }

  getState(threadId: string): Phase0InterviewState | undefined {
    return this.states.get(threadId);
  }

  clearState(threadId: string): void {
    this.states.delete(threadId);
    this.threadProjectId.delete(threadId);
  }

  private buildUpdatePrompt(state: Phase0InterviewState, answer: string): string {
    return JSON.stringify(
      {
        borrador_actual: state.borrador,
        gaps_actuales: state.gaps,
        ultima_pregunta: state.ultimaPregunta,
        respuesta_usuario: answer,
        historial: state.historial.map((qa) => ({ P: qa.pregunta, R: qa.respuesta })),
      },
      null,
      2,
    );
  }
}

function mergeGaps(llmGaps: Phase0Gap[], logicGaps: Phase0Gap[]): Phase0Gap[] {
  const seen = new Set<string>();
  const merged: Phase0Gap[] = [];
  for (const gap of [...llmGaps, ...logicGaps]) {
    const key = `${gap.seccion}:${gap.criticidad}:${gap.descripcion.slice(0, 64)}`;
    if (!seen.has(key)) {
      merged.push(gap);
      seen.add(key);
    }
  }
  return merged.sort((a, b) => GAP_WEIGHT[a.criticidad] - GAP_WEIGHT[b.criticidad]);
}
