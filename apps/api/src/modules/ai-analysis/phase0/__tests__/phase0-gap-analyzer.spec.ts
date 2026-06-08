import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeGaps, buildQuestionPlan } from "../phase0-gap-analyzer.js";
import type { Phase0Document } from "../phase0.types.js";

const emptyBorrador = (): Phase0Document => ({
  proposito: { problema: "", usuarios: [], outOfScope: [] },
  entidades: [],
  reglasNegocio: [],
  flujos: [],
  roles: [],
  integraciones: [],
  edgeCases: [],
  preguntasPendientes: [],
});

describe("buildQuestionPlan", () => {
  it("incluye múltiples gaps críticos de distinta sección (no dedupe agresivo)", () => {
    const gaps = analyzeGaps(emptyBorrador());
    const plan = buildQuestionPlan(gaps, 5);
    assert.ok(plan.length >= 4, `expected >=4 planned questions, got ${plan.length}`);
    const secciones = new Set(plan.map((g) => g.seccion));
    assert.ok(secciones.has("proposito"));
    assert.ok(secciones.has("entidades"));
    assert.ok(secciones.has("reglasNegocio"));
    assert.ok(secciones.has("roles"));
  });

  it("limita el plan al máximo indicado", () => {
    const gaps = analyzeGaps(emptyBorrador());
    assert.equal(buildQuestionPlan(gaps, 3).length, 3);
  });
});
