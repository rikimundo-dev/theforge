import { createHash } from "node:crypto";
import type { Project, Stage } from "@theforge/database";
import {
  buildSpecKitBundleFiles,
  GOVERNANCE_DOCS_PREFIX,
  parseAgentGovernanceScaffold,
  resolveDocumentPathMap,
  specKitFeatureDir,
  type AgentGovernanceScaffold,
  type ComplexityLevel,
  type DocumentPathEntry,
  type SddAgentGovernanceAnalyzeSlice,
  type SpecKitBundleFile,
} from "@theforge/shared-types";
import {
  appendProjectDeliverablesToScaffold,
  getRequiredAgentGovernancePaths,
  reconcileAgentGovernanceScaffold,
  serializeAgentGovernanceScaffold,
} from "../ai/utils/agent-governance.util.js";
import {
  suggestAgentGovernanceArtifacts,
  type SuggestAgentGovernanceInput,
} from "../ai/utils/suggest-agent-governance-artifacts.js";
import { pickPrimaryStage } from "./stage-helpers.js";

type ProjectWithStages = Project & { stages: Stage[] };

const SDD_MIRROR_PATHS = [
  "docs/sdd/mdd.md",
  "docs/sdd/spec.md",
  "docs/sdd/blueprint.md",
  "docs/sdd/tasks.md",
] as const;

export interface UnifiedHandoff {
  featureDir: string;
  projectName: string;
  specKitFiles: SpecKitBundleFile[];
  agentGovernance: AgentGovernanceScaffold | null;
  layout: "spec-kit-primary";
  pathMap: DocumentPathEntry[];
  governancePresent: boolean;
  /** Set when reconcile changed serialized governance (caller may persist). */
  serializedGovernance?: string;
  governancePersisted?: boolean;
}

export interface HandoffFileWithHash {
  path: string;
  content: string;
  size: number;
  sha256: string;
}

export interface HermesHandoffPayload {
  format: "spec-kit-compatible";
  featureDir: string;
  layout: "spec-kit-primary";
  implementReadme: string;
  governancePresent: boolean;
  pathMap: DocumentPathEntry[];
  files: HandoffFileWithHash[];
  governanceFiles: HandoffFileWithHash[];
  cliFallback: string;
}

/** MDD or fallback for LOW/MEDIUM without full MDD. */
export function projectConstitutionMarkdown(project: ProjectWithStages): string {
  const stage = pickPrimaryStage(project.stages);
  const mdd = (stage?.mddContent ?? "").trim();
  if (mdd.length > 0) return mdd;
  const cx = project.complexity ?? "HIGH";
  if (cx === "LOW" || cx === "MEDIUM") {
    const parts = [
      (project.dbgaContent ?? "").trim(),
      (project.phase0SummaryContent ?? "").trim(),
      (project.specContent ?? "").trim(),
    ].filter((p) => p.length > 0);
    return parts.join("\n\n---\n\n");
  }
  return "";
}

export function buildAgentGovernanceInput(
  project: Project,
  mddMarkdown: string,
  complexity: ComplexityLevel,
): SuggestAgentGovernanceInput {
  return {
    mddMarkdown,
    blueprintMarkdown: project.blueprintContent,
    tasksMarkdown: project.tasksContent,
    architectureMarkdown: project.architectureContent,
    specMarkdown: project.specContent,
    apiContractsMarkdown: project.apiContractsContent,
    logicFlowsMarkdown: project.logicFlowsContent,
    uxUiGuideMarkdown: project.uxUiGuideContent,
    infraMarkdown: project.infraContent,
    useCasesMarkdown: project.useCasesContent,
    userStoriesMarkdown: project.userStoriesContent,
    projectName: project.name,
    complexity,
  };
}

const ROOT_CONSUMPTION_GUIDE = "THEFORGE-DOC-CONSUMPTION-GUIDE.md";

