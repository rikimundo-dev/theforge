import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPhase0BorradorJson,
  shouldReplacePhase0SummaryWithBorrador,
} from "./phase0-content.js";

describe("phase0-content", () => {
  it("detecta borrador JSON", () => {
    assert.equal(
      isPhase0BorradorJson('{"proposito":{"problema":"x","usuarios":[],"outOfScope":[]},"entidades":[]}'),
      true,
    );
    assert.equal(isPhase0BorradorJson("# Benchmark\n\n## Gap"), false);
    assert.equal(isPhase0BorradorJson('{"foo":1}'), false);
  });

  it("no pisa Deep Research markdown al actualizar borrador", () => {
    assert.equal(shouldReplacePhase0SummaryWithBorrador(""), true);
    assert.equal(shouldReplacePhase0SummaryWithBorrador(null), true);
    assert.equal(
      shouldReplacePhase0SummaryWithBorrador('{"proposito":{"problema":"a","usuarios":[],"outOfScope":[]}}'),
      true,
    );
    assert.equal(
      shouldReplacePhase0SummaryWithBorrador("# Deep Research\n\n## Competidores"),
      false,
    );
  });
});
