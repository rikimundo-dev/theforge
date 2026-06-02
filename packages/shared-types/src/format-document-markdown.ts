/**
 * Normaliza markdown de documentos del Workshop (fences, tablas, Mermaid).
 * Sin LLM — solo limpieza estructural tras pegar contenido mal formateado.
 */

import { repairMarkdownFences } from "./markdown-repair.js";
import { normalizeAllTables } from "./markdown-table.js";
import { normalizeMermaidInDocument } from "./mermaid.js";
import { splitEmbeddedMddFromDbga } from "./dbga-document-structure.js";
import {
  repairPastedMarkdown,
  repairStrayCodeFences,
  repairTableBoundaries,
} from "./repair-pasted-markdown.js";

export function formatDocumentMarkdown(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  const hadOuterMarkdownFence =
    /^```(?:markdown|md)?\s*\n/i.test(trimmed) && /\n```\s*$/i.test(trimmed);

  let cleaned = repairPastedMarkdown(trimmed);
  if (hadOuterMarkdownFence) {
    cleaned = cleaned
      .replace(/^```(?:markdown|md)?\s*\n/i, "")
      .replace(/\n```\s*$/i, "")
      .trim();
  }
  const yamlMatch = cleaned.match(/^---[\s\S]*?\n---\s*\n?/);
  const searchStart = yamlMatch ? yamlMatch[0].length : 0;
  if (searchStart > 0) {
    const body = cleaned.slice(searchStart);
    const bodyHeader = body.match(/^#{1,2}\s+/m);
    if (bodyHeader && bodyHeader.index !== undefined && bodyHeader.index > 0) {
      cleaned = cleaned.slice(0, searchStart) + body.slice(bodyHeader.index).trimStart();
    }
  } else {
    // Solo recorta preámbulo antes del primer H1/H2; no ante ### (contratos API, Beneficios, etc.)
    const headerMatch = cleaned.match(/^#{1,2}\s+/m);
    if (headerMatch?.index != null && headerMatch.index > 0) {
      cleaned = cleaned.slice(headerMatch.index).trim();
    }
  }
  cleaned = repairMarkdownFences(cleaned.trim());
  cleaned = normalizeAllTables(cleaned);
  cleaned = repairTableBoundaries(cleaned);
  cleaned = repairStrayCodeFences(cleaned);
  cleaned = normalizeMermaidInDocument(cleaned);
  return cleaned;
}

/** Formatea solo el cuerpo DBGA/Research; separa MDD embebido al final. */
export function formatDbgaDocument(raw: string): {
  formatted: string;
  strippedMdd: string | null;
} {
  const { dbgaBody, embeddedMdd } = splitEmbeddedMddFromDbga(raw);
  return {
    formatted: formatDocumentMarkdown(dbgaBody),
    strippedMdd: embeddedMdd,
  };
}
