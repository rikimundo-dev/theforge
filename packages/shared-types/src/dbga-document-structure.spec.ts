import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitEmbeddedMddFromDbga } from "./dbga-document-structure.js";
import { formatDbgaDocument } from "./format-document-markdown.js";
import { repairMetadataCoverTable, repairPastedMarkdown } from "./repair-pasted-markdown.js";

describe("splitEmbeddedMddFromDbga", () => {
  it("corta antes del marcador [Contenido actual del MDD]", () => {
    const raw =
      "# Research Report\n\nHallazgo.\n\n[Contenido actual del MDD del proyecto]\nMaster Design Document — X\n1. Contexto";
    const { dbgaBody, embeddedMdd } = splitEmbeddedMddFromDbga(raw);
    assert.match(dbgaBody, /Research Report/);
    assert.doesNotMatch(dbgaBody, /Master Design Document/);
    assert.match(embeddedMdd ?? "", /Master Design Document/);
  });
});

describe("formatDbgaDocument", () => {
  it("no incluye el MDD embebido en formatted", () => {
    const raw = "# DBGA\n\n## A\n\n[Contenido actual del MDD]\n\n## MDD section";
    const { formatted, strippedMdd } = formatDbgaDocument(raw);
    assert.match(formatted, /DBGA/);
    assert.doesNotMatch(formatted, /MDD section/);
    assert.ok(strippedMdd && strippedMdd.includes("MDD section"));
  });
});

describe("repairMetadataCoverTable", () => {
  it("repara tabla portada | | |", () => {
    const raw =
      "# Research Report — OBP\n| | |\n|---|---|\n| **Proyecto** | OBP |\n| **Fase** | Discovery |\n";
    const out = repairMetadataCoverTable(raw);
    assert.match(out, /\| Campo \| Valor \|/);
    assert.match(out, /\| \*\*Proyecto\*\* \| OBP \|/);
  });
});

describe("repairPastedMarkdown (fragmento OBP)", () => {
  it("promueve Módulo N — a heading y separa hallazgos", () => {
    const raw = "Texto\nMódulo 01 — Catálogo\n| A | B |\n🔴 **Crítico**";
    const out = repairPastedMarkdown(raw);
    assert.match(out, /### Módulo 01 — Catálogo/);
    assert.match(out, /\n\n🔴/);
  });
});
