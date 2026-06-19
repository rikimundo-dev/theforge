import type { PrismaService } from "../../prisma/prisma.service.js";
import {
  buildStageDeliverableSnapshotFromProject,
  type ProjectDeliverableSource,
  type StageDeliverableSnapshot,
} from "@theforge/shared-types";

type PrismaStageWriter = Pick<PrismaService, "stage">;

/**
 * Persists a frozen copy of project deliverable fields on `Stage.deliverableSnapshot`.
 * Used after cascade generation so historical stage views stay read-only.
 */
export async function persistStageDeliverableSnapshotFromProject(
  prisma: PrismaStageWriter,
  stageId: string,
  project: ProjectDeliverableSource,
  options?: { source?: StageDeliverableSnapshot["source"] },
): Promise<void> {
  const snapshot = buildStageDeliverableSnapshotFromProject(project, {
    source: options?.source ?? "cascade",
  });
  await prisma.stage.update({
    where: { id: stageId },
    data: { deliverableSnapshot: snapshot as object },
  });
}
