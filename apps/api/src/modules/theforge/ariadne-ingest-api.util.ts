/**
 * Resolve Ariadne ingest REST base URL and auth for PATCH /repositories/:id (brownfield converge wiring).
 * MCP tools cannot mutate repo config; this uses the same host/token family as THEFORGE_MCP_URL.
 */

export type AriadneBrownfieldConvergeMode = "off" | "full" | "incremental" | "all";

export interface AriadneIngestApiConfig {
  /** e.g. https://relicai.obp.mx/api or http://ingest:3002 */
  baseUrl: string;
  /** Bearer token (ari_* MCP secret or session JWT). */
  bearerToken: string;
  /** When true, paths are /repositories/:id (direct ingest). When false, /api/repositories/:id. */
  directIngest: boolean;
}

const VALID_MODES = new Set<AriadneBrownfieldConvergeMode>(["off", "full", "incremental", "all"]);

export function normalizeAriadneBrownfieldConvergeMode(
  raw: string | undefined,
): AriadneBrownfieldConvergeMode {
  const v = (raw ?? "incremental").trim() as AriadneBrownfieldConvergeMode;
  return VALID_MODES.has(v) ? v : "incremental";
}

export function isAriadneBrownfieldConvergeAutoEnabled(): boolean {
  const v = process.env.ARIADNE_BROWNFIELD_CONVERGE_AUTO?.trim().toLowerCase();
  if (!v) return true;
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

/**
 * Derive REST API base from MCP URL: `https://host/mcp` → `https://host/api`.
 */
export function deriveAriadneApiBaseFromMcpUrl(mcpUrl: string): string | null {
  const trimmed = mcpUrl.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.pathname.endsWith("/mcp")) {
      u.pathname = u.pathname.replace(/\/mcp\/?$/, "/api");
    } else if (!u.pathname.includes("/api")) {
      u.pathname = "/api";
    }
    return `${u.origin}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveAriadneIngestApiConfig(input: {
  mcpUrl?: string | null;
  explicitIngestUrl?: string | null;
  userMcpUrl?: string | null;
  userMcpToken?: string | null;
  envMcpToken?: string | null;
}): AriadneIngestApiConfig | null {
  const explicit = input.explicitIngestUrl?.trim();
  if (explicit) {
    const bearer =
      input.userMcpToken?.trim() ||
      input.envMcpToken?.trim() ||
      "";
    if (!bearer) return null;
    return { baseUrl: explicit.replace(/\/$/, ""), bearerToken: bearer, directIngest: true };
  }

  const mcpUrl = input.userMcpUrl?.trim() || input.mcpUrl?.trim() || "";
  const apiBase = deriveAriadneApiBaseFromMcpUrl(mcpUrl);
  const bearer = input.userMcpToken?.trim() || input.envMcpToken?.trim() || "";
  if (!apiBase || !bearer) return null;
  return { baseUrl: apiBase, bearerToken: bearer, directIngest: false };
}

export function buildAriadneRepositoryPatchUrl(
  config: AriadneIngestApiConfig,
  repositoryId: string,
): string {
  const id = encodeURIComponent(repositoryId.trim());
  if (config.directIngest) {
    return `${config.baseUrl}/repositories/${id}`;
  }
  return `${config.baseUrl}/repositories/${id}`;
}