function ensureRootConsumptionGuideInSpecKit(
  specKitFiles: SpecKitBundleFile[],
  agentGovernance: AgentGovernanceScaffold | null,
  consumptionGuideContent: string | null,
): SpecKitBundleFile[] {
  if (specKitFiles.some((f) => f.path === ROOT_CONSUMPTION_GUIDE)) {
    return specKitFiles;
  }
  const fromGuide = consumptionGuideContent?.trim();
  const fromGovernance = agentGovernance?.files.find((f) =>
    f.path.endsWith("THEFORGE-DOC-CONSUMPTION-GUIDE.md"),
  )?.content;
  const content = fromGuide || fromGovernance?.trim();
  if (!content) return specKitFiles;
  return [...specKitFiles, { path: ROOT_CONSUMPTION_GUIDE, content }];
}

/** Reconcile governance scaffold + inject docs/sdd deliverables (shared by export paths). */
export function reconcileExportScaffold(
  project: ProjectWithStages,
  options?: { throwIfMissing?: boolean },
): AgentGovernanceScaffold | null {
  const raw = project.agentGovernanceContent?.trim() ?? "";
  if (!raw) {
    if (options?.throwIfMissing) {
      throw new Error("No hay gobernanza de agentes generada para este proyecto.");
    }
    return null;
  }

  const scaffold = parseAgentGovernanceScaffold(raw);
  if (!scaffold) {
    if (options?.throwIfMissing) {
      throw new Error("El scaffold de gobernanza no contiene archivos válidos.");
    }
    return null;
  }

  const complexity = (project.complexity ?? "HIGH") as ComplexityLevel;
  const mdd = projectConstitutionMarkdown(project);
  const governanceInput = buildAgentGovernanceInput(project, mdd, complexity);
  const suggestions = suggestAgentGovernanceArtifacts(governanceInput);
  const stage = pickPrimaryStage(project.stages);
  const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);

  const reconciled = reconcileAgentGovernanceScaffold(scaffold, complexity, {
    suggestions,
    governanceInput,
    forceFreshOverlay: true,
    featureDir,
  });

  return appendProjectDeliverablesToScaffold(reconciled, {
    mddMarkdown: mdd,
    blueprintMarkdown: project.blueprintContent,
    specMarkdown: project.specContent,
    architectureMarkdown: project.architectureContent,
    tasksMarkdown: project.tasksContent,
    useCasesMarkdown: project.useCasesContent,
    userStoriesMarkdown: project.userStoriesContent,
    apiContractsMarkdown: project.apiContractsContent,
    logicFlowsMarkdown: project.logicFlowsContent,
    uxUiGuideMarkdown: project.uxUiGuideContent,
    infraMarkdown: project.infraContent,
  });
}

export function buildSpecKitFilesForProject(
  project: ProjectWithStages,
  consumptionGuideContent: string | null,
): SpecKitBundleFile[] {
  const stage = pickPrimaryStage(project.stages);
  const mdd = stage?.mddContent ?? projectConstitutionMarkdown(project);
  return buildSpecKitBundleFiles({
    projectName: project.name,
    featureOrdinal: stage?.ordinal ?? 1,
    mddContent: mdd,
    specContent: project.specContent,
    blueprintContent: project.blueprintContent,
    tasksContent: project.tasksContent,
    apiContractsContent: project.apiContractsContent,
    logicFlowsContent: project.logicFlowsContent,
    infraContent: project.infraContent,
    phase0SummaryContent: project.phase0SummaryContent,
    dbgaContent: project.dbgaContent,
    uxUiGuideContent: project.uxUiGuideContent,
    consumptionGuideContent,
  });
}

