import { extractEntities } from "../../engine/conformance.service.js";
import {
  isLegacyBaselineFullDetailEnabled,
  readLegacyBaselineMddDeliverableBudget,
} from "./legacy-baseline-detail.util.js";

/** Presupuesto de caracteres del MDD para entregables derivados de la Constitución. */
export const MDD_DELIVERABLE_BUDGET = 50_000;

export interface MddDeliverableContextOptions {
  legacyBaselineStage?: boolean;
}

function resolveMddDeliverableBudget(options?: MddDeliverableContextOptions): number {
  if (options?.legacyBaselineStage && isLegacyBaselineFullDetailEnabled()) {
    return readLegacyBaselineMddDeliverableBudget();
  }
  return MDD_DELIVERABLE_BUDGET;
}

/** @deprecated Usar MDD_DELIVERABLE_BUDGET */
export const USER_STORIES_MDD_BUDGET = MDD_DELIVERABLE_BUDGET;

export type MddDeliverableKind =
  | "user-stories"
  | "use-cases"
  | "blueprint"
  | "api-contracts"
  | "logic-flows"
  | "architecture"
  | "tasks"
  | "infra"
  | "spec"
  | "agent-governance";

/** Extrae el cuerpo de la primera sección cuyo título coincide con pattern (hasta el siguiente ##). */
function extractSection(md: string, pattern: RegExp): string {
  const content = (md || "").trim();
  const m = content.match(pattern);
  if (!m) return "";
  const start = m.index ?? 0;
  const afterTitle = start + (m[0]?.length ?? 0);
  const rest = content.slice(afterTitle);
  const nextH2 = rest.match(/\n##\s/m);
  const end = nextH2 ? nextH2.index! + 1 : rest.length;
  return rest.slice(0, end).trim();
}

/** Extrae viñetas `- …` tras un encabezado que coincide con `headingPattern`. */
function extractBulletsAfterHeading(md: string, headingPattern: RegExp, maxItems = 24): string[] {
  const section = extractSection(md, headingPattern);
  if (!section) return [];
  const items: string[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*|^\s*[-*]\s+(.+)$/);
    if (!m) continue;
    const text = (m[1] ?? m[2] ?? "").trim();
    if (text.length > 3) items.push(text);
    if (items.length >= maxItems) break;
  }
  return items;
}

/** Extrae ítems numerados `1. …` tras un encabezado. */
function extractNumberedAfterHeading(md: string, headingPattern: RegExp, maxItems = 12): string[] {
  const section = extractSection(md, headingPattern);
  if (!section) return [];
  const items: string[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*\d+\.\s+\*\*(.+?)\*\*|^\s*\d+\.\s+(.+)$/);
    if (!m) continue;
    const text = (m[1] ?? m[2] ?? "").trim();
    if (text.length > 3) items.push(text);
    if (items.length >= maxItems) break;
  }
  return items;
}

