import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { LEGACY_CHANGE_GATE_CODE } from "@theforge/shared-types";
import { assertLegacyChangeGate } from "./legacy-change-gate.util.js";

describe("assertLegacyChangeGate", () => {
  it("allows stage 1 without change state", () => {
    assert.doesNotThrow(() => assertLegacyChangeGate({ ordinal: 1 }, {}));
  });

  it("allows stage 2+ with modification description", () => {
    assert.doesNotThrow(() =>
      assertLegacyChangeGate(
        { ordinal: 2, legacyChangeState: { description: "Add discount module" } },
        {},
      ),
    );
  });

  it("allows stage 2+ with handoffImportedAt", () => {
    assert.doesNotThrow(() =>
      assertLegacyChangeGate({ ordinal: 2, handoffImportedAt: new Date().toISOString() }, {}),
    );
  });

  it("throws LEGACY_CHANGE_GATE_REQUIRED for empty stage 2+", () => {
    assert.throws(
      () => assertLegacyChangeGate({ ordinal: 2, legacyChangeState: {} }, {}),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        const body = err.getResponse() as { code?: string };
        assert.equal(body.code, LEGACY_CHANGE_GATE_CODE);
        return true;
      },
    );
  });

  it("falls back to project.legacyFlowState when stage state is empty", () => {
    assert.doesNotThrow(() =>
      assertLegacyChangeGate(
        { ordinal: 3 },
        { legacyFlowState: { description: "From project fallback" } },
      ),
    );
  });
});