/** Single source of truth for repo-handoff, agent-governance-export, Hermes. */
export function buildUnifiedHandoff(
  project: ProjectWithStages,
  consumptionGuideContent: string | null,
): UnifiedHandoff {
  const stage = pickPrimaryStage(project.stages);
  const featureDir = specKitFeatureDir(stage?.ordinal ?? 1, project.name);

  const raw = project.agentGovernanceContent?.trim() ?? "";
  let agentGovernance: AgentGovernanceScaffold | null = null;
  let serializedGovernance: string | undefined;
  let governancePersisted = false;

  if (raw) {
    agentGovernance = reconcileExportScaffold(project);
    if (agentGovernance) {
      serializedGovernance = serializeAgentGovernanceScaffold(agentGovernance);
      governancePersisted = serializedGovernance !== raw;
    }
  }

  const specKitFiles = ensureRootConsumptionGuideInSpecKit(
    buildSpecKitFilesForProject(project, consumptionGuideContent),
    agentGovernance,
    consumptionGuideContent,
  );

  return {
    featureDir,
    projectName: project.name,
    specKitFiles,
    agentGovernance,
    layout: "spec-kit-primary",
    pathMap: resolveDocumentPathMap(featureDir),
    governancePresent: !!(agentGovernance?.files?.length),
    serializedGovernance,
    governancePersisted,
  };
}

export function scaffoldToRepoHandoffGovernance(scaffold: AgentGovernanceScaffold | null): {
  present: boolean;
  files: Array<{ path: string; content: string }>;
  manifest?: Record<string, unknown>;
} {
  if (!scaffold?.files?.length) {
    return { present: false, files: [] };
  }
  return {
    present: true,
    files: scaffold.files.map((f) => ({ path: f.path, content: f.content })),
    manifest: scaffold.manifest as Record<string, unknown>,
  };
}

export function analyzeAgentGovernanceSlice(
  project: ProjectWithStages,
): SddAgentGovernanceAnalyzeSlice {
  const complexity = (project.complexity ?? "HIGH") as ComplexityLevel;
  const raw = project.agentGovernanceContent?.trim() ?? "";

  if (!raw) {
    return {
      present: false,
      fileCount: 0,
      missingRequiredPaths: getRequiredAgentGovernancePaths(complexity),
      hasInstallGuide: false,
      pathAlignmentOk: false,
    };
  }

  const reconciled = reconcileExportScaffold(project);
  if (!reconciled) {
    return {
      present: false,
      fileCount: 0,
      missingRequiredPaths: getRequiredAgentGovernancePaths(complexity),
      hasInstallGuide: false,
      pathAlignmentOk: false,
    };
  }

  const paths = new Set(reconciled.files.map((f) => f.path));
  const required = getRequiredAgentGovernancePaths(complexity);
  const missingRequiredPaths = required.filter((p) => !paths.has(p));
  const installPath = `${GOVERNANCE_DOCS_PREFIX}INSTALACION.md`;
  const hasInstallGuide = paths.has(installPath);
  const mirrorsPresent = SDD_MIRROR_PATHS.filter((p) => paths.has(p)).length;
  const pathAlignmentOk = mirrorsPresent >= 3;

  return {
    present: true,
    fileCount: reconciled.files.length,
    missingRequiredPaths,
    hasInstallGuide,
    pathAlignmentOk,
  };
}

export function hashHandoffContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function toHandoffFilesWithHash(
  files: Array<{ path: string; content: string }>,
): HandoffFileWithHash[] {
  return files.map((f) => ({
    path: f.path,
    content: f.content,
    size: f.content.length,
    sha256: hashHandoffContent(f.content),
  }));
}

export function buildHermesHandoffPayload(
  unified: UnifiedHandoff,
): HermesHandoffPayload {
  const governanceFiles = unified.agentGovernance?.files ?? [];
  return {
    format: "spec-kit-compatible",
    featureDir: unified.featureDir,
    layout: unified.layout,
    implementReadme:
      "Lee IMPLEMENT.md, .specify/memory/constitution.md y tasks en specs/. " +
      "Instala agent-governance según INSTALACION.md si aplica.",
    governancePresent: unified.governancePresent,
    pathMap: unified.pathMap,
    files: toHandoffFilesWithHash(unified.specKitFiles),
    governanceFiles: toHandoffFilesWithHash(governanceFiles),
    cliFallback: `node scripts/theforge-export.mjs --project <id> --out ./handoff`,
  };
}
