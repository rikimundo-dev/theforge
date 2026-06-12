/**
 * Diagrama de componentes propuesto (greenfield): Mermaid determinista desde §2–§4 del MDD canónico.
 */

export type GreenfieldStackSignals = {
  frontend?: string;
  backend?: string;
  primaryDb?: string;
  graphDb?: string;
  cacheOrQueue?: string;
  tableCount: number;
  endpointCount: number;
  hasCypherGraph: boolean;
};

const LEGACY_EVIDENCE_MARKERS =
  /Evidencia \(MDD estructurado|legacy_mdd_v1|generate_legacy_documentation|Doc\. de partida/i;

function sanitizeMermaidId(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "node";
}

function getSectionBody(
  draft: string,
  headingPattern: RegExp,
): { body: string; startIndex: number; endIndex: number } | null {
  const match = draft.match(headingPattern);
  if (!match) return null;
  const idx = draft.indexOf(match[0]);
  const sectionStart = idx + match[0].length;
  const rest = draft.slice(sectionStart).replace(/^\s*\n+/, "");
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2).trim() : rest.trim();
  const endIndex = nextH2 !== -1 ? sectionStart + nextH2 : draft.length;
  return { body, startIndex: sectionStart, endIndex };
}

function firstMatchLabel(text: string, patterns: Array<{ re: RegExp; label: string }>): string | undefined {
  for (const { re, label } of patterns) {
    if (re.test(text)) return label;
  }
  return undefined;
}

function countCreateTables(text: string): number {
  return (text.match(/\bCREATE\s+TABLE\b/gi) ?? []).length;
}

