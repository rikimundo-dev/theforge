import JSZip from "jszip";
import type { SpecKitBundleFile } from "@theforge/shared-types";
import { apiFetch, API_BASE } from "./apiClient.js";
import { addSpecKitBundleToZip } from "./downloadSpecKitBundle.js";
import {
  addAgentGovernanceEntriesToZip,
  buildAgentGovernanceZipEntries,
  buildUnifiedHandoffManifest,
  AGENT_GOVERNANCE_ZIP_ROOT,
  normalizeAgentGovernanceZipPath,
} from "./downloadAgentGovernanceZip.js";
import type { AgentGovernanceScaffold } from "@theforge/shared-types";

export interface RepoHandoffApiResponse {
  featureDir: string;
  projectName: string;
  specKitFiles: SpecKitBundleFile[];
  agentGovernance: {
    present: boolean;
    files: Array<{ path: string; content: string }>;
    manifest?: Record<string, unknown>;
  };
}

/** Descarga ZIP handoff completo (spec-kit + gobernanza aplanada en raíz del ZIP). */
export async function downloadRepoHandoffFromApi(
  projectId: string,
  projectName: string,
): Promise<boolean> {
  const r = await apiFetch(`${API_BASE}/projects/${projectId.trim()}/export/repo-handoff`);
  if (!r.ok) return false;
  const data = (await r.json()) as RepoHandoffApiResponse;
  if (!data.specKitFiles?.length) return false;

  const zip = new JSZip();
  addSpecKitBundleToZip(zip, data.specKitFiles);

  if (data.agentGovernance.present && data.agentGovernance.files.length > 0) {
    const manifestFiles = data.agentGovernance.files
      .map((f) => normalizeAgentGovernanceZipPath(f.path))
      .filter((p) => p && p !== "MANIFEST.json");
    const scaffold: AgentGovernanceScaffold = {
      manifest: {
        templateVersion: "2.0.0",
        files: manifestFiles,
        ...(data.agentGovernance.manifest ?? {}),
      },
      files: data.agentGovernance.files.map((f) => ({
        path: f.path,
        content: f.content,
      })),
    };
    const build = buildAgentGovernanceZipEntries(scaffold);
    if (build) {
      const handoffBuild = {
        ...build,
        manifest: {
          ...build.manifest,
          files: buildUnifiedHandoffManifest(build.manifest.files, data.specKitFiles),
        },
      };
      addAgentGovernanceEntriesToZip(zip, handoffBuild, { flattenToZipRoot: true });
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const safeName = (projectName || "workshop").replace(/[^\w\u00C0-\u024F\-]/gi, "-").slice(0, 80);
  const zipName = `${safeName}-repo-handoff.zip`;

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

export { AGENT_GOVERNANCE_ZIP_ROOT };
