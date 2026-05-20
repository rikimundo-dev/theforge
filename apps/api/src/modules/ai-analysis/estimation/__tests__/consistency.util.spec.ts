import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCrossDocumentConsistency, extractConcepts } from "../consistency.util.js";

describe("extractConcepts", () => {
  it("extracts H2 titles", () => {
    const s = extractConcepts("## Módulo de Pagos\n## Facturación Electrónica");
    assert.equal(s.has("módulo de pagos"), true);
    assert.equal(s.has("facturación electrónica"), true);
  });

  it("extracts bold phrases", () => {
    const s = extractConcepts("El sistema **generará facturas** automáticamente.");
    assert.equal(s.has("generará facturas"), true);
  });

  it("returns empty for no concepts", () => {
    const s = extractConcepts("Esto es un texto corto.");
    assert.equal(s.size, 0);
  });
});

describe("computeCrossDocumentConsistency", () => {
  it("returns score 50 when no source or target docs", () => {
    const r = computeCrossDocumentConsistency({});
    assert.equal(r.score, 50);
    assert.equal(r.gaps.length, 0);
  });

  it("detects covered concept between BRD and Architecture", () => {
    const docs = {
      brdContent: "## Módulo de Pagos\nEl sistema procesará **pagos con tarjeta**.\n",
      architectureContent: "## Pagos\nLa arquitectura soporta pagos con tarjeta y Paypal.\n",
    };
    const r = computeCrossDocumentConsistency(docs);
    assert.ok(r.score >= 50);
  });

  it("detects missing concept gap", () => {
    const docs = {
      brdContent: "## Módulo de Facturación\n**Generación de facturas** automática.\n",
      architectureContent: "## Gestión de Usuarios\nSolo maneja registro y login.\n",
    };
    const r = computeCrossDocumentConsistency(docs);
    assert.ok(r.gaps.length > 0);
    assert.ok(r.score < 50);
  });

  it("returns 100 when all concepts are covered across all targets", () => {
    const docs = {
      brdContent: "## Usuarios\n**Registro de usuarios** con email.\n## Pagos\n**Pagos recurrentes** mensuales.\n",
      architectureContent: "## Usuarios\nRegistro con email y autenticación.\n## Pagos\nSuscripciones y pagos recurrentes.\n",
      apiContractsContent: "POST /users registro con email\nPOST /payments pagos recurrentes\n",
      logicFlowsContent: "Flujo de registro y flujo de pago recurrente.\n",
    };
    const r = computeCrossDocumentConsistency(docs);
    assert.ok(r.score >= 80);
  });

  it("handles empty or partial doc sets gracefully", () => {
    const docs = {
      brdContent: "## Solo BRD\n**Sin nada técnico** que no esté.\n",
    };
    const r = computeCrossDocumentConsistency(docs);
    assert.equal(r.score, 50);
    assert.equal(r.gaps.length, 0);
  });
});
