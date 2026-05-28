import { Component, memo, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { repairMarkdownFences } from "@theforge/shared-types/markdown-repair";
import { stripMarkdownLeakFromMermaidDiagramBody } from "@theforge/shared-types/mermaid";
import { parseMarkdownSections } from "../utils/markdownSections";

/** Quita bloques ```mermaid vacíos para no intentar renderizarlos (evita SVG de error). */
function stripBrokenMermaidBlocks(content: string): string {
  return content.replace(/^```mermaid\s*\r?\n\s*```\s*$/gm, "");
}

/** Solo espacios ASCII (0x20). Nunca &nbsp; ni espacios Unicode en bloques de código (SQL, JSON, etc.). */
function normalizeCodeBlockToAsciiSpaces(content: string): string {
  return (content ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/** Indentación: solo 2 espacios ASCII por nivel; sin espacios al final (ya aplicado en base). */
function normalizeMermaidIndent(line: string): string {
  const m = line.match(/^(\s*)/);
  const len = m?.[1]?.length ?? 0;
  const rest = line.slice(len);
  return "  ".repeat(Math.floor(len / 2)) + rest;
}

/**
 * Mermaid v11.15.0 no soporta paréntesis `()` dentro de corchetes `[]` en etiquetas de nodo
 * (graph TD, flowchart, etc.). Ej: `C[NestJS API (Contenedor)]` causa "Parse error".
 * La solución es envolver la etiqueta en comillas dobles: `C["NestJS API (Contenedor)"]`.
 * No afecta a nodos ya entrecomillados ni a nodos sin paréntesis.
 */
function normalizeParensInBrackets(content: string): string {
  return content.replace(/\[([^\[\]"]*\([^()]*\)[^\[\]"]*)\]/g, '["$1"]');
}

/** Normalización universal para cualquier tipo de diagrama Mermaid:
 *  espacios Unicode → ASCII, tabs → espacios, trailing whitespace,
 *  paréntesis dentro de corchetes → comillas dobles.
 *  NO se eliminan caracteres no-ASCII (á, é, í, ó, ú, ñ, æ, etc.).
 *  Aplica a todos los tipos: graph, flowchart, sequenceDiagram, stateDiagram, etc. */
function normalizeMermaidContent(content: string): string {
  const base = normalizeParensInBrackets(content)
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, " ")
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  if (!base) return "";
  return base
    .split("\n")
    .map(normalizeMermaidIndent)
    .join("\n")
    .trim();
}

/**
 * Inline de normalizeMermaid desde shared-types para evitar dependencia build-time
 * que rompe el Docker build (el dist/ local viejo se copia al contenedor).
 * Corrige IDs con espacios, bloques sin cerrar, quotes inconsistentes, etc.
 */
function normalizeMermaidExpert(raw: string): string {
  if (!raw?.trim()) return raw ?? "";
  try {
    const lines = raw.split("\n");
    const out: string[] = [];
    let openBlocks = 0;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!;

      // Skip the graph/flowchart declaration (pass through)
      if (/^(graph|flowchart)\s/i.test(line.trim())) {
        out.push(line);
        continue;
      }

      const trimmed = line.trim();

      // Track subgraph openings
      if (/^subgraph\s/.test(trimmed)) openBlocks++;
      // Track alt/opt/loop/par/critical/break openings
      if (/^(alt|opt|loop|par|critical|break)\s/.test(trimmed)) openBlocks++;
      // Track end closings
      if (/^end\s*$/.test(trimmed)) openBlocks = Math.max(0, openBlocks - 1);

      // Fix IDs with spaces in node definitions: "Client Browser[" → "Client_Browser["
      line = line.replace(/(\w+)\s+(\w+)(\[|\()/g, (_m, p1: string, p2: string, p3: string) => {
        return `${p1.replace(/\s+/g, "_")}_${p2.replace(/\s+/g, "_")}${p3}`;
      });

      out.push(line);
    }

    // Close unclosed blocks
    for (let i = 0; i < openBlocks; i++) out.push("  end");

    let result = out.join("\n");
    // Remove excessive blank lines
    result = result.replace(/\n{3,}/g, "\n\n");
    return result.trim();
  } catch {
    return raw;
  }
}

/**
 * Corrige errores sintácticos comunes en sequenceDiagram generados por IA:
 * 1. Si falta "sequenceDiagram" pero empieza con participant → lo agrega.
 * 2. `F -->U` (espacio + dash simple) → `F-->>U` (doble dash + arrow).
 * 3. `APART-->>API 409` (falta ":") → `APART-->>API: 409`.
 * 4. `APART>>DB` (falta dash) → `APART->>DB`.
 * 5. Líneas sueltas sin arrow (ej. "DB OK") → se convierten a `Note over B: texto`.
 *    Si no se puede determinar el participante, se ignoran (mejor que error de parse).
 */
function prepareMermaidForRender(content: string): string {
  const stripped = stripMarkdownLeakFromMermaidDiagramBody(content);
  const expertNormalized = normalizeMermaidExpert(stripped);
  const sequenced = /sequenceDiagram/i.test(expertNormalized)
    ? normalizeMermaidSequenceSyntax(expertNormalized)
    : expertNormalized;
  return /erDiagram/i.test(sequenced)
    ? normalizeMermaidForRender(sequenced)
    : normalizeMermaidFirstLineKeywords(normalizeMermaidContent(sequenced));
}

function normalizeMermaidSequenceSyntax(content: string): string {
  // Solo aplicar a sequence diagrams
  if (!/sequenceDiagram/i.test(content)) return content;

  // Trim whitespace per line uniformly before parsing
  const lines = content.trim().split("\n");
  const out: string[] = [];

  // 1. Si después de "sequenceDiagram" la siguiente línea no es un participante/actor,
  //    o si falta "sequenceDiagram" por completo y arranca con participant → lo inserta
  let hasSeqDiag = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^sequenceDiagram$/i.test(t)) { hasSeqDiag = true; break; }
  }
  if (!hasSeqDiag) {
    // Check if first meaningful line is a participant/actor
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^(participant|actor)\s/i.test(t)) {
        out.push("sequenceDiagram");
        break;
      }
      break; // Don't add for non-participant starts
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();

    // Skip empty lines, comments, and keywords
    if (!trimmed) { out.push(raw); continue; }
    if (
      /^```|^#{1,6}\s|^\*\*TechnicalMetadata\*\*|^TechnicalMetadata\s*:?\s*$|^-\s*`/i.test(trimmed)
    ) {
      break;
    }
    if (/^(sequenceDiagram|participant|actor|Note\s|alt|else|end|loop|opt|par|rect|critical|break)\b/i.test(trimmed)) {
      out.push(raw);
      continue;
    }

    // 2. Fix space in arrow: `F -->U` → `F-->>U`
    let fixed = trimmed.replace(/(\w+)\s+-->\s*(\w+)/g, "$1-->>$2");

    // 3. Fix missing colon after participant arrow: `APART-->>API 409` → `APART-->>API: 409`
    //    Pattern: word-->>word <digits or words without colon>
    fixed = fixed.replace(/(-->>[A-Za-z_]\w*)\s+(\d[\d\s{])/g, "$1: $2");
    fixed = fixed.replace(/(-->>[A-Za-z_]\w*)\s+(\{)/g, "$1: $2");

    // 4. Fix missing dash: `APART>>DB` → `APART->>DB`
    fixed = fixed.replace(/([A-Za-z_]\w*)>>([A-Za-z_])/g, "$1->>$2");

    // 5. Bare label lines (no arrow pattern): convert to Note with default participant
    //    Pattern: just text with no `->`, `-->>`, `-->`, `::`, `|`
    if (!/->|-->>|-->/.test(fixed) && !/^\s*(Note|alt|else|end|loop)/.test(fixed)) {
      // Check if it looks like a bare label (not a code comment or directive)
      if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ\s,:]+$/i.test(fixed.trim())) {
        // Try to extract participant from context (last seen participant)
        let lastParticipant = "B";
        for (let j = i - 1; j >= 0; j--) {
          const p = lines[j]!.trim();
          const pm = p.match(/^participant\s+(\w+)/i);
          if (pm?.[1]) { lastParticipant = pm[1]; break; }
          const am = p.match(/^(\w+)(?:--?>>?|->>?)/);
          if (am?.[1]) { lastParticipant = am[1]; break; }
        }
        fixed = `Note over ${lastParticipant}: ${fixed.trim()}`;
      }
    }

    out.push(fixed);
  }

  return out.join("\n");
}

