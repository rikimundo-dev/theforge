/**
 * @fileoverview **Experta en diagramas Mermaid** — única fuente de verdad para generar y normalizar
 * diagramas Mermaid en todo TheForge. Cubre todos los tipos de diagrama comunes.
 *
 * ## Reglas de normalización
 *
 * 1. Node IDs sin espacios (reemplazar con guiones o underscores).
 * 2. Quotes consistentes (double quotes para labels con espacios/símbolos).
 * 3. Bloques alt/end siempre cerrados en sequence diagrams.
 * 4. Participants siempre declarados en sequence diagrams.
 * 5. Arrows con sintaxis correcta (->> vs -->> vs -x vs --x).
 * 6. Subgraph siempre con `end`.
 * 7. Sin líneas en blanco dentro de bloques que no las soporten.
 *
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type MermaidDiagramType =
  | "flowchart"
  | "sequenceDiagram"
  | "classDiagram"
  | "erDiagram"
  | "stateDiagram"
  | "stateDiagram-v2"
  | "gantt"
  | "pie"
  | "gitGraph"
  | "quadrantChart"
  | "mindmap"
  | "timeline"
  | "xychart"
  | "block"
  | "packet";

export type FlowchartDirection = "TD" | "LR" | "BT" | "RL";

export interface FlowchartOptions {
  direction?: FlowchartDirection;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  subgraphs?: FlowchartSubgraph[];
}

export interface FlowchartNode {
  id: string;
  label: string;
  shape?: "box" | "rounded" | "circle" | "diamond" | "hexagon" | "parallelogram" | "stadium" | "trapezoid";
  style?: Record<string, string>;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
  type?: "arrow" | "dotted" | "thick" | "both" | "open";
}

export interface FlowchartSubgraph {
  id: string;
  label: string;
  nodes: string[];
}

export interface SequenceOptions {
  title?: string;
  participants: string[];
  messages: SequenceMessage[];
  /** Notas (por el costado) */
  notes?: SequenceNote[];
}

export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  type?: "->" | "->>" | "-->" | "-->>" | "-x" | "--x" | "=>>" | "->>+" | "->>-" | "-->+" | "-->>-";
  /** Para alt/opt/loop/par */
  block?: { type: "alt" | "opt" | "loop" | "par" | "critical" | "break"; label: string };
}

export interface SequenceNote {
  position: "right of" | "left of" | "over";
  actor: string;
  text: string;
}

export interface ClassOptions {
  title?: string;
  classes: ClassDef[];
  relations: ClassRelation[];
}

export interface ClassDef {
  name: string;
  stereotype?: string;
  members: string[];
  methods: string[];
}

export interface ClassRelation {
  from: string;
  to: string;
  type: "inheritance" | "composition" | "aggregation" | "association" | "dependency" | "realization";
  label?: string;
  fromMultiplicity?: string;
  toMultiplicity?: string;
}

export interface EROptions {
  title?: string;
  entities: EREntity[];
  relations: ERRelation[];
}

export interface EREntity {
  name: string;
  attributes: ERAttribute[];
}

export interface ERAttribute {
  name: string;
  type: string;
  key?: boolean;
}

export interface ERRelation {
  from: string;
  to: string;
  type: "1:1" | "1:N" | "N:M";
  label?: string;
}

export type MermaidInput =
  | { type: "flowchart"; options: FlowchartOptions }
  | { type: "sequenceDiagram"; options: SequenceOptions }
  | { type: "classDiagram"; options: ClassOptions }
  | { type: "erDiagram"; options: EROptions }
  | { type: "gantt"; options: GanttOptions }
  | { type: "stateDiagram"; options: StateOptions }
  | { type: "pie"; options: PieOptions }
  | { type: "gitGraph"; options: GitGraphOptions };

// ─── Gantt ──────────────────────────────────────────────────────────────

export interface GanttOptions {
  title?: string;
  dateFormat?: string;
  axisFormat?: string;
  tasks: GanttTask[];
}

export interface GanttTask {
  id: string;
  label: string;
  start: string;
  end: string;
  dependsOn?: string;
}

