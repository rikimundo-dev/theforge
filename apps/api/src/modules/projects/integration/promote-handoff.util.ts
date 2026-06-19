import type { IntegrationHandoffItem, IntegrationTraceRow } from "@theforge/shared-types";

const PROMOTABLE_TRACE_STATUSES = new Set(["SENT"]);

export function selectPromotableHandoffItemIds(
  traces: Pick<IntegrationTraceRow, "newLegId" | "legacyStageId" | "status">[],
  requestedItemIds?: string[],
): string[] {
  const sent = traces.filter((t) => PROMOTABLE_TRACE_STATUSES.has(t.status));
  const unassigned = sent.filter((t) => !t.legacyStageId);
  const pool = unassigned.length > 0 ? unassigned : sent;
  let ids = pool.map((t) => t.newLegId);
  if (requestedItemIds?.length) {
    const allowed = new Set(requestedItemIds);
    ids = ids.filter((id) => allowed.has(id));
  }
  return [...new Set(ids)];
}

export function pickHandoffItemsForPromotion(
  handoffItems: IntegrationHandoffItem[],
  itemIds: string[],
): IntegrationHandoffItem[] {
  const idSet = new Set(itemIds);
  return handoffItems.filter(
    (item) => idSet.has(item.id) && (item.status === "sent" || item.status === "accepted"),
  );
}
