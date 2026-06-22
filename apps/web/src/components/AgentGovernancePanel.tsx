import { useEffect, useMemo, useState } from "react";
import { BookOpen, Bot, ChevronRight, FileCode, FileText, Folder, Sparkles } from "lucide-react";
import {
  migrateGovernancePath,
  parseAgentGovernanceScaffold,
  type AgentGovernanceFile,
  type AgentGovernanceScaffold,
} from "@theforge/shared-types";
import MddViewer from "@/components/MddViewer";
import { cn } from "@/lib/utils";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  file?: AgentGovernanceFile;
}

/** Rutas como en repo destino / ZIP aplanado (sin prefijo `agent-governance/`). */
function normalizeScaffoldForDisplay(scaffold: AgentGovernanceScaffold): AgentGovernanceScaffold {
  const byPath = new Map<string, AgentGovernanceFile>();
  for (const file of scaffold.files) {
    const path = migrateGovernancePath(file.path);
    if (!path || path === "MANIFEST.json") continue;
    byPath.set(path, { path, content: file.content });
  }
  const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    ...scaffold,
    manifest: { ...scaffold.manifest, files: files.map((f) => f.path) },
    files,
  };
}

function buildFileTree(files: AgentGovernanceFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = file.path.split("/").filter(Boolean);
    let level = root;
    let acc = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const isLast = i === segments.length - 1;
      acc = acc ? `${acc}/${segment}` : segment;
      let node = level.find((n) => n.name === segment && n.isDir === !isLast);
      if (!node) {
        node = {
          name: segment,
          path: acc,
          isDir: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        level.push(node);
      } else if (isLast) {
        node.file = file;
        node.isDir = false;
      }
      level = node.children;
    }
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    [...nodes]
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map((n) => ({ ...n, children: sortNodes(n.children) }));

  return sortNodes(root);
}

const COMO_USAR_PATH = "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md";
const INSTALACION_PATH = "docs/agent-governance/INSTALACION.md";

