/**
 * Historias de usuario para legacy etapa 1 (AS-IS): backlog de producto sin catálogo §4 API.
 */

import { extractEntities } from "../../engine/conformance.service.js";
import { extractSectionByNumber } from "../../engine/mdd-markdown-parser.js";
import {
  buildMddContextForLegacyAsIsSpec,
  extractEdgeCaseTitles,
  extractModuleBullets,
} from "./legacy-as-is-spec.util.js";

/** Mismo extracto AS-IS que Spec/CU: §1 + dominios §3 + reglas §5 — sin tabla §4 API. */
export const buildMddContextForLegacyAsIsUserStories = buildMddContextForLegacyAsIsSpec;

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

export function buildLegacyAsIsUserStoriesCoverageChecklist(mddMarkdown: string): string {
  const s1 = extractSectionByNumber(mddMarkdown, 1);
  const s5 = extractSectionByNumber(mddMarkdown, 5);
  const entities = [...extractEntities(extractSectionByNumber(mddMarkdown, 3))].sort();
  const edgeCases = extractEdgeCaseTitles(s5);
  const modules = extractModuleBullets(s1);
  const actors = extractActorBullets(s1);

  const lines: string[] = [
    "**CHECKLIST DE COBERTURA OBLIGATORIA (Historias AS-IS — cada ítem → Epic/HU trazable):**",
    "",
  ];

  if (actors.length) {
    lines.push("**Actores (§1 — al menos 1 HU por rol):**");
    for (const a of actors) lines.push(`- [ ] ${a}`);
    lines.push("");
  }

  if (modules.length) {
    lines.push("**Capacidades / módulos (§1 — Epic o HU):**");
    for (const m of modules) lines.push(`- [ ] ${m}`);
    lines.push("");
  }

  if (entities.length) {
    lines.push(
      "**Dominios de datos (§3 — agrupa en Epics/HU de negocio; no 1 HU por endpoint):**",
    );
    for (const e of entities.slice(0, 120)) lines.push(`- [ ] ${e}`);
    if (entities.length > 120) {
      lines.push(`- [ ] … y ${entities.length - 120} entidades adicionales en el extracto §3`);
    }
    lines.push("");
  }

  if (edgeCases.length) {
    lines.push("**Procesos críticos (§5 — AC de HU o alternativas):**");
    for (const e of edgeCases) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  lines.push("**Casos de Uso (si se adjuntan):** cada CU principal → al menos 1 HU referenciada en notas.");
  lines.push("");
  lines.push(
    "**Cierre:** `## Matriz de trazabilidad` — columnas `Origen (capacidad/UAT/actor/CU)` | `Epic` | `US/T` | `Estado`.",
  );

  return lines.length > 2 ? lines.join("\n") : "";
}

export const LEGACY_AS_IS_USER_STORIES_SYSTEM_APPENDIX =
  "\n\n**Modo legacy etapa 1 (Historias de usuario AS-IS — producto en uso):**\n" +
  "- Backlog **what/why** para usuarios de negocio (comercial, operaciones, finanzas, cliente portal). **PROHIBIDO** convertir §4 en catálogo de endpoints: no listes rutas en «Alcance» del Epic ni como AC1–ACn.\n" +
  "- **Criterios de aceptación:** verificables por negocio (resultado observable, Dado/Cuando/Entonces permitido). Rutas HTTP, métodos REST, códigos 201/400 y nombres Strapi **solo** en `### 🛠️ Notas Técnicas (opcional)`.\n" +
  "- **Un solo documento** con H1 `# Historias de Usuario`; Epics → HU bajo cada Epic con plantillas del system prompt. **PROHIBIDO** bloques `### alcance` / `### contexto`, «Sin contenido aplicable» o `---FIN_STORIES---` duplicados.\n" +
  "- **Tareas técnicas:** solo si MDD/Spec declaran explícitamente infra, integración batch o patrón arquitectónico; no inventes deuda técnica (linters, Storybook, refactor) para AS-IS.\n" +
  "- Deriva de MDD §1 AS-IS + Spec + Casos de Uso adjuntos; reglas §5 en AC o riesgos del Epic. Matriz: origen = capacidad, actor, UAT o CU-# — **no** `/ruta`.\n" +
  "- Volumen orientativo: **~20–35 HU**, **~8–12 Epics** cuando el MDD cubre producto completo OOH/ERP.\n";

export function buildLegacyAsIsUserStoriesUserPreamble(checklist: string): string {
  return (
    "Genera el **documento completo de Historias de Usuario** del **sistema actual** (MDD AS-IS).\n" +
    "Describe capacidades que ya están en uso — no un delta MVP ni inventario API.\n\n" +
    (checklist ? checklist + "\n\n" : "") +
    "**Instrucción:** Recorre el checklist. Agrupa por Epic de negocio (campañas, medios, pauta/cotización, precios, finanzas, clientes, operaciones). " +
    "Si hay Casos de Uso, traza cada HU a un CU cuando aplique. No dupliques la misma operación en varias HU solo porque existen endpoints distintos.\n\n"
  );
}