/** Normalización exclusiva para erDiagram: tipos PostgreSQL → tipos Mermaid seguros. */
function normalizeErDiagramTypes(content: string): string {
  return content
    .replace(/\btimestamptz\b/gi, "datetime")
    .replace(/\binet\b/gi, "string")
    .replace(/\bjsonb\b/gi, "json")
    .replace(/\b(PK)\s*,\s*FK\b/gi, "$1")
    .replace(/\b(FK)\s*,\s*PK\b/gi, "$1");
}

/** Sanitiza Mermaid erDiagram: content + PG types + indent. */
function normalizeMermaidForRender(content: string): string {
  return normalizeMermaidContent(normalizeErDiagramTypes(content));
}

/**
 * El motor de Mermaid compara el tipo de diagrama en forma estricta (p. ej. solo `timeline`).
 * Exportaciones legacy a veces ponen `Timeline`; eso dispara UnknownDiagramError en el navegador.
 */
function normalizeMermaidFirstLineKeywords(content: string): string {
  const lines = content.split("\n");
  if (!lines.length) return content;
  const first = lines[0] ?? "";
  const fixed = first.replace(/^\s*timeline\b/i, (m) => m.replace(/timeline/gi, "timeline"));
  if (fixed === first) return content;
  lines[0] = fixed;
  return lines.join("\n");
}

