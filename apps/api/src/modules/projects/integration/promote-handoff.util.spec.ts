import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLegacyChangeGateSatisfied,
  promoteHandoffToStageBodySchema,
} from "@theforge/shared-types";
import {
  pickHandoffItemsForPromotion,
  selectPromotableHandoffItemIds,
} from "./promote-handoff.util.js";

describe("promoteHandoffToStageBodySchema", () => {
  it("accepts empty body with defaults", () => {
    const parsed = promoteHandoffToStageBodySchema.parse({});
    assert.equal(parsed.activate, true);
    assert.equal(parsed.itemIds, undefined);
  });

  it("rejects invalid NEW-LEG ids", () => {
    assert.throws(() =>
      promoteHandoffToStageBodySchema.parse({ itemIds: ["LEG-01"] }),
    );
  });
});

describe("selectPromotableHandoffItemIds", () => {
  const traces = [
    { newLegId: "NEW-LEG-01", legacyStageId: null, status: "SENT" },
    { newLegId: "NEW-LEG-02", legacyStageId: "stage-a", status: "SENT" },
    { newLegId: "NEW-LEG-03", legacyStageId: null, status: "DRAFT" },
  ];

  it("prefers SENT traces without legacyStageId", () => {
    assert.deepEqual(selectPromotableHandoffItemIds(traces), ["NEW-LEG-01"]);
  });

  it("falls back to all SENT when every trace has a stage", () => {
    const assigned = traces.map((t) => ({ ...t, legacyStageId: "stage-a" as string | null }));
    assert.deepEqual(selectPromotableHandoffItemIds(assigned), ["NEW-LEG-01", "NEW-LEG-02"]);
  });
});

describe("pickHandoffItemsForPromotion", () => {
  it("keeps sent/accepted items only", () => {
    const items = pickHandoffItemsForPromotion(
      [
        { id: "NEW-LEG-01", title: "A", description: "d", status: "sent" },
        { id: "NEW-LEG-02", title: "B", description: "d", status: "draft" },
      ],
      ["NEW-LEG-01", "NEW-LEG-02"],
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, "NEW-LEG-01");
  });
});

describe("gate after promote payload", () => {
  it("satisfies legacy change gate for stage 2+ with handoffImportedAt", () => {
    assert.equal(
      isLegacyChangeGateSatisfied({
        ordinal: 2,
        handoffImportedAt: new Date().toISOString(),
      }),
      true,
    );
  });
});
