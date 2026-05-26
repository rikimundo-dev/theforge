import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  repairGluedSqlTokens,
  repairMetadataCoverTable,
  repairOrphanSqlBlocks,
  repairPastedMarkdown,
  repairTableBoundaries,
  repairTabSeparatedTables,
  repairUnclosedCodeFences,
} from "./repair-pasted-markdown.js";
import { formatDocumentMarkdown } from "./format-document-markdown.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

describe("repairTableBoundaries (tablas espejo)", () => {
  it("separa headings de tablas en fixture OBP", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, "repair-mirror-tables.fixture.txt"), "utf8");
    const out = repairTableBoundaries(raw);
    assert.match(out, /#### Para OBP4MO[^\n]+\n\n\| Tabla espejo/);
    assert.match(out, /\| `paises`[^\n]+\n\n#### Para OBP/);
  });

  it("formatDocumentMarkdown mantiene tablas espejo y estrategia separadas", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, "repair-mirror-tables.fixture.txt"), "utf8");
    const out = formatDocumentMarkdown(raw);
    assert.match(out, /^\| Sistema \|/m);
    assert.match(out, /^\| Tabla espejo \|/m);
    assert.match(out, /\| `paises`[^\n]+\n\n#### Para OBP/);
  });
});

describe("repairPastedMarkdown SQL OBP", () => {
  it("abre segundo bloque sql tras heading Esquema SQL OBP", () => {
    const raw =
      "```sql\nCREATE TABLE paises (id UUID);\n```\n### Esquema SQL para tablas espejo (OBP)\n\n-- Tabla espejo\nCREATE TABLE ubicaciones_obp (id UUID);\n";
    const out = repairPastedMarkdown(raw);
    assert.match(out, /### Esquema SQL[^\n]+\n\n```sql\n-- Tabla espejo/);
    assert.match(out, /CREATE TABLE ubicaciones_obp[\s\S]*```\s*$/);
  });
});
