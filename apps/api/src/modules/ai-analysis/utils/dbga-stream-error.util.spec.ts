import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDbgaStreamError } from "./dbga-stream-error.util.js";

describe("formatDbgaStreamError", () => {
  it("devuelve mensaje en español cuando el error menciona Recursion limit", () => {
    const msg = formatDbgaStreamError(
      new Error("Recursion limit of 100 reached"),
    );
    assert.match(msg, /competidores directos/i);
    assert.match(msg, /B2B/i);
    assert.doesNotMatch(msg, /Recursion limit/i);
  });

  it("devuelve mensaje en español para GRAPH_RECURSION", () => {
    const msg = formatDbgaStreamError(new Error("GRAPH_RECURSION_LIMIT"));
    assert.match(msg, /competidores directos/i);
  });

  it("pasa el mensaje original para otros errores", () => {
    assert.equal(
      formatDbgaStreamError(new Error("timeout de red")),
      "timeout de red",
    );
    assert.equal(formatDbgaStreamError("fallo genérico"), "Error en el análisis");
  });
});
