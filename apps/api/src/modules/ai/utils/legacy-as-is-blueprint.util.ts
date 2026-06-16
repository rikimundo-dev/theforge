/**
 * Blueprint legacy etapa 1 (AS-IS): documento técnico monolítico sin duplicar bloques de section merge.
 */

import { extractEntities } from "../../engine/conformance.service.js";
import { extractSectionByNumber } from "../../engine/mdd-markdown-parser.js";
import { extractEdgeCaseTitles } from "./legacy-as-is-spec.util.js";

function extractApiRouteRows(section4: string, max = 120): string[] {
  const routes: string[] = [];
  for (const line of section4.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || trimmed.includes(":---")) continue;
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const routeCell = cells.find((c) => c.startsWith("/") || /^GET|POST|PUT|PATCH|DELETE/i.test(c));
    if (routeCell) routes.push(routeCell.replace(/\s+/g, " ").slice(0, 120));
    else if (cells[0].startsWith("/")) routes.push(cells[0].slice(0, 120));
    if (routes.length >= max) break;
  }
  return routes;
}

export function buildLegacyAsIsBlueprintCoverageChecklist(mddMarkdown: string): string {
  const s4 = extractSectionByNumber(mddMarkdown, 4);
  const s5 = extractSectionByNumber(mddMarkdown, 5);
  const entities = [...extractEntities(extractSectionByNumber(mddMarkdown, 3))].sort();
  const edgeCases = extractEdgeCaseTitles(s5);
  const routes = extractApiRouteRows(s4);

  const lines: string[] = [
    "**CHECKLIST DE COBERTURA OBLIGATORIA (Blueprint AS-IS — documento único, secciones 1–8):**",
    "",
    "**Estructura obligatoria (una sola vez cada una):**",
    "- [ ] ### 1. Estructura del proyecto y stack",
    "- [ ] ### 2. Persistencia y datos (lista nominal §3 — viñetas o ###, sin repetir esta sección)",
    "- [ ] ### 3. Mapa de contratos API (MDD §4) → módulos",
    "- [ ] ### 4. Componentes transversales (Bitrix, geo, jobs — si §1/§2 aplican)",
    "- [ ] ### 5. Seguridad en despliegue (MDD §6)",
    "- [ ] ### 6. Riesgos y mitigaciones (trazabilidad §5 — una sola sección, sin duplicar)",
    "- [ ] ### 7. Plan de implementación por fases",
    "- [ ] ### 8. Checklist de verificación del Blueprint",
    "- [ ] **Cumplimiento con el MDD** (2–4 ítems verificables)",
    "",
  ];

  if (entities.length) {
    lines.push("**Entidades §3 (cada nombre en ### o viñeta `-`):**");
    for (const e of entities.slice(0, 120)) lines.push(`- [ ] ${e}`);
    if (entities.length > 120) {
      lines.push(`- [ ] … y ${entities.length - 120} entidades adicionales en §3`);
    }
    lines.push("");
  }

  if (routes.length) {
    lines.push("**Rutas §4 (cada custom en tabla §3 del Blueprint; CRUD agrupable con nota):**");
    for (const r of routes.slice(0, 80)) lines.push(`- [ ] ${r}`);
    if (routes.length > 80) lines.push(`- [ ] … y ${routes.length - 80} rutas más en §4 MDD`);
    lines.push("");
  }

  if (edgeCases.length) {
    lines.push("**Procesos / edge cases §5 → sección 6 (riesgos):**");
    for (const e of edgeCases) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  return lines.join("\n");
}

export const LEGACY_AS_IS_BLUEPRINT_SYSTEM_APPENDIX =
  "\n\n**Modo legacy etapa 1 (Blueprint AS-IS — sistema existente):**\n" +
  "- Genera **un solo** documento con H1 `# Blueprint`. **PROHIBIDO** ensamblar bloques `### Bloque contexto_stack`, `modelo_datos`, `api_logica`, `seguridad_infra` o encabezados `> section merge`.\n" +
  "- **PROHIBIDO** repetir `### 2. Persistencia y datos` o `### 6. Riesgos y mitigaciones` más de una vez. **PROHIBIDO** `---FIN_BLUEPRINT---` antes del cierre.\n" +
  "- **Árbol ```text:** una ruta por línea con `├──`, `└──`, `│`; sin líneas sueltas ni paths rotos. Multi-repo real: `desarrollo_imj/erp` = **backend Strapi**; `desarrollo_imj/oohbp2` = **frontend React SPA** (consume API de erp) — **no** describas oohbp2 como segundo backend Strapi.\n" +
  "- Stack y frameworks **solo** desde MDD §2 + contexto TheForge indexado; no inventes Turborepo, NestJS, PrimeReact ni `docker-compose` si no hay evidencia.\n" +
  "- Lista **todas** las entidades §3 (nombres exactos, casing del MDD). Tabla API §4: cubre endpoints custom; CRUD Strapi puede agruparse con fila explicativa si son 100+ rutas repetitivas.\n" +
  "- Cierra con `### 8. Checklist de verificación` (✅/❌) y **Cumplimiento con el MDD**.\n";

export const LEGACY_AS_IS_BLUEPRINT_THEFORGE_APPENDIX =
  "\n\n**CRÍTICO — Proyecto existente (contexto TheForge):** El bloque describe el codebase REAL indexado. " +
  "Describe **únicamente** repos, carpetas y stack evidenciados. No inventes monorepo Turborepo/Nx/NestJS ni directorios ausentes del índice.\n";

export function buildLegacyAsIsBlueprintUserPreamble(checklist: string): string {
  return (
    "Genera el **Blueprint completo** (markdown) del **sistema actual** documentado en el MDD AS-IS.\n" +
    "Documento técnico autocontenido: stack, entidades, mapa API, seguridad §6, riesgos §5, plan por fases.\n\n" +
    (checklist ? checklist + "\n\n" : "") +
    "**Instrucción:** Recorre el checklist antes de cerrar. Unifica persistencia y riesgos en **una** sección cada uno. " +
    "Prioriza exactitud de repos erp vs oohbp2 y formato válido del árbol de directorios.\n\n"
  );
}
