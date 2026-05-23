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
import { analyzeGaps, filterResolvedGaps } from "./phase0-gap-analyzer.js";
import { phase0ToMarkdown } from "./phase0-to-markdown.js";
import type {
  Phase0Document,
  Phase0InterviewState,
  Phase0Gap,
  Phase0StreamEvent,
  Phase0QA,
} from "./phase0.types.js";
import { GAP_WEIGHT } from "./phase0.types.js";

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
      return { type: "error", message: "No se pudo configurar el modelo LLM del usuario. Verifica tu proveedor de IA." };
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

      const state: Phase0InterviewState = {
        projectId,
        threadId,
        borrador,
        gaps: mergedGaps,
        preguntasRealizadas: 0,
        maxPreguntas: MAX_PREGUNTAS,
        status: mergedGaps.some((g) => g.criticidad === "critico") ? "interviewing" : "done",
        inputRaw: idea,
        inputType,
        historial: [],
      };

      this.states.set(threadId, state);

      // Persistir
      await this.persistPhase0(projectId, borrador, mergedGaps, state.status);

      return { type: "init", threadId, borrador };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido al iniciar Fase 0";
      this.logger.error(`[Phase0] start error: ${msg}`);
      return { type: "error", message: msg };
    }
  }

  // ─── Obtener siguiente pregunta ─────────────────────────────────────

  async getQuestion(threadId: string): Promise<Phase0StreamEvent> {
    const state = this.states.get(threadId);
    if (!state) {
      return { type: "error", message: "Thread no encontrado. Inicia la Fase 0 primero." };
    }

    const criticalGaps = state.gaps.filter((g) => g.criticidad === "critico");

    if (criticalGaps.length === 0 || state.preguntasRealizadas >= state.maxPreguntas) {
      const remainingGaps = state.gaps.filter(
        (g) => g.criticidad === "importante" || g.criticidad === "opcional",
      );
      state.borrador.preguntasPendientes = remainingGaps.map((g) => g.descripcion);
      state.status = "done";
      await this.finalizePhase0(state);
      return { type: "done", borrador: state.borrador, gaps: state.gaps };
    }

    // Intentar con LLM; fallback a gap analyzer lógico
    const llm = await this.getUserLLM(state.projectId);
    if (!llm) {
      return this.fallbackQuestion(state);
    }

    try {
      const prompt = this.buildQuestionPrompt(state);
      const response = await llm.invoke([
        { role: "system", content: PHASE0_QUESTION_PROMPT },
        { role: "user", content: prompt },
      ]);

      const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
      const parsed = JSON.parse(content);

      if (parsed.type === "done") {
        state.status = "done";
        await this.finalizePhase0(state);
        return { type: "done", borrador: state.borrador, gaps: state.gaps };
      }

      state.ultimaPregunta = parsed.question;
      return {
        type: "question",
        question: parsed.question,
        n: state.preguntasRealizadas + 1,
        total: state.maxPreguntas,
      };
    } catch (err) {
      this.logger.error(`[Phase0] question LLM error: ${err}`);
      return this.fallbackQuestion(state);
    }
  }

  private fallbackQuestion(state: Phase0InterviewState): Phase0StreamEvent {
    const nextGap = state.gaps.find((g) => g.criticidad === "critico");
    if (nextGap) {
      state.ultimaPregunta = nextGap.sugerenciaPregunta;
      return {
        type: "question",
        question: nextGap.sugerenciaPregunta,
        n: state.preguntasRealizadas + 1,
        total: state.maxPreguntas,
      };
    }
    state.status = "done";
    return { type: "done", borrador: state.borrador, gaps: state.gaps };
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

    // Intentar actualizar con LLM
    const llm = await this.getUserLLM(state.projectId);
    if (!llm) {
      // Fallback: solo actualizar gaps lógicos
      state.gaps = filterResolvedGaps(analyzeGaps(state.borrador), state.borrador);
      if (state.preguntasRealizadas >= state.maxPreguntas) return this.finalize(state);
      await this.persistPhase0(state.projectId, state.borrador, state.gaps, state.status);
      return { type: "draft_updated", borrador: state.borrador, gaps: state.gaps };
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
      state.gaps = filterResolvedGaps(mergeGaps(llmGaps, logicGaps), state.borrador);

      if (state.preguntasRealizadas >= state.maxPreguntas) return this.finalize(state);

      await this.persistPhase0(state.projectId, state.borrador, state.gaps, state.status);
      return { type: "draft_updated", borrador: state.borrador, gaps: state.gaps };
    } catch (err) {
      this.logger.error(`[Phase0] answer error: ${err}`);
      state.gaps = filterResolvedGaps(analyzeGaps(state.borrador), state.borrador);
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

  private buildQuestionPrompt(state: Phase0InterviewState): string {
    return JSON.stringify({
      borrador_actual: state.borrador,
      gaps_actuales: state.gaps,
      preguntas_realizadas: state.preguntasRealizadas,
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
    const key = gap.seccion + ":" + gap.criticidad;
    if (!seen.has(key)) {
      merged.push(gap);
      seen.add(key);
    }
  }
  return merged.sort((a, b) => GAP_WEIGHT[a.criticidad] - GAP_WEIGHT[b.criticidad]);
}
