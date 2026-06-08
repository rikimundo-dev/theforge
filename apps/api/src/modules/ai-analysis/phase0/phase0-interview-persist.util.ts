import type { Phase0Document, Phase0Gap, Phase0InterviewState, Phase0QA } from "./phase0.types.js";

const ENVELOPE_VERSION = 1;

export type Phase0GapsEnvelope = {
  v: typeof ENVELOPE_VERSION;
  gaps: Phase0Gap[];
  interview?: {
    threadId: string;
    questionPlan: Phase0Gap[];
    planCursor: number;
    preguntasRealizadas: number;
    maxPreguntas: number;
    historial: Phase0QA[];
    ultimaPregunta?: string;
    inputRaw: string;
    inputType: Phase0InterviewState["inputType"];
    status: Phase0InterviewState["status"];
  };
};

export function serializePhase0GapsEnvelope(state: Phase0InterviewState): string {
  const payload: Phase0GapsEnvelope = {
    v: ENVELOPE_VERSION,
    gaps: state.gaps,
    interview: {
      threadId: state.threadId,
      questionPlan: state.questionPlan,
      planCursor: state.planCursor,
      preguntasRealizadas: state.preguntasRealizadas,
      maxPreguntas: state.maxPreguntas,
      historial: state.historial,
      ultimaPregunta: state.ultimaPregunta,
      inputRaw: state.inputRaw,
      inputType: state.inputType,
      status: state.status,
    },
  };
  return JSON.stringify(payload);
}

export function parsePhase0GapsEnvelope(raw: string | null | undefined): Phase0GapsEnvelope | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return { v: ENVELOPE_VERSION, gaps: parsed as Phase0Gap[] };
    }
    if (parsed && typeof parsed === "object" && "gaps" in parsed) {
      return parsed as Phase0GapsEnvelope;
    }
  } catch {
    return null;
  }
  return null;
}

export function rehydrateInterviewState(
  projectId: string,
  borrador: Phase0Document,
  envelope: Phase0GapsEnvelope,
  threadId: string,
): Phase0InterviewState | null {
  const interview = envelope.interview;
  if (!interview || interview.threadId !== threadId) return null;
  return {
    projectId,
    threadId: interview.threadId,
    borrador,
    gaps: envelope.gaps ?? [],
    preguntasRealizadas: interview.preguntasRealizadas,
    maxPreguntas: interview.maxPreguntas,
    questionPlan: interview.questionPlan ?? [],
    planCursor: interview.planCursor,
    status: interview.status,
    inputRaw: interview.inputRaw,
    inputType: interview.inputType,
    ultimaPregunta: interview.ultimaPregunta,
    historial: interview.historial ?? [],
  };
}
