import type { MddManualAuditState } from "./mdd-manual-audit.types.js";

const ENVELOPE_VERSION = 1;

export type MddAuditInterviewEnvelope = {
  v: typeof ENVELOPE_VERSION;
  interview: Omit<MddManualAuditState, "threadId"> & { threadId: string };
};

export function serializeMddAuditInterview(state: MddManualAuditState): MddAuditInterviewEnvelope {
  return {
    v: ENVELOPE_VERSION,
    interview: { ...state },
  };
}

export function parseMddAuditInterview(raw: unknown): MddAuditInterviewEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== ENVELOPE_VERSION || !obj.interview || typeof obj.interview !== "object") {
    return null;
  }
  return obj as MddAuditInterviewEnvelope;
}

export function rehydrateMddAuditState(
  envelope: MddAuditInterviewEnvelope,
  threadId: string,
): MddManualAuditState | null {
  const i = envelope.interview;
  if (!i || i.threadId !== threadId) return null;
  return { ...i, threadId: i.threadId };
}
