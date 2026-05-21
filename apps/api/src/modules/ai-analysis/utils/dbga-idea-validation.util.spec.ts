import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INSUFFICIENT_DBGA_IDEA_MESSAGE,
  isInsufficientDbgaIdea,
} from "./dbga-idea-validation.util.js";

describe("isInsufficientDbgaIdea", () => {
  it("rechaza saludos cortos", () => {
    assert.equal(isInsufficientDbgaIdea("Hola"), true);
    assert.equal(isInsufficientDbgaIdea("¡Hola! 👋"), true);
    assert.equal(isInsufficientDbgaIdea("hello"), true);
  });

  it("acepta ideas con contexto mínimo", () => {
    assert.equal(
      isInsufficientDbgaIdea("Plataforma de citas médicas para clínicas pequeñas"),
      false,
    );
    assert.equal(isInsufficientDbgaIdea("SaaS de facturación electrónica B2B"), false);
  });

  it("expone mensaje en español para el stream", () => {
    assert.match(INSUFFICIENT_DBGA_IDEA_MESSAGE, /Benchmark/i);
    assert.match(INSUFFICIENT_DBGA_IDEA_MESSAGE, /saludo/i);
  });
});