// ─── State Diagram ──────────────────────────────────────────────────────

export interface StateOptions {
  title?: string;
  states: string[];
  transitions: StateTransition[];
  /** State con sub-estados */
  composites?: StateComposite[];
}

export interface StateTransition {
  from: string;
  to: string;
  label?: string;
}

export interface StateComposite {
  name: string;
  children: string[];
}

// ─── Pie ────────────────────────────────────────────────────────────────

export interface PieOptions {
  title?: string;
  slices: { label: string; value: number }[];
}

// ─── GitGraph ───────────────────────────────────────────────────────────

export interface GitGraphOptions {
  title?: string;
  commits: GitCommit[];
  branches?: GitBranch[];
}

export interface GitCommit {
  branch: string;
  label: string;
  type?: "commit" | "cherry-pick" | "tag";
}

export interface GitBranch {
  name: string;
  from?: string; // commit id or "main"
  order?: number;
}

// ─── Validation Helpers ────────────────────────────────────────────────

const ALLOWED_TYPES: MermaidDiagramType[] = [
  "flowchart", "sequenceDiagram", "classDiagram", "erDiagram",
  "stateDiagram", "stateDiagram-v2", "gantt", "pie", "gitGraph",
  "quadrantChart", "mindmap", "timeline", "xychart", "block", "packet",
];

function cleanId(id: string): string {
  // Node IDs cannot have spaces. Replace with underscore.
  return id.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "_");
}

function q(label: string): string {
  // Wrap in double quotes if it contains special chars
  if (/[^\w\sáéíóúñü-]/i.test(label) || /^[A-Z][a-z]/.test(label) && label.includes(" ")) {
    return `"${label.replace(/"/g, "#quot;")}"`;
  }
  if (/\s/.test(label) || /[^\w-]/.test(label)) {
    return `"${label.replace(/"/g, "#quot;")}"`;
  }
  return label;
}

function shapeWrap(nodeId: string, label: string, shape?: string): string {
  const id = cleanId(nodeId);
  switch (shape) {
    case "rounded":    return `${id}(${q(label)})`;
    case "circle":     return `${id}((${q(label)}))`;
    case "diamond":    return `${id}{${q(label)}}`;
    case "hexagon":    return `${id}{{${q(label)}}}`;
    case "parallelogram": return `${id}[/${q(label)}/]`;
    case "stadium":     return `${id}([${q(label)}])`;
    case "trapezoid":   return `${id}[/${q(label)}\\]`;
    case "box":
    default:           return `${id}[${q(label)}]`;
  }
}

const ARROW_MAP: Record<string, string> = {
  "->":    "-->",
  "->>":   "-->>",
  "-->":   "-->",
  "-->>":  "-->>",
  "-x":    "--x",
  "--x":   "--x",
  "=>>":   "=>>",
  "->>+":  "-->>+",
  "->>-":  "-->>-",
  "-->+":  "-->>+",
  "-->>-": "-->>-",
};

function arrow(a: string): string {
  return ARROW_MAP[a] ?? "-->>";
}

const ER_REL_MAP: Record<string, string> = {
  "1:1": "||--||",
  "1:N": "||--o{",
  "N:M": "}o--o{",
};

const CLASS_REL_MAP: Record<string, string> = {
  inheritance:  "<|--",
  composition:  "*--",
  aggregation:  "o--",
  association:  "-->",
  dependency:   "..>",
  realization:  "<|..",
};

// ─── Generators ─────────────────────────────────────────────────────────

