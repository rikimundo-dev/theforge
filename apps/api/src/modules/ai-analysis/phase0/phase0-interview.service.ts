/**
 * Phase0InterviewService — orquesta el loop de entrevista interactiva.
 * 
 * Pipeline:
 *   start()  → Prompt Arranque → borrador inicial + gaps
 *   question() → Prompt Una Pregunta → { question | done }
 *   answer() → Prompt Actualización → borrador + gaps recalculados
 * 
 * Sigue el mismo patrón que el resto del pipeline:
 * - BYOK del usuario (createDbgaLLM)
 * - Persistencia en project.phase0SummaryContent
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AIFactory } from "../../ai/ai.factory.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { createDbgaLLM } from "../llm/create-dbga-llm.js";
import { PHASE0_ARRANQUE_PROMPT, PHASE0_QUESTION_PROMPT, PHASE0_UPDATE_PROMPT } from "../prompts/load-prompts.js";
import { analyzeGaps, buildQuestionPlan, filterResolvedGaps } from "./phase0-gap-analyzer.js";
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

@Injectable()
export class Phase0InterviewService {
  private readonly logger = new Logger(Phase0InterviewService.name);
  /** En memoria: estado activo de cada proyecto */
  private readonly states = new Map<string, Phase0InterviewState>();

  constructor(
    private readonly aiFactory: AIFactory,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Inicio: arranque ──────────────────────────────────────────────

  async start(
    idea: string,
    projectId: string,
  ): Promise<Phase0StreamEvent> {
    const threadId = randomUUID();

    // Cargar LLM del usuario
    const llm = await this.getUserLLM(projectId);
    if (!llm) {
      return phase0ProviderUnavailableEvent();
    }

    // Detectar tipo de input
    const inputType = idea.length > 200 || idea.includes("#") || idea.includes("##")
      ? "external_doc"
      : "idea";

    const inputLabel = inputType === "external_doc"
      ? "A continuación, un documento externo del usuario. Extrae toda la información posible:\n\n"
      : "A continuación, la idea del usuario. Infiere todo lo posible:\n\n";

    try {
      const response = await llm.invoke([
        { role: "system", content: PHASE0_ARRANQUE_PROMPT },
        { role: "user", content: `${inputLabel}${idea}` },
      ]);

      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = JSON.parse(content);

      const borrador: Phase0Document = parsed.borrador ?? emptyDocument();
      const llmGaps: Phase0Gap[] = parsed.gaps ?? [];

      // Gap analyzer lógico como respaldo
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

      this.states.set(threadId, state);

      // Persistir borrador intermedio (sin dbgaContent hasta finalizar entrevista)
      await this.persistPhase0(projectId, borrador, mergedGaps, state.status);

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

  // ─── Obtener siguiente pregunta ─────────────────────────────────────

  async getQuestion(threadId: string): Promise<Phase0StreamEvent> {
    const state = this.states.get(threadId);
    if (!state) {
      return { type: "error", message: "Thread no encontrado. Inicia la Fase 0 primero." };
    }

    if (state.preguntasRealizadas >= state.maxPreguntas) {
      return this.finalize(state);
    }

    const targetGap = this.resolvePlannedGap(state);
    if (!targetGap) {
      return this.finalize(state);
    }

    const llm = await this.getUserLLM(state.projectId);
    if (!llm) {
      return phase0ProviderUnavailableEvent();
    }

    try {
      const prompt = this.buildQuestionPrompt(state, targetGap);
      const response = await llm.invoke([
        { role: "system", content: PHASE0_QUESTION_PROMPT },
        { role: "user", content: prompt },
      ]);

      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = JSON.parse(content);

      if (parsed.type === "done") {
        this.logger.warn(
          `[Phase0] LLM devolvió done antes de tiempo (plan ${state.planCursor + 1}/${state.questionPlan.length}); usando gap planificado`,
        );
        return this.askFromPlannedGap(state, targetGap);
      }

      const question =
        typeof parsed.question === "string" && parsed.question.trim()
          ? parsed.question.trim()
          : targetGap.sugerenciaPregunta;
      state.ultimaPregunta = question;
      return this.questionEvent(state, question);
    } catch (err) {
      this.logger.error(`[Phase0] question LLM error: ${err}`);
      if (isPhase0FatalLlmError(err)) {
        return toPhase0ErrorEvent(err);
      }
      return this.askFromPlannedGap(state, targetGap);
    }
  }

  private resolvePlannedGap(state: Phase0InterviewState): Phase0Gap | undefined {
    while (state.planCursor < state.questionPlan.length) {
      return state.questionPlan[state.planCursor];
    }
    return undefined;
  }

  private askFromPlannedGap(state: Phase0InterviewState, gap: Phase0Gap): Phase0StreamEvent {
    state.ultimaPregunta = gap.sugerenciaPregunta;
    return this.questionEvent(state, gap.sugerenciaPregunta);
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

  // ─── Procesar respuesta → actualizar borrador ───────────────────────

  async processAnswer(threadId: string, answer: string): Promise<Phase0StreamEvent> {
    const state = this.states.get(threadId);
    if (!state) {
      return { type: "error", message: "Thread no encontrado. Inicia la Fase 0 primero." };
    }

    // Registrar historial
    state.historial.push({ pregunta: state.ultimaPregunta ?? "—", respuesta: answer });
    state.preguntasRealizadas += 1;
    state.planCursor += 1;

    // Intentar actualizar con LLM
    const llm = await this.getUserLLM(state.projectId);
    if (!llm) {
      return phase0ProviderUnavailableEvent();
    }

    try {
      const updatePrompt = this.buildUpdatePrompt(state, answer);
      const response = await llm.invoke([
        { role: "system", content: PHASE0_UPDATE_PROMPT },
        { role: "user", content: updatePrompt },
      ]);

      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = JSON.parse(content);

      state.borrador = parsed.borrador ?? state.borrador;

      // Recalcular gaps
      const logicGaps = analyzeGaps(state.borrador);
      const llmGaps: Phase0Gap[] = parsed.gaps ?? [];
      state.gaps = filterResolvedGaps(mergeGaps(llmGaps, logicGaps), state.borrador, state.ultimaPregunta);

      if (state.preguntasRealizadas >= state.maxPreguntas) return this.finalize(state);

      await this.persistPhase0(state.projectId, state.borrador, state.gaps, state.status);
      return { type: "draft_updated", borrador: state.borrador, gaps: state.gaps };
    } catch (err) {
      this.logger.error(`[Phase0] answer error: ${err}`);
      if (isPhase0FatalLlmError(err)) {
        return toPhase0ErrorEvent(err);
      }
      state.gaps = filterResolvedGaps(analyzeGaps(state.borrador), state.borrador, state.ultimaPregunta);
      await this.persistPhase0(state.projectId, state.borrador, state.gaps, state.status);
      return { type: "draft_updated", borrador: state.borrador, gaps: state.gaps };
    }
  }

  // ─── Finalización ───────────────────────────────────────────────────

  private async finalize(state: Phase0InterviewState): Promise<Phase0StreamEvent> {
    const remainingGaps = state.gaps.filter(
      (g) => g.criticidad === "importante" || g.criticidad === "opcional",
    );
    state.borrador.preguntasPendientes = remainingGaps.map((g) => g.descripcion);
    state.status = "done";
    await this.finalizePhase0(state);
    return { type: "done", borrador: state.borrador, gaps: state.gaps };
  }

  /** Al completar Fase 0: persiste borrador + convierte a markdown como dbgaContent */
  private async finalizePhase0(state: Phase0InterviewState): Promise<void> {
    const markdown = phase0ToMarkdown(state.borrador);
    try {
      await this.prisma.project.update({
        where: { id: state.projectId },
        data: {
          phase0SummaryContent: JSON.stringify(state.borrador, null, 2),
          phase0Gaps: JSON.stringify(state.gaps, null, 2),
          phase0Status: "done",
          phase0Questions: state.preguntasRealizadas,
          // Alimentar dbgaContent para el pipeline MDD
          dbgaContent: markdown,
        },
      });
    } catch (err) {
      this.logger.warn(`[Phase0] finalize persist failed for ${state.projectId}: ${err}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async persistPhase0(
    projectId: string,
    borrador: Phase0Document,
    gaps: Phase0Gap[],
    status: string,
  ): Promise<void> {
    try {
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          phase0SummaryContent: JSON.stringify(borrador, null, 2),
          phase0Gaps: JSON.stringify(gaps, null, 2),
          phase0Status: status,
          phase0Questions: stateGapCount(gaps),
        },
      });
    } catch (err) {
      this.logger.warn(`[Phase0] persist failed for ${projectId}: ${err}`);
    }
  }

  /** Crea LLM usando el patrón existente createDbgaLLM */
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
  }

  private buildQuestionPrompt(state: Phase0InterviewState, targetGap: Phase0Gap): string {
    return JSON.stringify({
      borrador_actual: state.borrador,
      gaps_actuales: state.gaps,
      gap_objetivo: targetGap,
      preguntas_realizadas: state.preguntasRealizadas,
      pregunta_planificada_numero: state.planCursor + 1,
      total_planificadas: state.questionPlan.length,
      max_preguntas: state.maxPreguntas,
      historial: state.historial.map((qa) => ({ P: qa.pregunta, R: qa.respuesta })),
    }, null, 2);
  }

  private buildUpdatePrompt(state: Phase0InterviewState, answer: string): string {
    return JSON.stringify({
      borrador_actual: state.borrador,
      gaps_actuales: state.gaps,
      ultima_pregunta: state.ultimaPregunta,
      respuesta_usuario: answer,
      historial: state.historial.map((qa) => ({ P: qa.pregunta, R: qa.respuesta })),
    }, null, 2);
  }
}

function stateGapCount(gaps: Phase0Gap[]): number {
  return gaps.filter((g) => g.criticidad === "critico").length;
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
