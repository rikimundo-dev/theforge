import JSZip from "jszip";
import type { AgentGovernanceInstallEntry, AgentGovernanceManifest, AgentGovernanceScaffold } from "@theforge/shared-types";
import type { SpecKitBundleFile } from "@theforge/shared-types";

export const AGENT_GOVERNANCE_ZIP_ROOT = "agent-governance";

/** Prefijo visible en ZIP (paridad con `@theforge/shared-types`). */
export const GOVERNANCE_DOCS_PREFIX = "docs/agent-governance/";

const LEGACY_DOC_PATHS: Record<string, string> = {
  "docs/agent-onboarding.md": `${GOVERNANCE_DOCS_PREFIX}agent-onboarding.md`,
  "docs/COMO-USAR-GOBERNANZA-IA.md": `${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`,
};

/** Normaliza rutas del scaffold al layout visible del ZIP (sin `.cursor/`). */
export function normalizeAgentGovernanceZipPath(path: string): string {
  let normalized = path.replace(/^agent-governance\//i, "").replace(/^\/+/, "").trim();
  if (normalized.startsWith("cursor/")) {
    normalized = `.${normalized}`;
  }
  const legacyDoc = LEGACY_DOC_PATHS[normalized];
  if (legacyDoc) return legacyDoc;
  if (normalized.startsWith(".cursor/rules/")) {
    return `${GOVERNANCE_DOCS_PREFIX}rules/${normalized.slice(".cursor/rules/".length)}`;
  }
  if (normalized.startsWith(".cursor/skills/")) {
    return `${GOVERNANCE_DOCS_PREFIX}skills/${normalized.slice(".cursor/skills/".length)}`;
  }
  if (normalized.startsWith(".cursor/references/")) {
    return `${GOVERNANCE_DOCS_PREFIX}references/${normalized.slice(".cursor/references/".length)}`;
  }
  if (normalized === ".cursor/mcp.json") {
    return `${GOVERNANCE_DOCS_PREFIX}mcp.json.example`;
  }
  return normalized;
}

function governanceInstallTarget(source: string): string | null {
  if (source.startsWith(`${GOVERNANCE_DOCS_PREFIX}rules/`)) {
    return `.cursor/rules/${source.slice(`${GOVERNANCE_DOCS_PREFIX}rules/`.length)}`;
  }
  if (source.startsWith(`${GOVERNANCE_DOCS_PREFIX}skills/`)) {
    return `.cursor/skills/${source.slice(`${GOVERNANCE_DOCS_PREFIX}skills/`.length)}`;
  }
  if (source.startsWith(`${GOVERNANCE_DOCS_PREFIX}references/`)) {
    return `.cursor/references/${source.slice(`${GOVERNANCE_DOCS_PREFIX}references/`.length)}`;
  }
  if (source === `${GOVERNANCE_DOCS_PREFIX}mcp.json.example`) {
    return ".cursor/mcp.json";
  }
  if (source.startsWith(`${GOVERNANCE_DOCS_PREFIX}agents/`)) {
    return `.cursor/agents/${source.slice(`${GOVERNANCE_DOCS_PREFIX}agents/`.length)}`;
  }
  if (source.startsWith(`${GOVERNANCE_DOCS_PREFIX}commands/`)) {
    return `.cursor/commands/${source.slice(`${GOVERNANCE_DOCS_PREFIX}commands/`.length)}`;
  }
  return null;
}

/** Fusiona rutas de gobernanza y spec-kit en `manifest.files` (implement/repo handoff). */
export function buildUnifiedHandoffManifest(
  governancePaths: string[],
  specKitFiles?: SpecKitBundleFile[],
): string[] {
  const specKitPaths = (specKitFiles ?? [])
    .map((f) => f.path.trim())
    .filter((p) => p && p !== "MANIFEST.json");
  return [...new Set([...governancePaths, ...specKitPaths])].sort((a, b) =>
    a.localeCompare(b),
  );
}

function buildGovernanceInstallMap(zipPaths: string[]): AgentGovernanceInstallEntry[] {
  const entries: AgentGovernanceInstallEntry[] = [];
  for (const source of zipPaths) {
    const target = governanceInstallTarget(source);
    if (target) entries.push({ source, target });
  }
  return entries.sort((a, b) => a.source.localeCompare(b.source));
}

function defaultMcpJsonPlaceholder(): string {
  return JSON.stringify(
    {
      mcpServers: {
        example: {
          url: "{{API_URL}}",
          headers: {
            Authorization: "Bearer {{PROJECT_ID}}",
          },
        },
      },
    },
    null,
    2,
  );
}

/** MEDIUM/HIGH: references o rules/skills bajo `docs/agent-governance/`. */
function shouldIncludeMcpPlaceholder(files: AgentGovernanceScaffold["files"]): boolean {
  return files.some((file) => {
    const path = normalizeAgentGovernanceZipPath(file.path);
    return (
      path.startsWith(`${GOVERNANCE_DOCS_PREFIX}references/`) ||
      path.startsWith(`${GOVERNANCE_DOCS_PREFIX}rules/`) ||
      path.startsWith(`${GOVERNANCE_DOCS_PREFIX}skills/`)
    );
  });
}

/** Añade archivos spec-kit en la raíz del ZIP (evita importar downloadSpecKitBundle en tests). */
function addSpecKitBundleToZip(zip: JSZip, files: SpecKitBundleFile[]): void {
  for (const file of files) {
    zip.file(file.path, file.content, { createFolders: true });
  }
}

export interface AgentGovernanceZipBuildResult {
  entries: Map<string, string>;
  manifest: AgentGovernanceManifest;
}

/**
 * Construye entradas del ZIP desde `scaffold.files`.
 * Reescribe rutas legacy `.cursor/` → `docs/agent-governance/`; el ZIP no contiene `.cursor/`.
 */
export function buildAgentGovernanceZipEntries(
  scaffold: AgentGovernanceScaffold,
): AgentGovernanceZipBuildResult | null {
  if (!scaffold.files.length) return null;

  const entries = new Map<string, string>();

  for (const file of scaffold.files) {
    const path = normalizeAgentGovernanceZipPath(file.path);
    if (!path || path === "MANIFEST.json") continue;
    if (path.startsWith(".cursor/")) continue;
    entries.set(path, file.content);
  }

  const mcpExample = `${GOVERNANCE_DOCS_PREFIX}mcp.json.example`;
  if (shouldIncludeMcpPlaceholder(scaffold.files) && !entries.has(mcpExample)) {
    entries.set(mcpExample, defaultMcpJsonPlaceholder());
  }

  const paths = [...entries.keys()].sort((a, b) => a.localeCompare(b));
  const manifest: AgentGovernanceManifest = {
    ...scaffold.manifest,
    templateVersion: scaffold.manifest.templateVersion,
    files: paths,
    installMap: buildGovernanceInstallMap(paths),
  };

  return { entries, manifest };
}

export interface AgentGovernanceZipOptions {
  /** Repo-handoff: escribe entradas en la raíz del ZIP (sin prefijo `agent-governance/`). */
  flattenToZipRoot?: boolean;
}

/** Añade entradas al ZIP; por defecto bajo `agent-governance/`, o en raíz si `flattenToZipRoot`. */
export function addAgentGovernanceEntriesToZip(
  zip: JSZip,
  build: AgentGovernanceZipBuildResult,
  options?: AgentGovernanceZipOptions,
): void {
  const prefix = options?.flattenToZipRoot ? "" : `${AGENT_GOVERNANCE_ZIP_ROOT}/`;
  for (const [path, content] of build.entries) {
    zip.file(`${prefix}${path}`, content, { createFolders: true });
  }
  zip.file(
    `${prefix}MANIFEST.json`,
    JSON.stringify(build.manifest, null, 2),
    { createFolders: false },
  );
}

/**
 * Empaqueta el scaffold y dispara la descarga en el navegador.
 * Todo el contenido de gobernanza va bajo `docs/agent-governance/` (visible).
 */
export function logAgentGovernanceZipBuild(
  build: AgentGovernanceZipBuildResult,
  source: "scaffold" | "export" = "scaffold",
): void {
  const paths = [...build.entries.keys()];
  const governancePaths = paths.filter((p) => p.startsWith(GOVERNANCE_DOCS_PREFIX));
  const cursorLeak = paths.filter((p) => p.startsWith(".cursor/"));
  const payload = {
    source,
    totalEntries: build.entries.size,
    governanceEntries: governancePaths.length,
    cursorLeakCount: cursorLeak.length,
    governancePaths,
    allPaths: paths.sort((a, b) => a.localeCompare(b)),
    manifestFiles: build.manifest.files.length,
    installMapCount: build.manifest.installMap?.length ?? 0,
  };
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.info("[agent-governance-zip]", payload);
  }
}

export async function downloadAgentGovernanceZip(
  scaffold: AgentGovernanceScaffold,
  projectName: string,
  specKitBundle?: SpecKitBundleFile[],
  zipOptions?: AgentGovernanceZipOptions,
): Promise<boolean> {
  const build = buildAgentGovernanceZipEntries(scaffold);
  if (!build || build.entries.size === 0) return false;

  logAgentGovernanceZipBuild(build, "export");

  const zip = new JSZip();
  const handoffBuild =
    specKitBundle?.length
      ? {
          ...build,
          manifest: {
            ...build.manifest,
            files: buildUnifiedHandoffManifest(build.manifest.files, specKitBundle),
          },
        }
      : build;
  addAgentGovernanceEntriesToZip(zip, handoffBuild, { flattenToZipRoot: true, ...zipOptions });
  if (specKitBundle?.length) {
    addSpecKitBundleToZip(zip, specKitBundle);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = (projectName || "workshop").replace(/[^\w\u00C0-\u024F\-]/gi, "-").slice(0, 80);
  const suffix = specKitBundle?.length ? "-implement-handoff" : "-agent-governance";
  const zipName = `${safeName}${suffix}.zip`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = zipName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
