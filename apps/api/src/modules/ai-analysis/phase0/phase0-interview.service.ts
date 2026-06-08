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
import { PHASE0_ARRANQUE_PROMPT, PHASE0_UPDATE_PROMPT } from "../prompts/load-prompts.js";
import { analyzeGaps, buildQuestionPlan, filterResolvedGaps } from "./phase0-gap-analyzer.js";
import { parsePhase0LlmJson } from "./phase0-llm-json.util.js";
import {
  parsePhase0GapsEnvelope,
  rehydrateInterviewState,
  serializePhase0GapsEnvelope,
} from "./phase0-interview-persist.util.js";
import { phase0ToMarkdown } from "./phase0-to-markdown.js";
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

function emptyDocument(): Phase0Document {
  return {
    proposito: { problema: "", usuarios: [], outOfScope: [] },
    entidades: [],
    reglasNegocio: [],
    flujos: [],
    roles: [],
    integraciones: [],
    edgeCases: [],
    preguntasPendientes: [],
  };
}

function parseBorradorFromProject(raw: string | null | undefined): Phase0Document {
  if (!raw?.trim()) return emptyDocument();
  try {
    return JSON.parse(raw) as Phase0Document;
  } catch {
    return emptyDocument();
  }
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

      const borrador = (parsed.borrador as Phase0Document | undefined) ?? emptyDocument();
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
      };

      this.rememberState(state);

      await this.persistInterviewState(state);

      if (!hasInterview) {
        await this.finalizePhase0(state);
        return { type: "done", borrador, gaps: mergedGaps };
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

    return this.questionForCurrentPlan(state);
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

        state.borrador = (parsed.borrador as Phase0Document | undefined) ?? state.borrador;

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

    const next = this.questionForCurrentPlan(state);
    if (next.type === "question") {
      return {
        ...next,
        borrador: state.borrador,
        gaps: state.gaps,
      };
    }
    return next;
  }

  private questionForCurrentPlan(state: Phase0InterviewState): Phase0StreamEvent {
    if (state.preguntasRealizadas >= state.maxPreguntas) {
      return this.finalizeSync(state);
    }

    const targetGap = state.questionPlan[state.planCursor];
    if (!targetGap) {
      return this.finalizeSync(state);
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

  private finalizeSync(state: Phase0InterviewState): Phase0StreamEvent {
    const remainingGaps = state.gaps.filter(
      (g) => g.criticidad === "importante" || g.criticidad === "opcional",
    );
    state.borrador.preguntasPendientes = remainingGaps.map((g) => g.descripcion);
    state.status = "done";
    void this.finalizePhase0(state);
    return { type: "done", borrador: state.borrador, gaps: state.gaps };
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
      select: { phase0SummaryContent: true, phase0Gaps: true },
    });
    if (!project) return null;

    const envelope = parsePhase0GapsEnvelope(project.phase0Gaps);
    if (!envelope?.interview) return null;

    const borrador = parseBorradorFromProject(project.phase0SummaryContent);
    const rehydrated = rehydrateInterviewState(projectId, borrador, envelope, threadId);
    if (!rehydrated) return null;

    this.rememberState(rehydrated);
    this.logger.log(`[Phase0] state rehydrated threadId=${threadId} planCursor=${rehydrated.planCursor}`);
    return rehydrated;
  }

  private async finalizePhase0(state: Phase0InterviewState): Promise<void> {
    const markdown = phase0ToMarkdown(state.borrador);
    try {
      await this.prisma.project.update({
        where: { id: state.projectId },
        data: {
          phase0SummaryContent: JSON.stringify(state.borrador, null, 2),
          phase0Gaps: serializePhase0GapsEnvelope(state),
          phase0Status: "done",
          phase0Questions: state.preguntasRealizadas,
          dbgaContent: markdown,
        },
      });
    } catch (err) {
      this.logger.warn(`[Phase0] finalize persist failed for ${state.projectId}: ${err}`);
    }
  }

  private async persistInterviewState(state: Phase0InterviewState): Promise<void> {
    try {
      await this.prisma.project.update({
        where: { id: state.projectId },
        data: {
          phase0SummaryContent: JSON.stringify(state.borrador, null, 2),
          phase0Gaps: serializePhase0GapsEnvelope(state),
          phase0Status: state.status,
          phase0Questions: state.preguntasRealizadas,
        },
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
