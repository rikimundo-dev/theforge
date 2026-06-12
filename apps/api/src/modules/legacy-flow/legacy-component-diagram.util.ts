/**
 * Diagrama de componentes Mermaid derivado de la documentación legacy (codebaseDoc / MDD de partida).
 * Solo usa evidencia parseada del markdown (tablas entidades, API, lógica de negocio, infra).
 */

export interface LegacyRepoEvidence {
  label: string;
  kind: "strapi" | "frontend" | "nest" | "unknown";
  entityCount: number;
  apiRouteCount: number;
  serviceLabels: string[];
  orm?: string;
}

export interface LegacyDocEvidence {
  repos: LegacyRepoEvidence[];
}

const REPO_HEADER_RE = /^##\s+Repositorio:\s*(.+?)(?:\s*\(|$)/gim;

function sanitizeMermaidId(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "node";
}

function parseInfraOrm(chunk: string): string | undefined {
  const infra = chunk.match(/###\s+Infraestructura[\s\S]*?```json\s*([\s\S]*?)```/i);
  if (!infra?.[1]) return undefined;
  try {
    const o = JSON.parse(infra[1].trim()) as { orm?: string };
    return typeof o.orm === "string" && o.orm.trim() ? o.orm.trim() : undefined;
  } catch {
    return undefined;
  }
}

function countTableDataRows(sectionBody: string): number {
  const lines = sectionBody.split("\n");
  let count = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(t)) continue;
    if (/^\|\s*---/.test(t)) continue;
    if (/^\|\s*(Entidad|Ruta|Servicio)\s*\|/i.test(t)) continue;
    count++;
  }
  return count;
}

function extractSectionBody(chunk: string, heading: string): string {
  const re = new RegExp(`###\\s+${heading}[\\s\\S]*?(?=\\n###\\s+|\\n##\\s+|$)`, "i");
  const m = chunk.match(re);
  return m?.[0] ?? "";
}

function inferRepoKind(chunk: string, orm?: string): LegacyRepoEvidence["kind"] {
  const entities = extractSectionBody(chunk, "Entidades y modelo de datos");
  if (/\|\s*[^\|]+\s*\|\s*frontend\s*\|/i.test(entities)) return "frontend";
  if (/\|\s*[^\|]+\s*\|\s*strapi\s*\|/i.test(entities)) return "strapi";
  if (orm === "strapi") return "strapi";
  if (/src\/Models|apiDirection|frontend:/i.test(chunk)) return "frontend";
  if (/StrapiRoute|strapi:/i.test(chunk)) return "strapi";
  if (/NestController|nest:/i.test(chunk)) return "nest";
  return "unknown";
}

function extractServiceLabels(chunk: string, limit = 8): string[] {
  const body = extractSectionBody(chunk, "Lógica de negocio");
  const labels: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\|\s*([^|]+?)\s*\|/);
    if (!m) continue;
    const label = m[1].trim();
    if (!label || label === "Servicio" || label.startsWith("---")) continue;
    labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}

/** Parsea `codebaseDoc` multi-repo (cabeceras ## Repositorio) en evidencia estructurada. */
export function parseLegacyCodebaseDocEvidence(codebaseDoc: string): LegacyDocEvidence {
  const doc = codebaseDoc.trim();
  if (!doc) return { repos: [] };

  const repos: LegacyRepoEvidence[] = [];
  const headers: Array<{ label: string; start: number }> = [];
  let m: RegExpExecArray | null;
  REPO_HEADER_RE.lastIndex = 0;
  while ((m = REPO_HEADER_RE.exec(doc)) !== null) {
    headers.push({ label: m[1].trim(), start: m.index });
  }

  if (headers.length === 0) {
    const orm = parseInfraOrm(doc);
    repos.push({
      label: "codebase",
      kind: inferRepoKind(doc, orm),
      entityCount: countTableDataRows(extractSectionBody(doc, "Entidades y modelo de datos")),
      apiRouteCount: countTableDataRows(extractSectionBody(doc, "Contratos API")),
      serviceLabels: extractServiceLabels(doc),
      orm,
    });
    return { repos };
  }

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    const end = headers[i + 1]?.start ?? doc.length;
    const chunk = doc.slice(h.start, end);
    const orm = parseInfraOrm(chunk);
    repos.push({
      label: h.label,
      kind: inferRepoKind(chunk, orm),
      entityCount: countTableDataRows(extractSectionBody(chunk, "Entidades y modelo de datos")),
      apiRouteCount: countTableDataRows(extractSectionBody(chunk, "Contratos API")),
      serviceLabels: extractServiceLabels(chunk),
      orm,
    });
  }

  return { repos };
}

function repoShortLabel(label: string): string {
  const parts = label.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? label;
}

function formatMermaidBlock(content: string): string {
  return "```mermaid\n" + content.trim() + "\n```";
}