function fileIcon(path: string) {
  if (path.endsWith(".md") || path.endsWith(".mdc")) return FileText;
  if (path.endsWith(".json")) return FileCode;
  return FileText;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = !node.isDir && node.file && selectedPath === node.file.path;
  const Icon = node.isDir ? Folder : fileIcon(node.path);

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]",
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform", open && "rotate-90")}
            aria-hidden
          />
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {open ? (
          <div>
            {node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => node.file && onSelect(node.file.path)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--muted)]",
        isSelected
          ? "bg-[color-mix(in_oklch,var(--primary)_12%,var(--background))] text-[var(--foreground)]"
          : "text-[var(--muted-foreground)]",
      )}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function AgentGovernancePanel({
  scaffold: scaffoldProp,
  rawContent,
  viewMode,
  loading = false,
}: {
  /** Scaffold reconciliado (export API); preferido sobre `rawContent`. */
  scaffold?: AgentGovernanceScaffold | null;
  rawContent?: string | null;
  viewMode: "preview" | "source";
  loading?: boolean;
}) {
  const scaffold = useMemo(() => {
    const base = scaffoldProp ?? parseAgentGovernanceScaffold(rawContent);
    if (!base) return null;
    return normalizeScaffoldForDisplay(base);
  }, [scaffoldProp, rawContent]);
  const tree = useMemo(() => (scaffold ? buildFileTree(scaffold.files) : []), [scaffold]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const hasComoUsar = useMemo(
    () => scaffold?.files.some((f) => f.path === COMO_USAR_PATH) ?? false,
    [scaffold],
  );
  const hasInstalacion = useMemo(
    () => scaffold?.files.some((f) => f.path === INSTALACION_PATH) ?? false,
    [scaffold],
  );
  const suggestions = scaffold?.manifest.suggestions;
  const suggestionCount =
    suggestions?.entries?.length ??
    (suggestions?.rationale?.length ? suggestions.rationale.length : 0);

  useEffect(() => {
    if (!scaffold) return;
    if (scaffold.files.some((f) => f.path === COMO_USAR_PATH)) {
      setSelectedPath(COMO_USAR_PATH);
    }
  }, [scaffold]);

  const selectedFile = useMemo(() => {
    if (!scaffold) return null;
    const defaultPath = scaffold.files.some((f) => f.path === COMO_USAR_PATH)
      ? COMO_USAR_PATH
      : (scaffold.files[0]?.path ?? null);
    const path = selectedPath ?? defaultPath;
    if (!path) return null;
    return scaffold.files.find((f) => f.path === path) ?? scaffold.files[0] ?? null;
  }, [scaffold, selectedPath]);

  if (loading) {
    return (
      <p className="p-4 text-sm text-[var(--muted-foreground)]">Cargando paquete reconciliado…</p>
    );
  }

  if (!scaffold) return null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:flex-row lg:gap-4">
      <aside
        className="flex max-h-[min(40vh,16rem)] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_35%,var(--background))] lg:max-h-none lg:w-56 xl:w-64"
        aria-label="Árbol del paquete handoff en raíz del repo"
      >
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-[var(--border)] px-3 py-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--foreground)]">Raíz del repo (handoff)</p>
              <p className="truncate text-[10px] text-[var(--muted-foreground)]">
                v{scaffold.manifest.templateVersion} · {scaffold.files.length} archivos · docs/agent-governance, docs/sdd
              </p>
            </div>
          </div>
          {hasComoUsar ? (
            <button
              type="button"
              onClick={() => setSelectedPath(COMO_USAR_PATH)}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--primary)_25%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_8%,var(--background))] px-2 py-1.5 text-left text-[10px] font-medium text-[var(--foreground)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_14%,var(--background))]"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
              <span className="truncate">Empieza por COMO-USAR-GOBERNANZA-IA.md</span>
            </button>
          ) : null}
          {hasInstalacion ? (
            <button
              type="button"
              onClick={() => setSelectedPath(INSTALACION_PATH)}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--primary)_18%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_6%,var(--background))] px-2 py-1.5 text-left text-[10px] font-medium text-[var(--foreground)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_12%,var(--background))]"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
              <span className="truncate">Instalar: INSTALACION.md</span>
            </button>
          ) : null}
          {suggestions && suggestionCount > 0 ? (
            <div
              className="rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--primary)_18%,var(--border))] bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] px-2 py-1.5"
              title={suggestions.rationale?.join("\n")}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--foreground)]">
                <Sparkles className="h-3 w-3 shrink-0 text-[var(--primary)]" aria-hidden />
                <span>Sugeridos por el proyecto</span>
              </div>
              {suggestions.archetypes?.length ? (
                <p className="mt-0.5 truncate text-[9px] text-[var(--muted-foreground)]">
                  {suggestions.archetypes.join(" · ")}
                </p>
              ) : null}
              {suggestions.entries?.length ? (
                <p className="mt-0.5 text-[9px] text-[var(--muted-foreground)]">
                  {suggestions.entries.length} artefacto{suggestions.entries.length === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1 [-webkit-overflow-scrolling:touch]">
          {tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedFile?.path ?? null}
              onSelect={setSelectedPath}
            />
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
        {selectedFile ? (
          <>
            <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
              <p className="truncate font-mono text-xs text-[var(--muted-foreground)]">{selectedFile.path}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {viewMode === "preview" ? (
                <MddViewer content={selectedFile.content} />
              ) : (
                <pre className="m-0 whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-[var(--foreground)]">
                  {selectedFile.content}
                </pre>
              )}
            </div>
          </>
        ) : (
          <p className="p-4 text-sm text-[var(--muted-foreground)]">Selecciona un archivo del árbol.</p>
        )}
      </div>
    </div>
  );
}

export function agentGovernanceScaffoldFromContent(
  raw: string | null | undefined,
): AgentGovernanceScaffold | null {
  return parseAgentGovernanceScaffold(raw);
}
