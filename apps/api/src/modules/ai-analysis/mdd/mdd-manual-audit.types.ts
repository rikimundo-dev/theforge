import type { AuditorGapsState } from "../state/mdd-state.schema.js";

export const MDD_AUDIT_PASS_THRESHOLD = 85;
export const MDD_MIN_AUDIT_CHARS = 200;
export const MDD_MAX_AUDIT_QUESTIONS = 5;

export const MDD_AUDIT_COMPLETE_MESSAGE =
  "No quedan gaps críticos en el MDD. El documento está listo para Spec y entregables.";

export const MDD_AUDIT_DONE_MESSAGE =
  "Auditoría completada. El MDD se actualizó con tus respuestas.";

export interface MddAuditQuestionItem {
  sections: string[];
  issue: string;
  sugerenciaPregunta: string;
}

export interface MddAuditQA {
  pregunta: string;
  respuesta: string;
  issue?: string;
}

export interface MddManualAuditState {
  projectId: string;
  stageId: string;
  threadId: string;
  mddDraft: string;
  auditorScore: number;
  auditorFeedback: string;
  auditorGaps: AuditorGapsState | null;
  questionPlan: MddAuditQuestionItem[];
  planCursor: number;
  preguntasRealizadas: number;
  maxPreguntas: number;
  historial: MddAuditQA[];
  ultimaPregunta?: string;
  status: "interviewing" | "done";
  mddComplexity: "LOW" | "MEDIUM" | "HIGH";
}

export type MddManualAuditEvent =
  | {
      type: "audit_complete";
      message: string;
      mddContent: string;
      auditorScore: number;
      gaps?: AuditorGapsState | null;
    }
  | {
      type: "audit_started";
      threadId: string;
      question: string;
      n: number;
      total: number;
      mddContent: string;
      auditorScore: number;
      gaps?: AuditorGapsState | null;
    }
  | {
      type: "question";
      question: string;
      n: number;
      total: number;
      mddContent?: string;
    }
  | {
      type: "done";
      mddContent: string;
      message?: string;
      auditorScore?: number;
      gaps?: AuditorGapsState | null;
    }
  | { type: "error"; message: string; code?: string };
