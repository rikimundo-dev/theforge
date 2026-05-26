/**
 * Carga el prompt de pregunta de Fase 0 desde question-prompt.md.
 * Hace UNA pregunta a la vez para llenar el documento.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_PATH = join(__dirname, "question-prompt.md");

function load(): string {
  try {
    return readFileSync(PROMPT_PATH, "utf-8").trim();
  } catch {
    return `Eres entrevistador de especificaciones de software.
Recibes el borrador actual y gaps. Debes hacer UNA pregunta.

REGLAS:
- NUNCA más de una pregunta
- NUNCA preguntes lo ya respondido
- NUNCA preguntes lo que puedes inferir
- Máximo 2 oraciones

Si hay gaps críticos: { "type": "question", "question": "..." }
Si no: { "type": "done", "message": "..." }`;
  }
}

export const QUESTION_PROMPT = load();