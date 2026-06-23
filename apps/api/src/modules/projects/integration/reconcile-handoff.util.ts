import {
  buildHandoffImportDescription,
  type IntegrationHandoffItem,
} from "@theforge/shared-types";

export type HandoffStageRow = {
  id: string;
  ordinal: number;
  handoffSnapshot: unknown;
  handoffImportedAt: Date | null;
  linkedNewProjectId: string | null;
  legacyChangeState: unknown;
};

export function stageHasHandoffPayload(stage: HandoffStageRow): boolean {
  if (stage.handoffImportedAt) return true;
  const snap = stage.handoffSnapshot as { items?: unknown[] } | null;
  return Array.isArray(snap?.items) && snap.items.length > 0;
}

/** Description for legacy/start from persisted stage state or handoff snapshot. */
export function resolveHandoffDescriptionForStage(
  stage: HandoffStageRow,
  newProjectName: string,
): string {
  const legacyState = stage.legacyChangeState as { description?: string } | null;
  const fromState = legacyState?.description?.trim();
  if (fromState) return fromState;

  const snap = stage.handoffSnapshot as { items?: IntegrationHandoffItem[] } | null;
  const items = snap?.items?.filter((i) => i?.id && i?.title) ?? [];
  if (!items.length) return "";
  return buildHandoffImportDescription(items, newProjectName);
}
