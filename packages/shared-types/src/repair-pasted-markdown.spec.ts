import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  repairGluedSqlTokens,
  repairMetadataCoverTable,
  repairOrphanSqlBlocks,
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

  it("repara NOT_NULL_REFERENCES y ON_tabla", () => {
    const raw =
      "pais_id UUID NOT NULL_REFERENCES_paises(id);\nCREATE INDEX idx_medios_ciudad_ON_medios(ciudad_id);";
    const out = repairGluedSqlTokens(raw);
    assert.match(out, /NOT NULL REFERENCES/);
    assert.match(out, /ON medios\(/);
  });
});

describe("repairOrphanSqlBlocks", () => {
  it("envuelve CREATE TABLE suelto", () => {
    const raw = "Intro\n\nCREATE TABLE foo (\n  id UUID\n);\n\n## Fin";
    const out = repairOrphanSqlBlocks(raw);
    assert.match(out, /```sql\nCREATE TABLE foo/);
    assert.match(out, /```\n\n## Fin/);
  });
});

describe("repairMetadataCoverTable", () => {
  it("inserta encabezados Campo/Valor", () => {
    const raw = "# T\n| | |\n|---|---|\n| **X** | Y |\n";
    const out = repairMetadataCoverTable(raw);
    assert.match(out, /\| Campo \| Valor \|/);
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
