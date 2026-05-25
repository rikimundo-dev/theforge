import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  repairGluedSqlTokens,
  repairTabSeparatedTables,
  repairUnclosedCodeFences,
} from "./repair-pasted-markdown.js";

describe("repairGluedSqlTokens", () => {
  it("separa tipos SQL pegados con guion bajo", () => {
    const raw = "nombre_VARCHAR(255) NOT NULL,\n  id UUID PRIMARY KEY DEFAULT_gen_random_uuid()";
    const out = repairGluedSqlTokens(raw);
    assert.match(out, /nombre VARCHAR/);
    assert.match(out, /DEFAULT gen_random_uuid\(\)/);
  });
});

describe("repairTabSeparatedTables", () => {
  it("convierte filas con tab a tabla GFM", () => {
    const raw = "Riesgo\tMitigación\nDesincronización\tWebhook diario";
    const out = repairTabSeparatedTables(raw);
    assert.match(out, /^\| Riesgo \| Mitigación \|/m);
    assert.match(out, /\| --- \|/);
  });
});

describe("repairUnclosedCodeFences", () => {
  it("cierra bloque abierto antes de un heading", () => {
    const raw = "```sql\nCREATE TABLE foo (\n  id UUID\n);\n\n## Siguiente sección";
    const out = repairUnclosedCodeFences(raw);
    assert.match(out, /```\n## Siguiente sección/);
  });
});
