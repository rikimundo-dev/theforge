/** Comando de chat: formatear el documento del tab activo (sin LLM). */

export const FORMAT_DOCUMENT_COMMAND = {
  slug: "formatear",
  aliases: ["reformatear", "format", "formato"],
  label: "/formatear",
  description: "Formatear documento (fences, tablas, Mermaid)",
} as const;

const SLUG_SET = new Set<string>([
  FORMAT_DOCUMENT_COMMAND.slug,
  ...FORMAT_DOCUMENT_COMMAND.aliases,
]);

/** Mensaje tipo `/formatear` o texto natural corto de reformateo. */
export function isFormatDocumentChatCommand(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (m.startsWith("/")) {
    const slug = m.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
    return SLUG_SET.has(slug);
  }
  return /^(?:re)?formatea(?:r)?\s+(?:el\s+)?documento[.!?\s]*$/i.test(m);
}

export function formatDocumentCommandFilter(input: string): boolean {
  if (!input.startsWith("/")) return false;
  const slug = input.slice(1).toLowerCase();
  if (!slug || slug.includes(" ")) return false;
  return FORMAT_DOCUMENT_COMMAND.slug.startsWith(slug) || SLUG_SET.has(slug);
}
