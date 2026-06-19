import { BadRequestException } from "@nestjs/common";
import {
  isLegacyChangeGateSatisfied,
  LEGACY_CHANGE_GATE_CODE,
  LEGACY_CHANGE_GATE_MESSAGE,
  type LegacyChangeGateInput,
} from "@theforge/shared-types";

type LegacyChangeGateStage = {
  ordinal?: number;
  legacyChangeState?: unknown;
  handoffImportedAt?: Date | string | null;
  handoffSnapshot?: unknown;
};

function readLegacyChangeStateFromUnknown(raw: unknown): LegacyChangeGateInput["legacyChangeState"] {
  if (raw == null || typeof raw !== "object") return null;
  return raw as LegacyChangeGateInput["legacyChangeState"];
}

function readHandoffSnapshot(raw: unknown): LegacyChangeGateInput["handoffSnapshot"] {
  if (raw == null || typeof raw !== "object") return null;
  return raw as LegacyChangeGateInput["handoffSnapshot"];
}

/**
 * Blocks legacy MDD / deliverables generation on stage 2+ until change intent is captured
 * (modification description, handoff import, or legacy/start).
 */
export function assertLegacyChangeGate(
  stage: LegacyChangeGateStage | null | undefined,
  project?: { legacyFlowState?: unknown } | null,
): void {
  const ordinal = stage?.ordinal ?? 1;
  if (ordinal < 2) return;

  const legacyChangeState =
    readLegacyChangeStateFromUnknown(stage?.legacyChangeState) ??
    readLegacyChangeStateFromUnknown(project?.legacyFlowState);

  const satisfied = isLegacyChangeGateSatisfied({
    ordinal,
    legacyChangeState,
    handoffImportedAt: stage?.handoffImportedAt ?? null,
    handoffSnapshot: readHandoffSnapshot(stage?.handoffSnapshot),
  });

  if (satisfied) return;

  throw new BadRequestException({
    statusCode: 400,
    message: LEGACY_CHANGE_GATE_MESSAGE,
    error: "Bad Request",
    code: LEGACY_CHANGE_GATE_CODE,
  });
}
