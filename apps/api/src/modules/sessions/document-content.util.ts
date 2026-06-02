/**
 * Utilidades puras para normalizar y limpiar contenido de documentos
 * (respuestas de chat con bloques ---FIN_MDD---, etc.). Sin Nest; `repairMarkdownFences` desde shared-types.
 */

import { ensureDocumentChangelog, formatDocumentMarkdown } from "@theforge/shared-types";

/** Normaliza guiones Unicode a ASCII '-' para que coincidan delimitadores como ---FIN_MDD---. */
export function normalizeDashes(s: string): string {
  return s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

/** Quita etiquetas tipo "**MENSAJE PARA EL CHAT:**" al inicio del mensaje. */
export function stripChatLabel(text: string): string {
  const t = text.trim();
  const removed = t.replace(/^\s*\*{0,2}\s*MENSAJE\s+PARA\s+EL\s+CHAT\s*\*{0,2}\s*:?\s*\n?/i, "");
  return removed.trim();
}

/** Quita intros de chat y vallas de markdown (fences) de documentos generados por IA. */
export function cleanDocumentContent(text: string): string {
  return ensureDocumentChangelog(formatDocumentMarkdown(text));
}
