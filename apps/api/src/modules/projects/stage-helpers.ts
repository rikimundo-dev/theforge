import { StageStatus, Status, type Stage, type Estimation } from "@theforge/database";

/** Etapa 1 legacy = línea base AS-IS (documentación del sistema actual, sin delta de cambio). */
export function isLegacyBaselineStage(stage: { ordinal: number } | null | undefined): boolean {
  return (stage?.ordinal ?? 1) === 1;
}

/** Etapa “en foco”: ACTIVE con menor ordinal, o la de menor ordinal si ninguna está ACTIVE. */
export function pickPrimaryStage<T extends { ordinal: number; workflowStatus: StageStatus }>(
  stages: T[],
): T | undefined {
  if (!stages.length) return undefined;
  const active = stages
    .filter((s) => s.workflowStatus === StageStatus.ACTIVE)
    .sort((a, b) => a.ordinal - b.ordinal);
  if (active.length > 0) return active[0];
  return [...stages].sort((a, b) => a.ordinal - b.ordinal)[0];
}

export type StageWithEstimation = Stage & { estimation: Estimation | null };

export type ProjectWithStageDeliverables = {
  mddContent: string | null;
  status: Status;
  precisionScore: number;
  estimation: Estimation | null;
};

export function flattenStageDeliverables(stages: StageWithEstimation[]): ProjectWithStageDeliverables {
  const active = pickPrimaryStage(stages);
  return {
    mddContent: active?.mddContent ?? null,
    status: active?.status ?? Status.ROJO,
    precisionScore: active?.precisionScore ?? 0,
    estimation: active?.estimation ?? null,
  };
}
