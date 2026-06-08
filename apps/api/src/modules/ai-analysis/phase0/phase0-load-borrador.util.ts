/**
 * Resuelve el borrador de Paso 0 desde las fuentes persistidas del proyecto.
 *
 * En el Workshop hay dos representaciones:
 * - dbgaContent: markdown visible en pestaña Fase 0 (puede ser DBGA libre o Fase 0 estructurado)
 * - phase0SummaryContent: JSON interno de la entrevista, o Deep Research en pestaña Benchmark
 */

import { isPhase0StructuredMarkdown, markdownToPhase0Document } from "./phase0-from-markdown.js";
import type { Phase0Document } from "./phase0.types.js";

export const MIN_DBGA_AUDIT_CHARS = 150;

export function hasBorradorContent(borrador: Phase0Document): boolean {
  return (
    borrador.proposito.problema.trim().length > 0 ||
    borrador.entidades.length > 0 ||
    borrador.reglasNegocio.length > 0 ||
    borrador.flujos.length > 0 ||
    borrador.roles.length > 0
  );
}

/** Hay documento auditable en el Workshop (DBGA visible o borrador estructurado). */
export function hasAuditDocument(
  dbgaContent: string | null | undefined,
  phase0SummaryContent: string | null | undefined,
): boolean {
  const dbga = dbgaContent?.trim() ?? "";
  if (dbga.length >= MIN_DBGA_AUDIT_CHARS) return true;

  const borrador = loadProjectBorrador(dbgaContent, phase0SummaryContent);
  return hasBorradorContent(borrador);
}

/** dbgaContent con contenido pero sin plantilla Fase 0 canónica (DBGA libre). */
export function isFreeformDbgaContent(dbgaContent: string | null | undefined): boolean {
  const md = dbgaContent?.trim() ?? "";
  if (md.length < MIN_DBGA_AUDIT_CHARS) return false;
  return !isPhase0StructuredMarkdown(md);
}

function parseBorradorJson(raw: string | null | undefined): Phase0Document | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Phase0Document;
    if (parsed?.proposito && Array.isArray(parsed.entidades)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function loadProjectBorrador(
  dbgaContent: string | null | undefined,
  phase0SummaryContent: string | null | undefined,
): Phase0Document {
  const markdown = dbgaContent?.trim() ?? "";
  if (markdown && isPhase0StructuredMarkdown(markdown)) {
    return markdownToPhase0Document(markdown);
  }

  const fromJson = parseBorradorJson(phase0SummaryContent);
  if (fromJson && hasBorradorContent(fromJson)) {
    return fromJson;
  }

  if (markdown) {
    const fromMd = markdownToPhase0Document(markdown);
    if (hasBorradorContent(fromMd)) return fromMd;
  }

  return (
    fromJson ?? {
      proposito: { problema: "", usuarios: [], outOfScope: [] },
      entidades: [],
      reglasNegocio: [],
      flujos: [],
      roles: [],
      integraciones: [],
      edgeCases: [],
      preguntasPendientes: [],
    }
  );
}

/** Fallback sin LLM: infiere borrador mínimo desde DBGA libre para gap analysis. */
export function heuristicBorradorFromFreeformDbga(markdown: string): Phase0Document {
  const doc: Phase0Document = {
    proposito: { problema: "", usuarios: [], outOfScope: [] },
    entidades: [],
    reglasNegocio: [],
    flujos: [],
    roles: [],
    integraciones: [],
    edgeCases: [],
    preguntasPendientes: [],
  };

  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const h1 = lines.find((l) => l.startsWith("# "));
  const h2 = lines.find((l) => l.startsWith("## ") && !l.toLowerCase().includes("índice"));
  const title = (h1 ?? h2 ?? lines[0] ?? "").replace(/^#+\s*/, "").trim();
  doc.proposito.problema = title || markdown.slice(0, 400).trim();

  for (const line of lines) {
    if (line.startsWith("### ")) {
      const name = line.slice(4).trim();
      if (name.length > 1 && !name.toLowerCase().includes("índice")) {
        doc.entidades.push({
          nombre: name,
          descripcion: "Mencionado en el documento DBGA",
          atributosClave: [],
        });
      }
    }
    if (line.startsWith("- ") && line.length > 20) {
      doc.reglasNegocio.push(line.slice(2).trim());
    }
  }

  if (doc.reglasNegocio.length > 8) {
    doc.reglasNegocio = doc.reglasNegocio.slice(0, 8);
  }
  if (doc.entidades.length > 12) {
    doc.entidades = doc.entidades.slice(0, 12);
  }

  return doc;
}