function generateFlowchart(opts: FlowchartOptions): string[] {
  const lines: string[] = [];
  const dir = opts.direction ?? "TD";
  lines.push(`graph ${dir}`);

  // Subgraphs first
  if (opts.subgraphs) {
    for (const sg of opts.subgraphs) {
      lines.push(`  subgraph ${q(sg.label)}`);
      for (const nid of sg.nodes) {
        // Don't re-declare nodes in subgraph unless they have a shape
        const node = opts.nodes.find((n) => n.id === nid);
        if (node && node.shape) {
          lines.push(`    ${shapeWrap(nid, node.label, node.shape)}`);
        } else {
          // Just reference the node
          lines.push(`    ${cleanId(nid)}`);
        }
      }
      lines.push("  end");
    }
  }

  // Nodes (skip those already handled in subgraphs)
  const sgNodeIds = new Set(opts.subgraphs?.flatMap((sg) => sg.nodes) ?? []);
  for (const node of opts.nodes) {
    if (!sgNodeIds.has(node.id)) {
      lines.push(`  ${shapeWrap(node.id, node.label, node.shape)}`);
    }
  }

  // Edges
  for (const edge of opts.edges) {
    const arrowType = arrow(edge.type ?? "->>");
    const fromId = cleanId(edge.from);
    const toId = cleanId(edge.to);
    const label = edge.label ? `|${edge.label}|` : "";
    lines.push(`  ${fromId} ${arrowType}${label} ${toId}`);
  }

  return lines;
}

function generateSequence(opts: SequenceOptions): string[] {
  const lines: string[] = [];
  lines.push("sequenceDiagram");

  if (opts.title) lines.push(`  title ${q(opts.title)}`);

  for (const p of opts.participants) {
    lines.push(`  participant ${cleanId(p)} as ${q(p)}`);
  }

  if (opts.notes) {
    for (const note of opts.notes) {
      lines.push(`  Note ${note.position} ${cleanId(note.actor)}: ${note.text}`);
    }
  }

  for (const msg of opts.messages) {
    if (msg.block) {
      lines.push(`  ${msg.block.type} ${q(msg.block.label)}`);
    }
    const a = arrow(msg.type ?? "->>");
    lines.push(`  ${cleanId(msg.from)}${a}${cleanId(msg.to)}: ${q(msg.label)}`);
  }

  // Cerrar bloques abiertos
  const blockCount = opts.messages.filter((m) => m.block).length;
  for (let i = 0; i < blockCount; i++) {
    lines.push("  end");
  }

  return lines;
}

function generateClassDiagram(opts: ClassOptions): string[] {
  const lines: string[] = [];
  lines.push("classDiagram");

  if (opts.title) lines.push(`  title ${q(opts.title)}`);

  for (const cls of opts.classes) {
    const stereo = cls.stereotype ? ` <<${cls.stereotype}>>` : "";
    lines.push(`  class ${cleanId(cls.name)}${stereo}`);
    for (const m of cls.members) {
      lines.push(`  ${cleanId(cls.name)} : ${m}`);
    }
    for (const m of cls.methods) {
      lines.push(`  ${cleanId(cls.name)} : ${m}`);
    }
  }

  for (const rel of opts.relations) {
    const arrowType = CLASS_REL_MAP[rel.type] ?? "-->";
    const label = rel.label ? ` : ${rel.label}` : "";
    const fromCard = rel.fromMultiplicity ? ` "${rel.fromMultiplicity}"` : "";
    const toCard = rel.toMultiplicity ? ` "${rel.toMultiplicity}"` : "";
    lines.push(`  ${cleanId(rel.from)}${fromCard} ${arrowType}${toCard} ${cleanId(rel.to)}${label}`);
  }

  return lines;
}

function generateER(opts: EROptions): string[] {
  const lines: string[] = [];
  lines.push("erDiagram");

  for (const ent of opts.entities) {
    const attrs = ent.attributes.map((a) => {
      const pk = a.key ? " PK" : "";
      return `    ${a.type} ${a.name}${pk}`;
    });
    lines.push(`  ${cleanId(ent.name)} {`);
    lines.push(...attrs);
    lines.push("  }");
  }

  for (const rel of opts.relations) {
    const arrowType = ER_REL_MAP[rel.type] ?? "||--o{";
    const label = rel.label ? ` : ${rel.label}` : "";
    lines.push(`  ${cleanId(rel.from)} ${arrowType} ${cleanId(rel.to)}${label}`);
  }

  return lines;
}

