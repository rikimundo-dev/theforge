import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLegacyHandoffAutoLegacyStartEnabled } from "./legacy-handoff-auto-start.util.js";

describe("legacy-handoff-auto-start.util", () => {
  it("enabled by default", () => {
    const prev = process.env.LEGACY_HANDOFF_AUTO_LEGACY_START;
    delete process.env.LEGACY_HANDOFF_AUTO_LEGACY_START;
    assert.equal(isLegacyHandoffAutoLegacyStartEnabled(), true);
    process.env.LEGACY_HANDOFF_AUTO_LEGACY_START = "0";
    assert.equal(isLegacyHandoffAutoLegacyStartEnabled(), false);
    if (prev === undefined) delete process.env.LEGACY_HANDOFF_AUTO_LEGACY_START;
    else process.env.LEGACY_HANDOFF_AUTO_LEGACY_START = prev;
  });
});
