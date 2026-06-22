import {
  resolveAriadneCodebaseMcpTarget,
  type AriadneListedProject,
} from "./ariadne-mcp-scope.util.js";

/**
 * Repository UUIDs in Ariadne to PATCH after creating a legacy Workshop project.
 * Uses list_known_projects catalog: all roots for a workspace, or the single root id.
 */
export function resolveAriadneRepositoryIdsForBrownfieldWire(
  ariadneSourceId: string,
  catalog: AriadneListedProject[] | null | undefined,
): string[] {
  const raw = ariadneSourceId.trim();
  if (!raw) return [];

  const resolved = resolveAriadneCodebaseMcpTarget(raw, catalog);
  const fromScope = resolved.scopeForScopedTools?.repoIds?.map((x) => x.trim()).filter(Boolean);
  if (fromScope?.length) return Array.from(new Set(fromScope));

  if (!catalog?.length) return [raw];

  const asWorkspace = catalog.find((p) => p.id === raw);
  if (asWorkspace) return [];

  for (const p of catalog) {
    if (p.roots?.some((r) => r.id === raw)) return [raw];
  }

  return [raw];
}

export interface AriadneBrownfieldWirePatchBody {
  theforgeProjectId: string;
  theforgeStageId: string | null;
  theforgeConvergeTriggerMode: string;
  theforgeConvergePersist: boolean;
  theforgeServiceToken?: string | null;
}

export function buildAriadneBrownfieldWirePatchBody(input: {
  workshopProjectId: string;
  workshopStageId: string;
  triggerMode: string;
  persist: boolean;
  serviceJwt?: string | null;
}): AriadneBrownfieldWirePatchBody {
  const body: AriadneBrownfieldWirePatchBody = {
    theforgeProjectId: input.workshopProjectId.trim(),
    theforgeStageId: input.workshopStageId.trim() || null,
    theforgeConvergeTriggerMode: input.triggerMode,
    theforgeConvergePersist: input.persist,
  };
  const jwt = input.serviceJwt?.trim();
  if (jwt) body.theforgeServiceToken = jwt;
  return body;
}
