import { DOCUMENT_CHANGELOG_LLM_INSTRUCTIONS } from "@theforge/shared-types";

/** Añade instrucciones de changelog al system prompt si aún no están presentes. */
export function withDocumentChangelogInstructions(prompt: string): string {
  const base = prompt.trim();
  if (/Registro de cambios del documento/i.test(base)) return base;
  return `${base}\n\n${DOCUMENT_CHANGELOG_LLM_INSTRUCTIONS}`;
}

/** Instrucción breve para chat con delimitador ---FIN_*--- */
export const DOCUMENT_CHANGELOG_CHAT_INSTRUCTION =
  "**Registro de cambios:** al actualizar el documento, conserva la sección `## Registro de cambios del documento` al final (tabla Versión | Fecha | Descripción) y **añade una fila nueva** con versión incrementada describiendo el cambio. No elimines filas históricas.";
