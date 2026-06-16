/**
 * Spec what/why para legacy etapa 1 (AS-IS): contexto de negocio sin volcar §4 API al Spec.
 */

import { extractEntities } from "../../engine/conformance.service.js";
import { extractSectionByNumber } from "../../engine/mdd-markdown-parser.js";
import { isLegacyBaselineFullDetailEnabled } from "./legacy-baseline-detail.util.js";
import { isLegacyBaselineStage } from "../../projects/stage-helpers.js";

/** MDD etapa 1 AS-IS (inyección + §1 con bloque AS-IS). */
export function isLegacyAsIsMddDocument(mddMarkdown: string): boolean {
  const md = (mddMarkdown ?? "").trim();
  if (!md) return false;
  if (/###\s+AS-IS\s*\(Estado\s+Actual\)/i.test(md)) return true;
  const head = md.slice(0, 6000);
  return (
    /##\s*1\.\s*Contexto/i.test(md) &&
    /tal como existe hoy|sistema actual|Estado Actual/i.test(head) &&
    !/\bmodificar el sistema\b|\bdelta de cambio\b|\bMVP pendiente\b/i.test(head)
  );
}

/**
 * Etapa 1 full-detail: por ordinal de stage o heurística sobre el MDD AS-IS persistido.
 */
export function resolveLegacyBaselineStageFlag(
  gateStage: { ordinal: number } | null | undefined,
  mddContent: string,
): boolean {
  if (!isLegacyBaselineFullDetailEnabled()) return isLegacyBaselineStage(gateStage);
  if (isLegacyBaselineStage(gateStage)) return true;
  return isLegacyAsIsMddDocument(mddContent);
}

export function extractEdgeCaseTitles(section5: string): string[] {
  const block = section5.match(
    /###\s*Reglas y edge cases\s*\n([\s\S]*?)(?=\n###\s|\n##\s*\d+\.|\n_Edge cases|\z)/i,
  );
  if (!block?.[1]) return [];
  const titles: string[] = [];
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*-\s*\*\*(.+?)\*\*/);
    if (m?.[1]) titles.push(m[1].trim());
  }
  return titles;
}

export function extractModuleBullets(section1: string): string[] {
  const items: string[] = [];
  for (const line of section1.split("\n")) {
    const m = line.match(/^\s*-\s*\*\*(.+?)\*\*/);
    if (m?.[1]) items.push(m[1].trim());
  }
  return items;
}

/**
 * Insumo Spec AS-IS: §1 completo + dominios (entidades §3) + reglas §5 — **sin** tabla §4 API.
 */
export function buildMddContextForLegacyAsIsSpec(mddMarkdown: string): string {
  const md = (mddMarkdown ?? "").trim();
  if (!md) return "";

  const s1 = extractSectionByNumber(md, 1).trim();
  const s3 = extractSectionByNumber(md, 3).trim();
  const s5 = extractSectionByNumber(md, 5).trim();
  const entities = [...extractEntities(s3)].sort();
  const edgeCases = extractEdgeCaseTitles(s5);
  const modules = extractModuleBullets(s1);

  const parts: string[] = [];
  if (s1) parts.push("## Extracto MDD §1 Contexto (AS-IS)\n\n" + s1);

  if (entities.length) {
    parts.push(
      "## Dominios de negocio (desde entidades MDD §3 — traducir a capacidades en el Spec)\n\n" +
        entities.map((e) => `- ${e}`).join("\n"),
    );
  }

  if (modules.length) {
    parts.push(
      "## Módulos / capacidades citadas en §1\n\n" + modules.map((m) => `- ${m}`).join("\n"),
    );
  }

  if (edgeCases.length) {
    parts.push(
      "## Reglas y procesos críticos (MDD §5 — convertir a criterios UAT en lenguaje comercial)\n\n" +
        edgeCases.map((t) => `- ${t}`).join("\n"),
    );
  }

  return parts.join("\n\n---\n\n");
}

export function buildLegacyAsIsSpecCoverageChecklist(mddMarkdown: string): string {
  const ctx = buildMddContextForLegacyAsIsSpec(mddMarkdown);
  if (!ctx) return "";

  const entities = [...extractEntities(extractSectionByNumber(mddMarkdown, 3))].sort();
  const edgeCases = extractEdgeCaseTitles(extractSectionByNumber(mddMarkdown, 5));
  const modules = extractModuleBullets(extractSectionByNumber(mddMarkdown, 1));

  const lines: string[] = [
    "**CHECKLIST DE COBERTURA OBLIGATORIA (Spec AS-IS — cada ítem → objetivo, alcance, journey o criterio UAT):**",
    "",
  ];

  if (modules.length) {
    lines.push("**Capacidades / módulos (§1):**");
    for (const m of modules) lines.push(`- [ ] ${m}`);
    lines.push("");
  }

  if (entities.length) {
    lines.push("**Dominios de datos / catálogos (§3 → §3 Capacidades Funcionales del Spec):**");
    for (const e of entities.slice(0, 120)) lines.push(`- [ ] ${e}`);
    if (entities.length > 120) {
      lines.push(`- [ ] … y ${entities.length - 120} entidades adicionales listadas en el extracto §3`);
    }
    lines.push("");
  }

  if (edgeCases.length) {
    lines.push("**Procesos críticos (§5 → criterios de éxito / UAT):**");
    for (const e of edgeCases) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  return lines.length > 2 ? lines.join("\n") : "";
}

export const LEGACY_AS_IS_SPEC_SYSTEM_APPENDIX =
  "\n\n**Modo legacy etapa 1 (Spec AS-IS del sistema existente):**\n" +
  "- Documento **what/why** en lenguaje de negocio; **PROHIBIDO** rutas HTTP, métodos REST, nombres de endpoints, SQL, content-types Strapi y paths de código.\n" +
  "- **PROHIBIDO** responder con fragmentos, bloques vacíos o «Sin contenido aplicable»; entrega el **Spec completo** con H1 `# Spec`.\n" +
  "- Objetivos y alcance desde §1 AS-IS; **§3 Capacidades Funcionales**: subsección `###` por **cada dominio** (campanias, medios, pauta, cotizador, facturación, proveedores, urbanos, reservaciones, etc.) — traduce entidades §3 a procesos comerciales.\n" +
  "- User journeys: **7–15** flujos en lenguaje comercial (roles IMJ: comercial, operaciones, trade, supervisor, admin), sin citar URLs.\n" +
  "- Criterios de éxito: derivados de reglas §5 en formato verificable por negocio (Dado/Cuando/Entonces permitido).\n" +
  "- No uses bloques ```dockerfile ni delimitadores `---FIN_SPEC---` salvo que el system prompt los exija explícitamente.\n";

export function buildLegacyAsIsSpecUserPreamble(checklist: string): string {
  return (
    "Genera el **documento Spec completo** (SDD what/why) del **sistema actual** documentado en el MDD AS-IS.\n" +
    "No es un delta de cambio ni un MVP futuro.\n\n" +
    (checklist ? checklist + "\n\n" : "") +
    "**Instrucción:** Recorre el checklist; cada dominio de §3 debe tener subsección en Capacidades Funcionales. " +
    "Traduce integraciones (Bitrix, Todoist, Teams) como dependencias de negocio, no como APIs.\n\n"
  );
}