function generateGantt(opts: GanttOptions): string[] {
  const lines: string[] = [];
  lines.push("gantt");
  lines.push("  dateFormat  " + (opts.dateFormat ?? "YYYY-MM-DD"));
  lines.push("  axisFormat  " + (opts.axisFormat ?? "%b %d"));
  if (opts.title) lines.push(`  title ${q(opts.title)}`);

  for (const task of opts.tasks) {
    const dep = task.dependsOn ? ` after ${cleanId(task.dependsOn)}` : "";
    lines.push(`  ${q(task.label)} : ${cleanId(task.id)}, ${task.start}, ${task.end}`);
  }

  return lines;
}

function generateState(opts: StateOptions): string[] {
  const lines: string[] = [];
  lines.push("stateDiagram-v2");

  if (opts.title) lines.push(`  title ${q(opts.title)}`);

  if (opts.composites) {
    for (const comp of opts.composites) {
      lines.push(`  state ${cleanId(comp.name)} {`);
      for (const child of comp.children) {
        lines.push(`    ${cleanId(child)}`);
      }
      lines.push("  }");
    }
  }

  for (const s of opts.states) {
    const isInComposite = opts.composites?.some((c) => c.children.includes(s));
    if (!isInComposite && !opts.composites?.some((c) => c.name === s)) {
      lines.push(`  ${cleanId(s)}`);
    }
  }

  for (const t of opts.transitions) {
    const label = t.label ? `: ${t.label}` : "";
    lines.push(`  ${cleanId(t.from)} --> ${cleanId(t.to)}${label}`);
  }

  return lines;
}

function generatePie(opts: PieOptions): string[] {
  const lines: string[] = [];
  lines.push("pie");
  if (opts.title) lines.push(`  title ${q(opts.title)}`);
  for (const slice of opts.slices) {
    lines.push(`  "${slice.label}" : ${slice.value}`);
  }
  return lines;
}

function generateGitGraph(opts: GitGraphOptions): string[] {
  const lines: string[] = [];
  lines.push("gitGraph");

  if (opts.branches) {
    for (const b of opts.branches) {
      lines.push(`  branch ${cleanId(b.name)}`);
    }
  }

  for (const c of opts.commits) {
    const prefix = c.type === "tag" ? "  tag" : c.type === "cherry-pick" ? "  cherry-pick" : "  commit";
    lines.push(`${prefix} id: ${q(c.label)}`);
    if (c.branch !== "main") {
      // checkout if needed
      lines.push(`  checkout ${cleanId(c.branch)}`);
      lines.push(`${prefix} id: ${q(c.label)}`);
    }
  }

  return lines;
}

// ─── Public API ─────────────────────────────────────────────────────────

const GENERATORS: Record<string, (opts: any) => string[]> = {
  flowchart: generateFlowchart,
  sequenceDiagram: generateSequence,
  classDiagram: generateClassDiagram,
  erDiagram: generateER,
  gantt: generateGantt,
  stateDiagram: generateState,
  stateDiagram_v2: generateState,
  pie: generatePie,
  gitGraph: generateGitGraph,
};

/**
 * Genera un diagrama Mermaid válido a partir de datos estructurados.
 *
 * @example
 * ```ts
 * const md = generateMermaid({
 *   type: "flowchart",
 *   options: {
 *     direction: "TD",
 *     nodes: [
 *       { id: "start", label: "Inicio", shape: "rounded" },
 *       { id: "end", label: "Fin", shape: "rounded" },
 *     ],
 *     edges: [
 *       { from: "start", to: "end", label: "Flujo" },
 *     ],
 *   },
 * });
 * ```
 */
export function generateMermaid(input: MermaidInput): string {
  const gen = GENERATORS[input.type];
  if (!gen) return `%% Unknown diagram type: ${input.type}`;
  const lines = gen((input as any).options);
  return "```mermaid\n" + lines.join("\n") + "\n```";
}

// ─── Validate & Fix ─────────────────────────────────────────────────────

/**
 * Valida un diagrama Mermaid existente y devuelve errores encontrados.
 * No modifica el input — solo reporta qué arreglar.
 */
