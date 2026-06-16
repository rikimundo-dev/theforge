/**
 * Casos de uso para legacy etapa 1 (AS-IS): flujos de negocio sin volcar §4 API ni section merge.
 */

import { extractEntities } from "../../engine/conformance.service.js";
import { extractSectionByNumber } from "../../engine/mdd-markdown-parser.js";
import {
  buildMddContextForLegacyAsIsSpec,
  extractEdgeCaseTitles,
  extractModuleBullets,
} from "./legacy-as-is-spec.util.js";

/** Mismo extracto AS-IS que Spec: §1 + dominios §3 + reglas §5 — sin tabla §4 API. */
export const buildMddContextForLegacyAsIsUseCases = buildMddContextForLegacyAsIsSpec;

function extractActorBullets(section1: string): string[] {
  const actors: string[] = [];
  const block = section1.match(
    /###\s*(?:Usuarios(?:\s+y\s+casos\s+de\s+uso\s+clave)?|Actores|Roles(?:\s+del\s+sistema)?)\s*\n([\s\S]*?)(?=\n###|\n##\s|\z)/i,
  );
  if (!block?.[1]) return actors;

  for (const line of block[1].split("\n")) {
    const bullet = line.match(/^\s*[-*]\s+(?:\*\*(.+?)\*\*|([^:—\-]+?)(?:\s*[—\-:]|$))/);
    if (bullet) {
      const name = (bullet[1] ?? bullet[2] ?? "").trim();
      if (name.length > 1 && name.length < 80) actors.push(name);
      continue;
    }
    const row = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (row) {
      const cell = row[1].trim();
      if (cell && !/^[-:\s]+$/.test(cell) && !/^(Rol|Actor|Nombre|Usuario)$/i.test(cell)) {
        actors.push(cell);
      }
    }
  }

  return [...new Set(actors)];
}

export function buildLegacyAsIsUseCasesCoverageChecklist(mddMarkdown: string): string {
  const s1 = extractSectionByNumber(mddMarkdown, 1);
  const s5 = extractSectionByNumber(mddMarkdown, 5);
  const entities = [...extractEntities(extractSectionByNumber(mddMarkdown, 3))].sort();
  const edgeCases = extractEdgeCaseTitles(s5);
  const modules = extractModuleBullets(s1);
  const actors = extractActorBullets(s1);

  const lines: string[] = [
    "**CHECKLIST DE COBERTURA OBLIGATORIA (Casos de uso AS-IS — cada ítem → al menos 1 CU numerado):**",
    "",
  ];

  if (actors.length) {
    lines.push("**Actores (§1 — perspectiva del CU):**");
    for (const a of actors) lines.push(`- [ ] ${a}`);
    lines.push("");
  }

  if (modules.length) {
    lines.push("**Capacidades / módulos (§1):**");
    for (const m of modules) lines.push(`- [ ] ${m}`);
    lines.push("");
  }

  if (entities.length) {
    lines.push("**Dominios de datos / catálogos (§3 — agrupa endpoints en CU transaccionales, no 1 CU por ruta):**");
    for (const e of entities.slice(0, 120)) lines.push(`- [ ] ${e}`);
    if (entities.length > 120) {
      lines.push(`- [ ] … y ${entities.length - 120} entidades adicionales listadas en el extracto §3`);
    }
    lines.push("");
  }

  if (edgeCases.length) {
    lines.push("**Procesos críticos (§5 — flujo principal + alternativos):**");
    for (const e of edgeCases) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  lines.push(
    "**Cierre:** tabla `## Matriz de trazabilidad` con columnas Origen | CU-# | Actor | Estado.",
  );

  return lines.length > 2 ? lines.join("\n") : "";
}

export const LEGACY_AS_IS_USE_CASES_SYSTEM_APPENDIX =
  "\n\n**Modo legacy etapa 1 (Casos de uso AS-IS del sistema existente):**\n" +
  "- Flujos en **lenguaje de negocio** (pasos del actor: pantalla, decisión, resultado). **PROHIBIDO** usar rutas HTTP, métodos REST o códigos de estado como pasos 1–3 del flujo principal.\n" +
  "- Endpoints, entidades Strapi y tablas solo en **postcondiciones técnicas** o nota al pie breve — no sustituyen el flujo observable.\n" +
  "- **Un solo documento** con H1 `# Documento de Casos de Uso – [producto del MDD]`; numeración **secuencial** `## Caso de Uso N:` sin reiniciar ni duplicar dominios.\n" +
  "- **PROHIBIDO** fragmentos vacíos, bloques `### dominio_flujos` / `### contexto`, delimitadores `---FIN_USECASES---` duplicados o «Sin contenido aplicable».\n" +
  "- Deriva actores y capacidades del MDD §1 AS-IS; reglas §5 → alternativos/excepciones. El Spec (si se adjunta) es contexto what/why — no inventes journeys que contradigan el MDD.\n" +
  "- Volumen orientativo: MVP/legacy con 12+ capacidades → **~18–30 CU** + matriz de trazabilidad al cierre.\n";

export function buildLegacyAsIsUseCasesUserPreamble(checklist: string): string {
  return (
    "Genera el **documento completo de Casos de Uso** del **sistema actual** documentado en el MDD AS-IS.\n" +
    "No es un delta de cambio ni documentación de API.\n\n" +
    (checklist ? checklist + "\n\n" : "") +
    "**Instrucción:** Recorre el checklist antes de cerrar. Cada actor §1 y cada dominio §3 relevante debe tener al menos un CU. " +
    "Agrupa operaciones API relacionadas en un solo CU transaccional (p. ej. alta compuesta de campaña), no repitas el mismo dominio con otro número.\n\n"
  );
}
