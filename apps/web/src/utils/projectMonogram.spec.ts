import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProjectMonogram } from "./projectMonogram.ts";

describe("getProjectMonogram", () => {
  it("uses first two letters for a single word", () => {
    assert.equal(getProjectMonogram("Forge"), "FO");
  });

  it("uses first letter of first two words", () => {
    assert.equal(getProjectMonogram("openrouter gratuito"), "OG");
    assert.equal(getProjectMonogram("Mi Proyecto"), "MP");
  });

  it("handles empty names", () => {
    assert.equal(getProjectMonogram(""), "?");
    assert.equal(getProjectMonogram("   "), "?");
  });
});
