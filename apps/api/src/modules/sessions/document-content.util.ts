/**
 * Utilidades puras para normalizar y limpiar contenido de documentos
 * (respuestas de chat con bloques ---FIN_MDD---, etc.). Sin Nest; `repairMarkdownFences` desde shared-types.
 */

import { repairMarkdownFences } from "@theforge/shared-types/markdown-repair";

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
  if (!text) return "";
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:markdown)?\s*/i, "");
  // Saltar bloque YAML (---\\n...\\n---) — el frontmatter es contenido válido,
  // no un preámbulo que deba cortarse. Buscar # heading solo después del YAML.
  const yamlMatch = cleaned.match(/^---[\s\S]*?\n---\s*\n?/);
  const searchStart = yamlMatch ? yamlMatch[0].length : 0;
  if (searchStart > 0) {
    // Tiene YAML frontmatter — buscar # heading solo en el cuerpo después del YAML
    const body = cleaned.slice(searchStart);
    const bodyHeader = body.match(/^#+|(?<=\n)\s*#+/);
    if (bodyHeader && bodyHeader.index !== undefined && bodyHeader.index > 0) {
      // Hay texto antes del primer heading en el body — cortar ese preámbulo
      cleaned = cleaned.slice(0, searchStart) + body.slice(bodyHeader.index).trimStart();
    }
  } else {
    // Sin YAML — comportamiento original: buscar # en todo el contenido
    const headerMatch = cleaned.match(/^#+|(?<=\n)\s*#+/);
    if (headerMatch && headerMatch.index !== undefined) {
      cleaned = cleaned.slice(headerMatch.index).trim();
    }
  }
  cleaned = cleaned.replace(/^```(?:markdown)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```\s*$/i, "");
  return repairMarkdownFences(cleaned.trim());
}
