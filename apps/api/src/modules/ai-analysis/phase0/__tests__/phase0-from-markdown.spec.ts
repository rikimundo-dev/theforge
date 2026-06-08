import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { phase0ToMarkdown } from "../phase0-to-markdown.js";
import { markdownToPhase0Document } from "../phase0-from-markdown.js";
import { loadProjectBorrador, hasAuditDocument, isFreeformDbgaContent } from "../phase0-load-borrador.util.js";
import type { Phase0Document } from "../phase0.types.js";

const sampleDoc = (): Phase0Document => ({
  proposito: {
    problema: "Gestión de costos OOH con márgenes dinámicos",
    usuarios: ["Operaciones", "Admin"],
    outOfScope: ["Facturación fiscal"],
  },
  entidades: [
    { nombre: "Lista de precios", descripcion: "Catálogo", atributosClave: ["moneda"] },
    { nombre: "Costo real", descripcion: "Desde ERP", atributosClave: ["monto"] },
  ],
  reglasNegocio: ["Margen mínimo por lista"],
  flujos: [{ nombre: "Sincronización ERP", pasos: ["Importar", "Validar"] }],
  roles: [{ rol: "Operaciones", permisos: ["Ver costos", "Editar márgenes"] }],
  integraciones: ["Odoo"],
  edgeCases: ["Tipo de cambio no disponible"],
  preguntasPendientes: [],
});

describe("phase0 markdown round-trip", () => {
  it("phase0ToMarkdown → markdownToPhase0Document conserva datos clave", () => {
    const original = sampleDoc();
    const md = phase0ToMarkdown(original);
    const parsed = markdownToPhase0Document(md);

    assert.equal(parsed.proposito.problema, original.proposito.problema);
    assert.deepEqual(parsed.proposito.usuarios, original.proposito.usuarios);
    assert.equal(parsed.entidades.length, 2);
    assert.equal(parsed.entidades[0].nombre, "Lista de precios");
    assert.deepEqual(parsed.reglasNegocio, original.reglasNegocio);
    assert.equal(parsed.flujos[0].pasos.length, 2);
    assert.equal(parsed.roles[0].rol, "Operaciones");
    assert.deepEqual(parsed.integraciones, original.integraciones);
  });
});

describe("loadProjectBorrador", () => {
  it("prioriza dbgaContent (markdown editado) sobre JSON obsoleto", () => {
    const staleJson = sampleDoc();
    staleJson.proposito.problema = "Versión antigua del problema";

    const edited = sampleDoc();
    edited.proposito.problema = "Versión editada en el Workshop";
    const markdown = phase0ToMarkdown(edited);

    const loaded = loadProjectBorrador(
      markdown,
      JSON.stringify(staleJson, null, 2),
    );

    assert.equal(loaded.proposito.problema, "Versión editada en el Workshop");
  });
});

describe("hasAuditDocument", () => {
  it("acepta DBGA libre aunque no haya JSON de entrevista", () => {
    const freeformDbga =
      "# Domain Benchmark & Gap Analysis (DBGA) — Fase 0\n\n## Índice\n1. Funcionalidades\n\n".repeat(
        5,
      );
    assert.equal(isFreeformDbgaContent(freeformDbga), true);
    assert.equal(hasAuditDocument(freeformDbga, null), true);
    assert.equal(hasAuditDocument(freeformDbga, ""), true);
  });

  it("rechaza documento vacío", () => {
    assert.equal(hasAuditDocument("", null), false);
    assert.equal(hasAuditDocument("  ", "{}"), false);
  });
});