/**
 * Tipos de diagrama Mermaid válidos (insensible a mayúsculas).
 * No usar `graph\b`: rutas `graph-internal/…` activan \b entre `h` y `-` y se parsean como Mermaid.
 * graph/flowchart legados exigen `TD|TB|LR|RL|BT`; el resto exige separador real (\s, \n o fin).
 */
const MERMAID_DIAGRAM_START =
  /^\s*(erDiagram(?:\s+|\n|$)|flowchart\s+(?:TD|TB|LR|RL|BT)\b|graph\s+(?:TD|TB|LR|RL|BT)\b|sequenceDiagram(?:\s+|\n|$)|stateDiagram(?:-v2)?(?:\s+|\n|$)|classDiagram(?:\s+|\n|$)|pie(?:\s+|\n|$)|gantt(?:\s+|\n|$)|journey(?:\s+|\n|$)|gitGraph(?:\s+|\n|$)|mindmap(?:\s+|\n|$)|timeline(?:\s+|\n|$)|blockDiagram(?:\s+|\n|$)|quadrantChart(?:\s+|\n|$)|xychart(?:\s+|\n|$)|requirementDiagram(?:\s+|\n|$))/i;

/**
 * True solo si el contenido es sintaxis Mermaid reconocible.
 * `language-mermaid` por sí solo no basta: el LLM a veces envuelve BRD/MDD en ```mermaid por error.
 */
function looksLikeMermaidBlock(source: string, _className?: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  return MERMAID_DIAGRAM_START.test(trimmed);
}

/** Theme tokens so preview text stays readable in light mode (avoids zinc-300 on pale backgrounds). */
const MARKDOWN_CLASS =
  "text-sm text-[var(--foreground)] [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-[var(--foreground)] [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--foreground)] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-[var(--foreground)] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_strong]:font-semibold [&_strong]:text-[var(--foreground)] [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-[color-mix(in_oklch,var(--muted)_78%,var(--card))] [&_pre]:p-3 [&_pre]:text-[var(--foreground)] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[var(--foreground)] [&_p_code]:rounded [&_p_code]:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] [&_p_code]:px-1 [&_p_code]:py-0.5 [&_p_code]:text-[var(--foreground)] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[color-mix(in_oklch,var(--muted)_42%,var(--card))] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[var(--foreground)] [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-3 [&_td]:py-2 [&_td]:text-[var(--foreground)]";

let mermaidInit = false;
function initMermaid() {
  if (mermaidInit) return;
  mermaidInit = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
  });
}

/** Clave estable por contenido para que React no reutilice el mismo ref entre diagramas (evita solapamiento). */
function mermaidKey(content: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(content.length, 256); i++) h = (h << 5) - h + content.charCodeAt(i);
  return `mermaid-${h >>> 0}`;
}

/** Evita que un fallo en Mermaid (parse/render) rompa todo el documento: solo este bloque muestra fallback. */
class MermaidBlockErrorBoundary extends Component<
  { content: string; blockKey: string; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error("MermaidBlockErrorBoundary:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <pre className="my-6 overflow-x-auto rounded-md border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_78%,var(--card))] p-3 text-sm text-[var(--foreground)]">
          <code>{this.props.content}</code>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]" aria-live="polite">
            No se pudo mostrar el diagrama (código fuente arriba).
          </p>
        </pre>
      );
    }
    return this.props.children;
  }
}

