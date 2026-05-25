/**
 * Normaliza markdown de documentos del Workshop (fences, tablas, Mermaid).
 * Sin LLM — solo limpieza estructural tras pegar contenido mal formateado.
 */

import { repairMarkdownFences } from "./markdown-repair.js";
import { normalizeAllTables } from "./markdown-table.js";
import { normalizeMermaid } from "./mermaid.js";
import { splitEmbeddedMddFromDbga } from "./dbga-document-structure.js";
import { repairPastedMarkdown } from "./repair-pasted-markdown.js";

export function formatDocumentMarkdown(text: string): string {
  if (!text) return "";
  let cleaned = repairPastedMarkdown(text).trim();
  cleaned = cleaned.replace(/^```(?:markdown)?\s*/i, "");
  const yamlMatch = cleaned.match(/^---[\s\S]*?\n---\s*\n?/);
  const searchStart = yamlMatch ? yamlMatch[0].length : 0;
  if (searchStart > 0) {
    const body = cleaned.slice(searchStart);
    const bodyHeader = body.match(/^#+|(?<=\n)\s*#+/);
    if (bodyHeader && bodyHeader.index !== undefined && bodyHeader.index > 0) {
      cleaned = cleaned.slice(0, searchStart) + body.slice(bodyHeader.index).trimStart();
    }
  } else {
    const headerMatch = cleaned.match(/^#+|(?<=\n)\s*#+/);
    if (headerMatch && headerMatch.index !== undefined) {
      cleaned = cleaned.slice(headerMatch.index).trim();
    }
  }
  cleaned = cleaned.replace(/^```(?:markdown)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```\s*$/i, "");
  cleaned = repairMarkdownFences(cleaned.trim());
  cleaned = normalizeAllTables(cleaned);
  cleaned = normalizeMermaid(cleaned);
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