/** Genera flowchart TB con capas frontend / API / persistencia según repos detectados. */
export function buildLegacyComponentDiagramMermaid(evidence: LegacyDocEvidence): string | null {
  const repos = evidence.repos.filter(
    (r) => r.entityCount > 0 || r.apiRouteCount > 0 || r.serviceLabels.length > 0,
  );
  if (repos.length === 0) return null;

  const lines: string[] = ["flowchart TB"];
  const edges: string[] = [];

  const frontend = repos.find((r) => r.kind === "frontend");
  const backend = repos.find((r) => r.kind === "strapi" || r.kind === "nest") ?? repos.find((r) => r !== frontend);

  if (frontend && backend) {
    const feId = sanitizeMermaidId(`fe_${repoShortLabel(frontend.label)}`);
    const beId = sanitizeMermaidId(`be_${repoShortLabel(backend.label)}`);
    lines.push(`  subgraph ${feId}["${repoShortLabel(frontend.label)} · Frontend"]`);
    lines.push("    FE_UI[Pages / Components]");
    lines.push("    FE_API[src/api · Querys]");
    lines.push("    FE_MODELS[src/Models]");
    lines.push("  end");
    lines.push(`  subgraph ${beId}["${repoShortLabel(backend.label)} · ${backend.kind === "strapi" ? "Strapi" : "Backend"}"]`);
    lines.push(`    BE_ROUTES["REST · ${backend.apiRouteCount} rutas"]`);
    lines.push(`    BE_SVC["Services · ${backend.serviceLabels.length || "n"} módulos"]`);
    lines.push(`    BE_DB[("${backend.orm === "strapi" ? "PostgreSQL" : "Persistencia"}")]`);
    lines.push("  end");
    edges.push("  FE_UI --> FE_API");
    edges.push("  FE_API -->|HTTP REST| BE_ROUTES");
    edges.push("  BE_ROUTES --> BE_SVC");
    edges.push("  BE_SVC --> BE_DB");
  } else if (backend?.kind === "strapi") {
    const beId = sanitizeMermaidId(repoShortLabel(backend.label));
    lines.push(`  subgraph ${beId}["${repoShortLabel(backend.label)} · Strapi"]`);
    lines.push("    ADMIN[Admin Panel]");
    lines.push(`    ROUTES["API REST · ${backend.apiRouteCount} rutas"]`);
    lines.push(`    SERVICES["Services · ${backend.serviceLabels.length || "n"} módulos"]`);
    lines.push(`    DB[("${backend.orm === "strapi" ? "PostgreSQL" : "DB"}")]`);
    lines.push("  end");
    edges.push("  ADMIN --> ROUTES");
    edges.push("  ROUTES --> SERVICES");
    edges.push("  SERVICES --> DB");
  } else if (frontend) {
    const feId = sanitizeMermaidId(repoShortLabel(frontend.label));
    lines.push(`  subgraph ${feId}["${repoShortLabel(frontend.label)} · SPA"]`);
    lines.push("    UI[Pages / Components]");
    lines.push(`    QUERYS["API client · ${frontend.apiRouteCount} contratos"]`);
    lines.push(`    MODELS["Models · ${frontend.entityCount} tipos"]`);
    lines.push("  end");
    lines.push('  EXT["Backend externo (Strapi/API)"]');
    edges.push("  UI --> QUERYS");
    edges.push("  QUERYS -->|HTTP| EXT");
  } else {
    for (const repo of repos.slice(0, 3)) {
      const id = sanitizeMermaidId(repoShortLabel(repo.label));
      lines.push(`  subgraph ${id}["${repoShortLabel(repo.label)}"]`);
      lines.push(`    ${id}_ENT["Entidades · ${repo.entityCount}"]`);
      lines.push(`    ${id}_API["API · ${repo.apiRouteCount} rutas"]`);
      lines.push("  end");
      edges.push(`  ${id}_ENT --> ${id}_API`);
    }
  }

  if (edges.length) lines.push(...edges);
  return lines.join("\n");
}

export function formatLegacyComponentDiagramMarkdown(mermaid: string): string {
  const repoSummary =
    "_Derivado de la documentación de partida: capas inferidas desde entidades, contratos API y servicios indexados (sin nodos inventados)._";
  return `### Diagrama de Componentes\n\n${formatMermaidBlock(mermaid)}\n\n${repoSummary}`;
}

function hasTopLevelComponentDiagramSection(doc: string): boolean {
  return /(?:^|\n)##\s+Diagrama de Componentes\s*(?:\n|$)/i.test(doc);
}

/** Añade sección global al final del MDD de partida (idempotente). */
export function appendComponentDiagramToCodebaseDoc(codebaseDoc: string): string {
  const doc = codebaseDoc.trim();
  if (!doc) return doc;
  if (hasTopLevelComponentDiagramSection(doc)) return doc;

  const mermaid = buildLegacyComponentDiagramMermaid(parseLegacyCodebaseDocEvidence(doc));
  if (!mermaid) return doc;

  const block =
    "\n\n---\n\n## Diagrama de Componentes\n\n" + formatLegacyComponentDiagramMarkdown(mermaid);
  return doc + block;
}

/** Inserta ### Diagrama de Componentes al final de ## 2. Arquitectura (idempotente). */
export function injectComponentDiagramIntoMddSection2(mddContent: string, codebaseDoc: string): string {
  const mdd = mddContent.trim();
  if (!mdd) return mddContent;
  if (/###\s+Diagrama de Componentes/i.test(mdd)) return mddContent;

  const mermaid =
    buildLegacyComponentDiagramMermaid(parseLegacyCodebaseDocEvidence(codebaseDoc)) ??
    buildLegacyComponentDiagramMermaid(parseLegacyCodebaseDocEvidence(mdd));
  if (!mermaid) return mddContent;

  const sectionRe = /^##\s*2\.\s*[^\n]*/gim;
  const matches: Array<{ index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(mdd)) !== null) {
    matches.push({ index: m.index });
  }
  if (matches.length === 0) return mddContent;

  const s2Start = matches[0]!.index;
  const s3Match = /^##\s*3\.\s*/gim;
  s3Match.lastIndex = s2Start + 1;
  const s3 = s3Match.exec(mdd);
  const s2End = s3 ? s3.index : mdd.length;

  const injection = "\n\n" + formatLegacyComponentDiagramMarkdown(mermaid) + "\n";
  return mdd.slice(0, s2End) + injection + mdd.slice(s2End);
}

export function isLegacyComponentDiagramEnabled(): boolean {
  const v = process.env.LEGACY_MDD_COMPONENT_DIAGRAM?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  return !["0", "false", "off", "no"].includes(v);
}
