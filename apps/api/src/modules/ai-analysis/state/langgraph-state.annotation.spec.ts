import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reduceTechStackInsights } from "./langgraph-state.annotation.js";

describe("reduceTechStackInsights", () => {
  it("reemplaza con un array cuando right es array", () => {
    assert.deepEqual(
      reduceTechStackInsights(["viejo"], ["Next.js", "Stripe"]),
      ["Next.js", "Stripe"],
    );
  });

  it("envuelve un string en array (no concatena con left)", () => {
    assert.deepEqual(reduceTechStackInsights(["viejo"], "React"), ["React"]);
  });

  it("ignora left (last write wins)", () => {
    assert.deepEqual(
      reduceTechStackInsights(["a", "b", "c"], ["solo"]),
      ["solo"],
    );
  });
});
