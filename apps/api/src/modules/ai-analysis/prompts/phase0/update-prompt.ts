/**
 * Carga el prompt de actualización de Fase 0 desde update-prompt.md.
 * Toma la respuesta del usuario y actualiza el borrador + recalcula gaps.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_PATH = join(__dirname, "update-prompt.md");

function load(): string {
  try {
    return readFileSync(PROMPT_PATH, "utf-8").trim();
  } catch {
    return `Eres analista de dominio. Recibes el borrador actual de Fase 0 y la respuesta del usuario.
Actualiza el borrador con la respuesta y recalcula los gaps.
Responde solo con JSON: { "borrador": { ... }, "gaps": [...] }.
Conserva TODO el contenido previo. No borres nada.`;
  }
}

export const UPDATE_PROMPT = load();