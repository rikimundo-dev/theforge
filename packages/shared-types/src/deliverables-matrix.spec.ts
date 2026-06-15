import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planLegacyDeliverablesToGenerate } from "./deliverables-matrix.js";

describe("planLegacyDeliverablesToGenerate", () => {
  it("omite solo mdd_canonical cuando ya hay MDD; regenera el resto", () => {
    const planned = planLegacyDeliverablesToGenerate({
      complexity: "HIGH",
      hasMddContent: true,
    });
    assert.doesNotMatch(planned.join(","), /mdd_canonical/);
    assert.match(planned.join(","), /blueprint/);
    assert.match(planned.join(","), /spec/);
  });
});
