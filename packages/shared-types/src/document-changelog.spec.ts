import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendDocumentChangelogEntry,
  bumpDocumentMinorVersion,
  bumpDocumentPatchVersion,
  ensureDocumentChangelog,
  formatDocumentChangelogDate,
  hasDocumentChangelogSection,
  parseLatestDocumentVersion,
} from "./document-changelog.js";

describe("document-changelog", () => {
  it("formatDocumentChangelogDate usa mes en español", () => {
    assert.equal(formatDocumentChangelogDate(new Date(2026, 4, 15)), "Mayo 2026");
  });

  it("ensureDocumentChangelog añade sección 1.0 si falta", () => {
    const out = ensureDocumentChangelog("# DBGA\n\nContenido.", {
      initialDescription: "Creación inicial del DBGA",
      initialDate: "Mayo 2026",
    });
    assert.equal(hasDocumentChangelogSection(out), true);
    assert.match(out, /\| 1\.0 \| Mayo 2026 \| Creación inicial del DBGA \|/);
  });

  it("ensureDocumentChangelog no duplica si ya existe", () => {
    const doc = `# BRD

## Registro de cambios del documento

| Versión | Fecha | Descripción del cambio |
| --- | --- | --- |
| 1.0 | Mayo 2026 | Creación inicial del BRD |
| 1.1 | Mayo 2026 | Añadir RACI |`;
    const out = ensureDocumentChangelog(doc);
    assert.equal(out, doc);
  });

  it("parseLatestDocumentVersion devuelve la mayor versión", () => {
    const doc = `| 2.0 | Julio 2026 | Reestructuración |
| 2.8 | Julio 2026 | Jerarquía precio |`;
    assert.equal(parseLatestDocumentVersion(doc), "2.8");
  });

  it("bumpDocumentPatchVersion incrementa minor", () => {
    assert.equal(bumpDocumentPatchVersion("2.7"), "2.8");
    assert.equal(bumpDocumentPatchVersion("1.0"), "1.1");
  });

  it("bumpDocumentMinorVersion incrementa major", () => {
    assert.equal(bumpDocumentMinorVersion("1.9"), "2.0");
  });

  it("appendDocumentChangelogEntry añade fila preservando historial", () => {
    const doc = ensureDocumentChangelog("# MDD\n\nBody.", {
      initialDescription: "Creación inicial del MDD",
      initialDate: "Mayo 2026",
    });
    const out = appendDocumentChangelogEntry(doc, {
      version: "1.1",
      date: "Mayo 2026",
      description: "Añadir §5 edge cases",
    });
    assert.match(out, /\| 1\.0 \| Mayo 2026 \| Creación inicial del MDD \|/);
    assert.match(out, /\| 1\.1 \| Mayo 2026 \| Añadir §5 edge cases \|/);
  });
});
