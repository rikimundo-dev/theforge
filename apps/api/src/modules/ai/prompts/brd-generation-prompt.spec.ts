import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BRD_SECTION_OUTLINE,
  buildBrdUserPrompt,
} from "./brd-generation-prompt.js";

describe("buildBrdUserPrompt", () => {
  it("incluye plantilla de negocio y delimitadores", () => {
    const prompt = buildBrdUserPrompt({
      mode: "greenfield-from-dbga",
      sourceLabel: "DBGA",
      sourceDocument: "# Benchmark\n",
    });
    assert.match(prompt, /<<<BRD>>>/);
    assert.match(prompt, /Contexto y Objetivos/);
    assert.match(prompt, /Capacidades Funcionales del Producto/);
    assert.match(prompt, /Criterios de aceptación de negocio/);
    assert.match(prompt, /entidades de negocio/i);
    assert.match(prompt, /Pendientes de validación/);
    assert.match(prompt, /Traduce.*técnico/i);
    assert.match(prompt, /--- DBGA ---/);
    assert.doesNotMatch(prompt, /Contratos de datos/);
    assert.doesNotMatch(prompt, /Requisitos no funcionales/);
  });

  it("modo legacy-change incluye baseline", () => {
    const prompt = buildBrdUserPrompt({
      mode: "legacy-change",
      sourceLabel: "DOCUMENTO",
      sourceDocument: "doc",
      baselineBrdBlock: "## Línea base\n",
    });
    assert.match(prompt, /BRD de cambio/);
    assert.match(prompt, /## Línea base/);
  });
});

describe("BRD_SECTION_OUTLINE", () => {
  it("cubre UAT, entidades de negocio y riesgos comerciales", () => {
    assert.match(BRD_SECTION_OUTLINE, /Flujos de negocio críticos/);
    assert.match(BRD_SECTION_OUTLINE, /Requisitos de Experiencia y Operación/);
    assert.match(BRD_SECTION_OUTLINE, /Riesgos de Negocio y Métricas de Éxito/);
    assert.match(BRD_SECTION_OUTLINE, /Límites del Alcance/);
  });
});