function countApiEndpoints(section4Body: string, fullDraft: string): number {
  const seen = new Set<string>();
  for (const line of section4Body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(t)) continue;
    if (/^\|\s*(Método|Method|Ruta|Route)\s*\|/i.test(t)) continue;
    const tableMatch = t.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\|\s*(\S+)/i);
    if (tableMatch) seen.add(`${tableMatch[1]!.toUpperCase()} ${tableMatch[2]}`);
  }
  for (const m of section4Body.matchAll(/^###\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/gim)) {
    seen.add(`${m[1]!.toUpperCase()} ${m[2]}`);
  }
  if (seen.size === 0) {
    for (const m of fullDraft.matchAll(/^###\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/gim)) {
      seen.add(`${m[1]!.toUpperCase()} ${m[2]}`);
    }
  }
  return seen.size;
}

const FRONTEND_PATTERNS = [
  { re: /next\.?\s*js/i, label: "Next.js" },
  { re: /\breact\b/i, label: "React" },
  { re: /\bvue\b/i, label: "Vue" },
  { re: /\bangular\b/i, label: "Angular" },
  { re: /\bsvelte\b/i, label: "Svelte" },
];

const BACKEND_PATTERNS = [
  { re: /\bnestjs\b/i, label: "NestJS" },
  { re: /\bexpress\b/i, label: "Express" },
  { re: /\bfastapi\b/i, label: "FastAPI" },
  { re: /\bdjango\b/i, label: "Django" },
  { re: /\bstrapi\b/i, label: "Strapi" },
  { re: /\bspring\b/i, label: "Spring" },
  { re: /\blaravel\b/i, label: "Laravel" },
];

const DB_PATTERNS = [
  { re: /postgresql|postgres/i, label: "PostgreSQL" },
  { re: /\bmysql\b|\bmariadb\b/i, label: "MySQL" },
  { re: /\bmongodb\b|\bmongo\b/i, label: "MongoDB" },
  { re: /\bsqlite\b/i, label: "SQLite" },
];

const GRAPH_PATTERNS = [
  { re: /falkordb|falkor/i, label: "FalkorDB" },
  { re: /\bneo4j\b/i, label: "Neo4j" },
];

const CACHE_QUEUE_PATTERNS = [
  { re: /\bredis\b/i, label: "Redis" },
  { re: /rabbitmq/i, label: "RabbitMQ" },
  { re: /\bkafka\b/i, label: "Kafka" },
  { re: /bullmq|\bbull\b/i, label: "BullMQ" },
];

/** Extrae señales de stack y volumen desde un MDD greenfield canónico. */
export function parseGreenfieldMddSignals(draft: string): GreenfieldStackSignals | null {
  const trimmed = (draft ?? "").trim();
  if (trimmed.length < 200) return null;
  if (LEGACY_EVIDENCE_MARKERS.test(trimmed)) return null;
  if (!/^##\s*2\.\s*Arquitectura/im.test(trimmed)) return null;

  const section2 = getSectionBody(trimmed, /^##\s*2\.\s*Arquitectura[^\n]*/im);
  const section3 = getSectionBody(trimmed, /^##\s*3\.\s*Modelo\s+(?:de\s+)?datos/im);
  const section4 = getSectionBody(trimmed, /^##\s*4\.\s*Contratos\s+de\s+API/im);
  if (!section2?.body || section2.body.length < 40) return null;
  if (/^\s*\(Pendiente\)\s*$/i.test(section2.body)) return null;

  const stackText = [section2.body, section3?.body ?? "", section4?.body ?? ""].join("\n");
  const frontend = firstMatchLabel(section2.body, FRONTEND_PATTERNS);
  const backend = firstMatchLabel(section2.body, BACKEND_PATTERNS);
  const primaryDb = firstMatchLabel(stackText, DB_PATTERNS);
  const graphDb = firstMatchLabel(stackText, GRAPH_PATTERNS);
  const cacheOrQueue = firstMatchLabel(section2.body, CACHE_QUEUE_PATTERNS);
  const hasCypherGraph =
    /```cypher/i.test(section3?.body ?? "") ||
    /```(?:text|plaintext)[\s\S]*?(?:CREATE|MERGE)\s*\(/i.test(section3?.body ?? "") ||
    /\bgraph\s+TD\b/i.test(section3?.body ?? "");

  return {
    frontend,
    backend,
    primaryDb,
    graphDb: graphDb ?? (hasCypherGraph ? "Grafo" : undefined),
    cacheOrQueue,
    tableCount: countCreateTables(section3?.body ?? ""),
    endpointCount: countApiEndpoints(section4?.body ?? "", trimmed),
    hasCypherGraph,
  };
}

export function buildProposedComponentDiagramMermaid(signals: GreenfieldStackSignals): string | null {
  const lines: string[] = ["flowchart TB"];
  const edges: string[] = [];

  const feLabel = signals.frontend ?? "Frontend";
  const beLabel = signals.backend ?? "Backend";
  const dbLabel = signals.primaryDb ?? "Base de datos";
  const apiLabel =
    signals.endpointCount > 0 ? `REST · ${signals.endpointCount} endpoints` : "REST API";
  const tableLabel = signals.tableCount > 0 ? `${signals.tableCount} tablas` : "Persistencia";

  if (signals.frontend && signals.backend) {
    const feId = sanitizeMermaidId(`fe_${feLabel}`);
    const beId = sanitizeMermaidId(`be_${beLabel}`);
    lines.push(`  subgraph ${feId}["${feLabel} · Cliente"]`);
    lines.push("    FE_UI[Pages / Components]");
    lines.push("    FE_STATE[State / Hooks]");
    lines.push("    FE_CLIENT[API Client]");
    lines.push("  end");
    lines.push(`  subgraph ${beId}["${beLabel} · Servidor"]`);
    lines.push(`    BE_API["${apiLabel}"]`);
    lines.push("    BE_DOMAIN[Services / Domain]");
    if (signals.primaryDb) lines.push(`    BE_SQL[("${dbLabel} · ${tableLabel}")]`);
    if (signals.graphDb) lines.push(`    BE_GRAPH[("${signals.graphDb}")]`);
    lines.push("  end");
    edges.push("  FE_UI --> FE_STATE");
    edges.push("  FE_STATE --> FE_CLIENT");
    edges.push("  FE_CLIENT -->|HTTP| BE_API");
    edges.push("  BE_API --> BE_DOMAIN");
    if (signals.primaryDb) edges.push("  BE_DOMAIN --> BE_SQL");
    if (signals.graphDb) edges.push("  BE_DOMAIN --> BE_GRAPH");
  } else if (signals.backend) {
    const beId = sanitizeMermaidId(`be_${beLabel}`);
    lines.push(`  subgraph ${beId}["${beLabel}"]`);
    lines.push(`    API["${apiLabel}"]`);
    lines.push("    SVC[Services / Domain]");
    if (signals.primaryDb) lines.push(`    SQL[("${dbLabel} · ${tableLabel}")]`);
    if (signals.graphDb) lines.push(`    GRAPH[("${signals.graphDb}")]`);
    lines.push("  end");
    edges.push("  API --> SVC");
    if (signals.primaryDb) edges.push("  SVC --> SQL");
    if (signals.graphDb) edges.push("  SVC --> GRAPH");
  } else if (signals.frontend) {
    const feId = sanitizeMermaidId(`fe_${feLabel}`);
    lines.push(`  subgraph ${feId}["${feLabel} · SPA"]`);
    lines.push("    UI[Pages / Components]");
    lines.push("    CLIENT[API Client]");
    lines.push("  end");
    lines.push('  EXT["Backend / BaaS externo"]');
    edges.push("  UI --> CLIENT");
    edges.push("  CLIENT -->|HTTP| EXT");
  } else {
    lines.push('  APP["Aplicación propuesta"]');
    if (signals.primaryDb) lines.push(`  DB[("${dbLabel} · ${tableLabel}")]`);
    if (signals.graphDb) lines.push(`  GRAPH[("${signals.graphDb}")]`);
    edges.push("  APP --> DB");
    if (signals.graphDb) edges.push("  APP --> GRAPH");
  }

  if (signals.cacheOrQueue) {
    const auxId = sanitizeMermaidId(signals.cacheOrQueue);
    lines.push(`  ${auxId}["${signals.cacheOrQueue}"]`);
    const target = signals.backend ? "BE_DOMAIN" : signals.frontend ? "CLIENT" : "APP";
    edges.push(`  ${target} --> ${auxId}`);
  }

  if (edges.length) lines.push(...edges);
  return lines.length > 1 ? lines.join("\n") : null;
}

export function formatProposedComponentDiagramMarkdown(mermaid: string): string {
  const note =
    "_Propuesta derivada de §2–§4: capas inferidas del stack, entidades SQL y contratos API documentados (determinista, sin servicios inventados)._";
  return `### Diagrama de componentes propuesto\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n\n${note}`;
}

export function isMddProposedComponentDiagramEnabled(): boolean {
  const v = process.env.MDD_PROPOSED_COMPONENT_DIAGRAM?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  return !["0", "false", "off", "no"].includes(v);
}

function hasProposedComponentDiagramSection(draft: string): boolean {
  return /###\s+Diagrama de componentes propuesto/i.test(draft);
}

function hasLegacyComponentDiagramSection(draft: string): boolean {
  return /(?:^|\n)##?\s+Diagrama de Componentes\s*(?:\n|$)/i.test(draft);
}

/** Inserta ### Diagrama de componentes propuesto al final de §2 (idempotente). */
export function injectProposedComponentDiagramIntoSection2(draft: string): string {
  if (!isMddProposedComponentDiagramEnabled()) return draft;
  const mdd = (draft ?? "").trim();
  if (!mdd || hasProposedComponentDiagramSection(mdd) || hasLegacyComponentDiagramSection(mdd)) {
    return draft;
  }

  const signals = parseGreenfieldMddSignals(mdd);
  if (!signals) return draft;

  const mermaid = buildProposedComponentDiagramMermaid(signals);
  if (!mermaid) return draft;

  const section2Match = mdd.match(/^##\s*2\.\s*Arquitectura[^\n]*/im);
  if (!section2Match) return draft;
  const s2Start = section2Match.index ?? 0;
  const s3Match = /^##\s*3\.\s*/gim;
  s3Match.lastIndex = s2Start + 1;
  const s3 = s3Match.exec(mdd);
  const s2End = s3 ? s3.index : mdd.length;

  const injection = `\n\n${formatProposedComponentDiagramMarkdown(mermaid)}\n`;
  return mdd.slice(0, s2End) + injection + mdd.slice(s2End);
}