/** Resumen de filas de la tabla de endpoints en §4. */
function extractApiRouteSummary(md: string, maxRoutes = 80): string[] {
  const section4 = extractSection(
    md,
    /^##\s*(?:4\.\s*)?(?:contratos\s+de\s+api|api\s+contracts|endpoints)/im,
  );
  if (!section4) return [];
  const routes: string[] = [];
  for (const line of section4.split("\n")) {
    const m = line.match(/\|\s*`?(GET|POST|PUT|PATCH|DELETE)`?\s*\|\s*`?(\/api\/[^`|]+)`?/i);
    if (!m) continue;
    routes.push(`${m[1].toUpperCase()} ${m[2].trim()}`);
    if (routes.length >= maxRoutes) break;
  }
  return routes;
}

function extractEntitiesFromMdd(md: string, maxEntities = 80): string[] {
  const section3 = extractSection(
    md,
    /^##\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im,
  );
  if (!section3) return [];
  return [...extractEntities(section3)].sort().slice(0, maxEntities);
}

function deliverableItemLabel(kind: MddDeliverableKind): string {
  switch (kind) {
    case "use-cases":
      return "Caso de uso";
    case "blueprint":
      return "Entrada en §2 Persistencia (### o viñeta)";
    case "api-contracts":
      return "Fila en tabla de endpoints";
    case "logic-flows":
      return "Flujo o diagrama Mermaid";
    case "architecture":
      return "Subsección o módulo documentado";
    case "tasks":
      return "Tarea comprobable (- [ ])";
    case "infra":
      return "Servicio o variable documentada";
    case "spec":
      return "Ítem en alcance o user journey";
    case "agent-governance":
      return "Artefacto en scaffold";
    default:
      return "HU o Tarea técnica";
  }
}

function buildCoverageChecklist(md: string, kind: MddDeliverableKind): string {
  const itemLabel = deliverableItemLabel(kind);
  const capabilities = extractBulletsAfterHeading(
    md,
    /(?:^|\n)#{1,4}\s*capacidades\s+funcionales/im,
  );
  const actors = extractNumberedAfterHeading(
    md,
    /(?:^|\n)#{1,4}\s*usuarios\s+y\s+casos\s+de\s+uso/im,
  );
  const uat = extractNumberedAfterHeading(
    md,
    /(?:^|\n)#{1,4}\s*criterios\s+de\s+aceptación\s*\(uat\)/im,
  );
  const routes = extractApiRouteSummary(md);
  const entities = extractEntitiesFromMdd(md);
  const infraItems = extractBulletsAfterHeading(
    md,
    /(?:^|\n)#{1,4}\s*(?:infraestructura|despliegue|servicios)/im,
    16,
  );
  const edgeCases = extractBulletsAfterHeading(
    md,
    /(?:^|\n)#{1,4}\s*(?:edge\s+cases|casos\s+de\s+borde|riesgos)/im,
    16,
  );

  const lines: string[] = [
    `**CHECKLIST DE COBERTURA OBLIGATORIA (derivado del MDD — cada ítem debe mapear a al menos un ${itemLabel}):**`,
    "",
  ];

  if (entities.length && (kind === "blueprint" || kind === "tasks")) {
    const entityLabel =
      kind === "blueprint"
        ? "Entidades / tablas (MDD §3) — cada una en ### nombre_tabla o viñeta -:"
        : "Entidades / tablas (MDD §3) — persistencia, DTOs y validación:";
    lines.push(`**${entityLabel}**`);
    for (const e of entities) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  if (capabilities.length && kind !== "blueprint") {
    lines.push("**Capacidades MVP (§1):**");
    for (const c of capabilities) lines.push(`- [ ] ${c}`);
    lines.push("");
  }

  if (actors.length && ["user-stories", "use-cases", "spec", "architecture"].includes(kind)) {
    lines.push("**Actores / casos de uso clave (§1):**");
    for (const a of actors) lines.push(`- [ ] ${a}`);
    lines.push("");
  }

  if (uat.length) {
    lines.push("**Criterios UAT (§1 / §5):**");
    for (const u of uat) lines.push(`- [ ] ${u}`);
    lines.push("");
  }

  if (routes.length && ["api-contracts", "blueprint", "tasks", "user-stories", "use-cases"].includes(kind)) {
    if (kind === "api-contracts" || kind === "tasks") {
      lines.push(`**Endpoints (§4) — ${kind === "tasks" ? "una tarea Backend por ruta" : "una fila por ruta"}:**`);
      for (const r of routes) lines.push(`- [ ] ${r}`);
    } else {
      lines.push(`**Grupos API (§4) — cubrir con ${itemLabel}:**`);
      const groups = new Set<string>();
      for (const r of routes) {
        const path = r.split(/\s+/)[1] ?? "";
        const seg = path.split("/").filter(Boolean).slice(2, 3)[0] ?? "core";
        groups.add(seg);
      }
      for (const g of [...groups].sort()) lines.push(`- [ ] /api/v1/${g}/*`);
    }
    lines.push("");
  }

  if (edgeCases.length && ["logic-flows", "architecture", "tasks"].includes(kind)) {
    lines.push("**Edge cases / riesgos (§5):**");
    for (const e of edgeCases) lines.push(`- [ ] ${e}`);
    lines.push("");
  }

  const securityItems = extractBulletsAfterHeading(
    md,
    /(?:^|\n)#{1,4}\s*(?:seguridad|security)/im,
    16,
  );
  if (securityItems.length && kind === "tasks") {
    lines.push("**Seguridad (MDD §6):**");
    for (const s of securityItems) lines.push(`- [ ] ${s}`);
    lines.push("");
  }

  if (infraItems.length && (kind === "infra" || kind === "tasks")) {
    lines.push("**Infra / servicios (MDD §7):**");
    for (const i of infraItems) lines.push(`- [ ] ${i}`);
    lines.push("");
  }

  if (capabilities.length && kind === "blueprint") {
    lines.push("**Capacidades → módulos / transversales (§1):**");
    for (const c of capabilities) lines.push(`- [ ] ${c}`);
    lines.push("");
  }

  if (lines.length <= 2) return "";
  return lines.join("\n");
}

const PRIORITY_SECTIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "§1 Contexto y alcance", pattern: /^##\s*(?:1\.\s*)?(?:contexto\s+y\s+alcance|contexto\b)/im },
  { label: "§4 Contratos de API", pattern: /^##\s*(?:4\.\s*)?(?:contratos\s+de\s+api|api\s+contracts|endpoints)/im },
  { label: "§5 Lógica y edge cases", pattern: /^##\s*(?:5\.\s*)?(?:lógica\s+y\s+edge\s+cases|lógica\b|edge\s+cases)/im },
  { label: "§6 Seguridad", pattern: /^##\s*(?:6\.\s*)?(?:seguridad|security)/im },
  { label: "§3 Modelo de datos", pattern: /^##\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im },
  { label: "§2 Arquitectura", pattern: /^##\s*(?:2\.\s*)?(?:arquitectura\s+y\s+stack|arquitectura\b)/im },
  { label: "§7 Infraestructura", pattern: /^##\s*(?:7\.\s*)?(?:infraestructura|despliegue)/im },
];

/** Orden de secciones según entregable (§3 antes para blueprint, etc.). */
function prioritySectionsFor(kind: MddDeliverableKind): typeof PRIORITY_SECTIONS {
  if (kind === "blueprint" || kind === "api-contracts") {
    return [
      PRIORITY_SECTIONS[0]!,
      PRIORITY_SECTIONS[4]!,
      PRIORITY_SECTIONS[1]!,
      PRIORITY_SECTIONS[2]!,
      PRIORITY_SECTIONS[3]!,
      PRIORITY_SECTIONS[5]!,
      PRIORITY_SECTIONS[6]!,
    ];
  }
  if (kind === "infra") {
    return [
      PRIORITY_SECTIONS[6]!,
      PRIORITY_SECTIONS[5]!,
      PRIORITY_SECTIONS[0]!,
      PRIORITY_SECTIONS[3]!,
      PRIORITY_SECTIONS[1]!,
      PRIORITY_SECTIONS[2]!,
      PRIORITY_SECTIONS[4]!,
    ];
  }
  if (kind === "tasks") {
    return [
      PRIORITY_SECTIONS[0]!,
      PRIORITY_SECTIONS[4]!,
      PRIORITY_SECTIONS[1]!,
      PRIORITY_SECTIONS[2]!,
      PRIORITY_SECTIONS[3]!,
      PRIORITY_SECTIONS[5]!,
      PRIORITY_SECTIONS[6]!,
    ];
  }
  return PRIORITY_SECTIONS;
}

/**
 * Construye contexto MDD priorizado para entregables SDD.
 * Si el MDD cabe en el presupuesto, lo devuelve íntegro; si no, antepone checklist de cobertura
 * y secciones críticas antes que bloques extensos de §2/§3.
 */
export function buildMddContextForDeliverable(
  mddContent: string,
  kind: MddDeliverableKind,
  options?: MddDeliverableContextOptions,
): string {
  const trimmed = (mddContent ?? "").trim();
  if (!trimmed) return "";
  const budget = resolveMddDeliverableBudget(options);
  if (trimmed.length <= budget) return trimmed;

  const parts: string[] = [];
  let remaining = budget;

  const checklist = buildCoverageChecklist(trimmed, kind);
  if (checklist) {
    parts.push(checklist);
    remaining -= checklist.length + 2;
  }

  for (const { label, pattern } of prioritySectionsFor(kind)) {
    const body = extractSection(trimmed, pattern);
    if (!body) continue;
    const block = `### Extracto MDD — ${label}\n\n${body}`;
    if (block.length > remaining) {
      parts.push(`${block.slice(0, remaining)}\n\n…(sección truncada por límite de contexto)`);
      break;
    }
    parts.push(block);
    remaining -= block.length + 2;
  }

  if (parts.length === 0) return trimmed.slice(0, budget);

  parts.push(
    "\n---\n*Nota: MDD completo truncado; se priorizaron checklist de cobertura y secciones críticas del MDD.*",
  );
  return parts.join("\n\n").slice(0, budget);
}

/** Hint explícito si §5 menciona flowchart (evita gap de conformidad). */
export function buildLogicFlowsDiagramHint(mddContent: string): string {
  const section5 = extractSection(
    mddContent,
    /^##\s*(?:5\.\s*)?(?:l[oó]gica\s+y\s+edge\s+cases|l[oó]gica\b|edge\s+cases)/im,
  );
  if (!/\bflowchart\b/i.test(section5)) return "";
  return (
    "**OBLIGATORIO (MDD §5):** Incluye al menos un bloque ```mermaid con `flowchart TD` o `flowchart LR` " +
    "(la palabra `flowchart` debe figurar en el diagrama), además de sequenceDiagram si aplica."
  );
}

export function buildMddContextForUserStories(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "user-stories", options);
}

export function buildMddContextForUseCases(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "use-cases", options);
}

export function buildMddContextForBlueprint(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "blueprint", options);
}

export function buildMddContextForApiContracts(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "api-contracts", options);
}

export function buildMddContextForLogicFlows(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "logic-flows", options);
}

export function buildMddContextForArchitecture(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "architecture", options);
}

export function buildMddContextForTasks(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "tasks", options);
}

export function buildMddContextForInfra(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "infra", options);
}

export function buildMddContextForSpec(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "spec", options);
}

export function buildMddContextForAgentGovernance(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "agent-governance", options);
}