export function validateMermaid(raw: string): string[] {
  const errors: string[] = [];
  if (!raw) return ["Empty mermaid content"];

  const lines = raw.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return ["Empty mermaid content"];

  const firstLine = lines[0]!.trim();

  // Detectar tipo
  const typeMatch = firstLine.match(/^(graph|flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram|stateDiagram-v2|gantt|pie|gitGraph|quadrantChart|mindmap|timeline|xychart|block|packet)/);
  if (!typeMatch) {
    errors.push(`Unknown diagram type. First line: "${firstLine}". Must start with a valid mermaid type.`);
  }

  const mermaidType = typeMatch?.[1];

  // Validaciones específicas por tipo
  if (mermaidType === "sequenceDiagram") {
    // Check for unclosed alt/opt/loop/par blocks
    const opens = lines.filter((l) => /^\s*(alt|opt|loop|par|critical|break)\s/.test(l)).length;
    const closes = lines.filter((l) => /^\s*end\s*$/.test(l)).length;
    if (opens > closes) {
      errors.push(`Unclosed block: ${opens} openers but only ${closes} closers (need +${opens - closes} "end")`);
    }
    if (closes > opens) {
      errors.push(`Too many "end": ${closes} closers but only ${opens} openers`);
    }
  }

  if (mermaidType === "flowchart" || mermaidType?.startsWith("graph")) {
    // Check for subgraphs without end
    const subs = lines.filter((l) => /^\s*subgraph\s/.test(l)).length;
    const ends = lines.filter((l) => /^\s*end\s*$/.test(l)).length;
    if (subs > ends) {
      errors.push(`Unclosed subgraph: ${subs} subgraphs but ${ends} ends`);
    }
  }

  // ID sin espacios
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    // Check node IDs with spaces in flowchart
    if (mermaidType === "flowchart" || mermaidType?.startsWith("graph")) {
      const nodeIdMatch = l.match(/^\s*([A-Za-z]\w*\s+\w+)\[/);
      if (nodeIdMatch) {
        errors.push(`Line ${i + 1}: Node ID "${nodeIdMatch[1]}" contains spaces`);
      }
    }
  }

  return errors;
}

/**
 * Normaliza un diagrama Mermaid existente — corrige errores comunes:
 * - IDs con espacios → reemplazados por underscore
 * - Bloques sequence sin cerrar → agrega `end`
 * - Subgraphs sin cerrar → agrega `end`
 * - Quotes inconsistentes → normaliza a double quotes
 * - Líneas en blanco excesivas → compacta
 */
/** Normaliza solo el cuerpo del diagrama (sin fences). */
export function normalizeMermaidDiagramBody(raw: string): string {
  if (!raw?.trim()) return "";

  const lines = raw.trim().split("\n");
  const out: string[] = [];
  let openBlocks = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;

    if (/^(graph|flowchart)\s/i.test(line.trim())) {
      out.push(line);
      continue;
    }

    if (/^\s*subgraph\s/.test(line.trim())) openBlocks++;
    if (/^\s*(alt|opt|loop|par|critical|break)\s/.test(line.trim())) openBlocks++;
    if (/^\s*end\s*$/.test(line.trim())) openBlocks = Math.max(0, openBlocks - 1);

    line = line.replace(/(\w+)\s+(\w+)(\[|\()/g, (_match, p1: string, p2: string, p3: string) => {
      return `${cleanId(p1)}_${cleanId(p2)}${p3}`;
    });

    out.push(line);
  }

  for (let i = 0; i < openBlocks; i++) out.push("  end");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Un solo bloque ```mermaid … ``` (entrada puede incluir fences). */
export function normalizeMermaid(raw: string): string {
  if (!raw?.trim()) return raw ?? "";
  const text = raw
    .replace(/^```mermaid\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const body = normalizeMermaidDiagramBody(text);
  if (!body) return raw;
  return `\`\`\`mermaid\n${body}\n\`\`\``;
}

/** Normaliza cada bloque mermaid del documento sin tocar el resto del markdown. */
export function normalizeMermaidInDocument(document: string): string {
  if (!document?.trim()) return document ?? "";
  return document.replace(/```mermaid\s*\n([\s\S]*?)```/gi, (_block, inner: string) => {
    const body = normalizeMermaidDiagramBody(inner);
    return body ? `\`\`\`mermaid\n${body}\n\`\`\`` : "```mermaid\n```";
  });
}