function MermaidBlock({ content, blockKey }: { content: string; blockKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceId = useId();
  const [error, setError] = useState<string | null>(null);
  const renderIdRef = useRef<string>("");
  if (!renderIdRef.current) {
    renderIdRef.current =
      "m" +
      instanceId.replace(/[^a-zA-Z0-9]/g, "") +
      blockKey.replace(/[^a-zA-Z0-9]/g, "") +
      "-" +
      Math.random().toString(36).slice(2, 9);
  }
  const renderId = renderIdRef.current;

  useEffect(() => {
    initMermaid();
    const el = ref.current;
    if (!el || !content.trim()) return;

    setError(null);
    let cancelled = false;
    const toRender = prepareMermaidForRender(content);
    if (!toRender) return;

    const doRender = async () => {
      try {
        const { svg, bindFunctions } = await mermaid.render(renderId, toRender);
        if (cancelled || !el) return;
        el.innerHTML = svg;
        bindFunctions?.(el);
      } catch (e) {
        if (!cancelled) {
          console.error("Mermaid render error:", e);
          setError("render_failed");
        }
      }
    };

    doRender();

    return () => {
      cancelled = true;
    };
  }, [content, blockKey, renderId]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_78%,var(--card))] p-3 text-sm text-[var(--foreground)]">
        <code>{content}</code>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]" aria-live="polite">
          No se pudo mostrar el diagrama (código fuente arriba).
        </p>
      </pre>
    );
  }
  return (
    <div
      className="my-6 block w-full min-w-0 [isolation:isolate] overflow-x-auto"
      aria-label="Diagrama Mermaid"
    >
      <div
        ref={ref}
        className="flex justify-center min-h-[120px] [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:min-w-0"
      />
    </div>
  );
}

const MdSection = memo(function MdSection({ content }: { content: string }) {
  return (
    <div className={MARKDOWN_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }) {
            // mdast: node.value; hast: node.children[].value; React children (v10 puede pasar nodos)
            const fromNode =
              node && typeof node === "object" && "value" in node && typeof (node as { value?: string }).value === "string"
                ? (node as { value: string }).value
                : "";
            const fromHast =
              node &&
              typeof node === "object" &&
              "children" in node &&
              Array.isArray((node as { children?: unknown[] }).children)
                ? (node as { children: Array<{ type?: string; value?: string }> }).children
                    .filter((c) => c?.type === "text" && typeof c.value === "string")
                    .map((c) => c.value)
                    .join("")
                : "";
            const fromChildren =
              Array.isArray(children) && children.every((c) => typeof c === "string")
                ? (children as string[]).join("")
                : typeof children === "string"
                  ? children
                  : String(children ?? "");
            const source = (fromNode || fromHast || fromChildren).replace(/\n$/, "").trim();
            const looksLikeMetadataOnly = /^\[\w+\](\s+\[\w+\])*$/.test(source.trim());
            if (looksLikeMetadataOnly) {
              return (
                <span className="text-xs text-[var(--muted-foreground)]" aria-label="Metadata técnica">
                  {source}
                </span>
              );
            }
            if (looksLikeMermaidBlock(source, className) && source.trim()) {
              const trimmed = source.trim();
              const normalized = prepareMermaidForRender(trimmed);
              const key = mermaidKey(normalized);
              return (
                <MermaidBlockErrorBoundary content={normalized} blockKey={key}>
                  <MermaidBlock key={key} blockKey={key} content={normalized} />
                </MermaidBlockErrorBoundary>
              );
            }
            return (
              <code className={className} {...props}>
                {normalizeCodeBlockToAsciiSpaces(source)}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

interface MddViewerProps {
  content: string;
  className?: string;
}

class MddViewerErrorBoundary extends Component<
  { content: string; className?: string; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prev: { content: string }) {
    if (prev.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch() {
    // Evita que un diagrama Mermaid roto o cualquier error en el árbol blanquee todo el front.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={`space-y-4 min-w-0 ${this.props.className ?? ""}`}>
          <p className="text-sm text-[var(--warning)]">
            Error al mostrar el documento. Contenido en modo texto:
          </p>
          <pre className="max-h-[80vh] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_78%,var(--card))] p-4 text-sm text-[var(--foreground)]">
            {this.props.content}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Visualizador de MDD por secciones: solo re-renderiza las secciones cuyo contenido cambió,
 * evitando parpadeo al hacer streaming o al actualizar el documento.
 */
function MddViewerInner({ content, className = "" }: MddViewerProps) {
  const cleaned = stripBrokenMermaidBlocks(repairMarkdownFences(content));
  const sections = parseMarkdownSections(cleaned);

  return (
    <div className={`space-y-4 markdown-preview min-w-0 ${className}`}>
      {sections.map((section) => (
        <MdSection key={section.id} content={section.content} />
      ))}
    </div>
  );
}

export default function MddViewer(props: MddViewerProps) {
  return (
    <MddViewerErrorBoundary content={props.content} className={props.className}>
      <MddViewerInner {...props} />
    </MddViewerErrorBoundary>
  );
}
