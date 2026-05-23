/**
 * Carga el prompt de arranque de Fase 0 desde arranque-prompt.md.
 * Produce el borrador inicial + gaps a partir del input del usuario.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_PATH = join(__dirname, "arranque-prompt.md");

function load(): string {
  try {
    return readFileSync(PROMPT_PATH, "utf-8").trim();
  } catch {
    return `Eres un analista de dominio experto en especificación de software.
Construye un borrador inicial de Fase 0 y lista de gaps a partir del input del usuario.
Responde solo con JSON válido: { "borrador": { ... }, "gaps": [...] }.

El borrador tiene 8 secciones:
- proposito: { problema, usuarios, outOfScope }
- entidades: [{ nombre, descripcion, atributosClave }]
- reglasNegocio: string[]
- flujos: [{ nombre, pasos }]
- roles: [{ rol, permisos }]
- integraciones: string[]
- edgeCases: string[]
- preguntasPendientes: string[]

Los gaps tienen: seccion, criticidad ("critico"|"importante"|"opcional"), descripcion, razon, sugerenciaPregunta.`;
  }
}

export const ARRANQUE_PROMPT = load();