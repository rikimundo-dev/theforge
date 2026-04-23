import { Component, memo, useEffect, useId, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import { repairMarkdownFences } from "@theforge/shared-types/markdown-repair";
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

/** Sanitiza Mermaid erDiagram: timestamptz→datetime, un key por atributo (PK, FK→PK), 2 espacios ASCII. */
function normalizeMermaidForRender(content: string): string {
  const base = content
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, " ")
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\btimestamptz\b/gi, "datetime")
    .replace(/\b(PK)\s*,\s*FK\b/gi, "$1")
    .replace(/\b(FK)\s*,\s*PK\b/gi, "$1")
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
 * Tipos de diagrama Mermaid válidos (insensible a mayúsculas).
 * No usar `graph\b`: rutas `graph-internal/…` activan \b entre `h` y `-` y se parsean como Mermaid.
 * graph/flowchart legados exigen `TD|TB|LR|RL|BT`; el resto exige separador real (\s, \n o fin).
 */
const MERMAID_DIAGRAM_START =
  /^\s*(erDiagram(?:\s+|\n|$)|flowchart\s+(?:TD|TB|LR|RL|BT)\b|graph\s+(?:TD|TB|LR|RL|BT)\b|sequenceDiagram(?:\s+|\n|$)|stateDiagram(?:-v2)?(?:\s+|\n|$)|classDiagram(?:\s+|\n|$)|pie(?:\s+|\n|$)|gantt(?:\s+|\n|$)|journey(?:\s+|\n|$)|gitGraph(?:\s+|\n|$)|mindmap(?:\s+|\n|$)|timeline(?:\s+|\n|$)|blockDiagram(?:\s+|\n|$)|quadrantChart(?:\s+|\n|$)|xychart(?:\s+|\n|$)|requirementDiagram(?:\s+|\n|$))/i;

/** True si el contenido parece un diagrama Mermaid (empieza por un tipo válido o tiene clase language-mermaid). */
function looksLikeMermaidBlock(source: string, className?: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) return false;
  const hasMermaidLang =
    typeof className === "string" && className.toLowerCase().includes("language-mermaid");
  return hasMermaidLang || MERMAID_DIAGRAM_START.test(trimmed);
}

const MARKDOWN_CLASS =
  "text-sm text-zinc-300 [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_pre]:bg-zinc-800 [&_pre]:p-3 [&_pre]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-zinc-600 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-zinc-600 [&_td]:px-3 [&_td]:py-2";

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
        <pre className="my-6 rounded bg-zinc-800 p-3 text-zinc-400 text-sm overflow-x-auto">
          <code>{this.props.content}</code>
          <p className="mt-2 text-zinc-500 text-xs" aria-live="polite">
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
    const toRender = /erDiagram/i.test(content) ? normalizeMermaidForRender(content) : content.trim();
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
      <pre className="rounded bg-zinc-800 p-3 text-zinc-400 text-sm overflow-x-auto">
        <code>{content}</code>
        <p className="mt-2 text-zinc-500 text-xs" aria-live="polite">
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
                <span className="text-zinc-500 text-xs" aria-label="Metadata técnica">
                  {source}
                </span>
              );
            }
            if (looksLikeMermaidBlock(source, className) && source.trim()) {
              const trimmed = source.trim();
              const normalized = /erDiagram/i.test(trimmed) ? normalizeMermaidForRender(trimmed) : trimmed;
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
          <p className="text-sm text-amber-500">
            Error al mostrar el documento. Contenido en modo texto:
          </p>
          <pre className="rounded bg-zinc-800 p-4 text-zinc-400 text-sm overflow-auto max-h-[80vh] whitespace-pre-wrap">
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
