export const LEGACY_CHANGE_GATE_CODE = "LEGACY_CHANGE_GATE_REQUIRED" as const;

export const LEGACY_CHANGE_GATE_MESSAGE =
  "Etapa 2+: describe el cambio (Modificación), importa handoff del proyecto NEW o ejecuta legacy/start antes de generar MDD o entregables.";

export type LegacyChangeGateInput = {
  ordinal: number;
  legacyChangeState?: {
    description?: string | null;
    filesToModify?: unknown[] | null;
    questions?: unknown[] | null;
  } | null;
  handoffImportedAt?: Date | string | null;
  handoffSnapshot?: { items?: unknown[] | null } | null;
};

export function isLegacyChangeGateSatisfied(input: LegacyChangeGateInput): boolean {
  const ordinal = input.ordinal ?? 1;
  if (ordinal < 2) return true;

  const state = input.legacyChangeState;
  const description = String(state?.description ?? "").trim();
  if (description.length > 0) return true;

  if (input.handoffImportedAt) return true;
  const handoffItems = input.handoffSnapshot?.items;
  if (Array.isArray(handoffItems) && handoffItems.length > 0) return true;

  const files = state?.filesToModify;
  if (Array.isArray(files) && files.length > 0) return true;

  const questions = state?.questions;
  if (Array.isArray(questions) && questions.length > 0) return true;

  return false;
}
