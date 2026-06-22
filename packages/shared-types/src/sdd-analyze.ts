/**
 * Unified SDD analyze report (spec-kit `/speckit.analyze` equivalent).
 */

export interface ConformanceResult {
  ok: boolean;
  gaps: string[];
}

export interface ApiConformanceResult {
  ok: boolean;
  missingInApi: string[];
  extraInApi: string[];
}

export interface SddArtifactPresence {
  present: boolean;
  wordCount: number;
}

export interface SddSpecAnalyzeSlice {
  present: boolean;
  wordCount: number;
  clarificationMarkerCount: number;
  hasPendingClarificationSection: boolean;
}

export interface SddTasksAnalyzeSlice {
  present: boolean;
  totalTasks: number;
  openTasks: number;
  doneTasks: number;
  parallelizableOpen: number;
  checkpoints: string[];
}

export interface SddAgentGovernanceAnalyzeSlice {
  present: boolean;
  fileCount: number;
  missingRequiredPaths: string[];
  hasInstallGuide: boolean;
  /** True when docs/sdd mirror paths exist in the governance scaffold. */
  pathAlignmentOk: boolean;
}

export interface SddAnalyzeConformance {
  blueprint: ConformanceResult;
  blueprintDataModel: ConformanceResult;
  api: ApiConformanceResult;
  logicFlows: ConformanceResult;
  infra: ConformanceResult;
}

export type SddAnalyzeStatus = "ok" | "warnings" | "blocked";

export interface SddAnalyzeReport {
  generatedAt: string;
  projectId: string;
  projectName: string;
  featureDir: string;
  semaphore: "ROJO" | "AMARILLO" | "VERDE" | null;
  artifacts: {
    mdd: SddArtifactPresence;
    spec: SddSpecAnalyzeSlice;
    blueprint: SddArtifactPresence;
    tasks: SddTasksAnalyzeSlice;
    apiContracts: SddArtifactPresence;
    logicFlows: SddArtifactPresence;
    infra: SddArtifactPresence;
    agentGovernance: SddAgentGovernanceAnalyzeSlice;
  };
  conformance: SddAnalyzeConformance;
  crossArtifactGaps: string[];
  /** Optional BRD ↔ MDD objective alignment (legacy F2). */
  brdHealth?: { ok: boolean; warnings: string[] };
  summary: {
    status: SddAnalyzeStatus;
    score: number;
    headline: string;
  };
}
