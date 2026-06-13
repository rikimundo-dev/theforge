/** Presupuesto de caracteres del MDD para generación de historias de usuario. */
export const USER_STORIES_MDD_BUDGET = 50_000;

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

function buildCoverageChecklist(md: string): string {
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

  const lines: string[] = [
    "**CHECKLIST DE COBERTURA OBLIGATORIA (derivado del MDD — cada ítem debe mapear a al menos una HU o Tarea técnica):**",
    "",
  ];

  if (capabilities.length) {
    lines.push("**Capacidades MVP (§1):**");
    for (const c of capabilities) lines.push(`- [ ] ${c}`);
    lines.push("");
  }
  if (actors.length) {
    lines.push("**Actores / casos de uso clave (§1):**");
    for (const a of actors) lines.push(`- [ ] ${a}`);
    lines.push("");
  }
  if (uat.length) {
    lines.push("**Criterios UAT (§1 / §5):**");
    for (const u of uat) lines.push(`- [ ] ${u}`);
    lines.push("");
  }
  if (routes.length) {
    lines.push("**Grupos API (§4) — agrupa por dominio y cubre con HU:**");
    const groups = new Set<string>();
    for (const r of routes) {
      const path = r.split(/\s+/)[1] ?? "";
      const seg = path.split("/").filter(Boolean).slice(2, 3)[0] ?? "core";
      groups.add(seg);
    }
    for (const g of [...groups].sort()) lines.push(`- [ ] /api/v1/${g}/*`);
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
  { label: "§2 Arquitectura", pattern: /^##\s*(?:2\.\s*)?(?:arquitectura\s+y\s+stack|arquitectura\b)/im },
  { label: "§3 Modelo de datos", pattern: /^##\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im },
];

/**
 * Construye contexto MDD priorizado para historias de usuario.
 * Si el MDD cabe en el presupuesto, lo devuelve íntegro; si no, antepone checklist de cobertura
 * y secciones críticas (§1, §4, §5, §6) antes que §2/§3 extensos.
 */
export function buildMddContextForUserStories(mddContent: string): string {
  const trimmed = (mddContent ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= USER_STORIES_MDD_BUDGET) return trimmed;

  const parts: string[] = [];
  let budget = USER_STORIES_MDD_BUDGET;

  const checklist = buildCoverageChecklist(trimmed);
  if (checklist) {
    parts.push(checklist);
    budget -= checklist.length + 2;
  }

  for (const { label, pattern } of PRIORITY_SECTIONS) {
    const body = extractSection(trimmed, pattern);
    if (!body) continue;
    const block = `### Extracto MDD — ${label}\n\n${body}`;
    if (block.length > budget) {
      parts.push(`${block.slice(0, budget)}\n\n…(sección truncada por límite de contexto)`);
      break;
    }
    parts.push(block);
    budget -= block.length + 2;
  }

  if (parts.length === 0) return trimmed.slice(0, USER_STORIES_MDD_BUDGET);

  parts.push(
    "\n---\n*Nota: MDD completo truncado; se priorizaron capacidades, actores, UAT, API, reglas, seguridad y checklist de cobertura.*",
  );
  return parts.join("\n\n").slice(0, USER_STORIES_MDD_BUDGET);
}
