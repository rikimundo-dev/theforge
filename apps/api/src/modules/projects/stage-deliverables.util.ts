import {
  readStageDeliverableSnapshot,
  resolveStageDeliverableField,
  type ProjectDeliverableSource,
  type StageDeliverablesResponse,
} from "@theforge/shared-types";

const DELIVERABLE_KEYS: (keyof ProjectDeliverableSource)[] = [
  "specContent",
  "architectureContent",
  "useCasesContent",
  "userStoriesContent",
  "blueprintContent",
  "tasksContent",
  "apiContractsContent",
  "logicFlowsContent",
  "infraContent",
  "agentGovernanceContent",
  "uxUiGuideContent",
  "phase0SummaryContent",
  "aemContent",
];

export type ResolveStageDeliverablesMode = "workshop" | "analyze";

function buildDeliverablesFromSnapshot(
  snapshot: NonNullable<ReturnType<typeof readStageDeliverableSnapshot>>,
  project: ProjectDeliverableSource,
): ProjectDeliverableSource {
  const deliverables: ProjectDeliverableSource = {};
  for (const key of DELIVERABLE_KEYS) {
    deliverables[key] = resolveStageDeliverableField(key, snapshot, project) ?? null;
  }
  return deliverables;
}

function buildLiveDeliverables(project: ProjectDeliverableSource): ProjectDeliverableSource {
  const deliverables: ProjectDeliverableSource = {};
  for (const key of DELIVERABLE_KEYS) {
    deliverables[key] = project[key] ?? null;
  }
  return deliverables;
}

export function resolveStageDeliverables(
  project: ProjectDeliverableSource,
  stage: {
    id: string;
    ordinal: number;
    workflowStatus: string;
    deliverableSnapshot?: unknown;
  },
  mode: ResolveStageDeliverablesMode = "workshop",
): StageDeliverablesResponse {
  const snapshot = readStageDeliverableSnapshot(stage.deliverableSnapshot);
  const isActiveWorkflow = stage.workflowStatus === "ACTIVE";
  const useSnapshot = !!snapshot && (mode === "analyze" ? true : !isActiveWorkflow);

  if (useSnapshot && snapshot) {
    return {
      stageId: stage.id,
      ordinal: stage.ordinal,
      workflowStatus: stage.workflowStatus,
      source: "snapshot",
      snapshotCapturedAt: snapshot.capturedAt,
      readOnly: true,
      deliverables: buildDeliverablesFromSnapshot(snapshot, project),
    };
  }

  return {
    stageId: stage.id,
    ordinal: stage.ordinal,
    workflowStatus: stage.workflowStatus,
    source: "live",
    readOnly: false,
    deliverables: buildLiveDeliverables(project),
  };
}
