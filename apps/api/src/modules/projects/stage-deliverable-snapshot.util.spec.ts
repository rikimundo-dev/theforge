import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStageDeliverableSnapshotFromProject,
  readStageDeliverableSnapshot,
} from "@theforge/shared-types";
import { persistStageDeliverableSnapshotFromProject } from "./stage-deliverable-snapshot.util.js";

describe("persistStageDeliverableSnapshotFromProject", () => {
  it("writes cascade snapshot with deliverable fields", async () => {
    let written: unknown;
    const prisma = {
      stage: {
        update: async ({ data }: { data: { deliverableSnapshot: unknown } }) => {
          written = data.deliverableSnapshot;
          return {};
        },
      },
    };

    await persistStageDeliverableSnapshotFromProject(
      prisma as never,
      "stage-1",
      { specContent: "# Spec", tasksContent: "- [ ] Task" },
      { source: "cascade" },
    );

    const parsed = readStageDeliverableSnapshot(written);
    assert.ok(parsed);
    assert.equal(parsed?.source, "cascade");
    assert.equal(parsed?.specContent, "# Spec");
    assert.equal(parsed?.tasksContent, "- [ ] Task");
    assert.ok(parsed?.capturedAt);
  });

  it("buildStageDeliverableSnapshotFromProject defaults source to project_flat", () => {
    const snap = buildStageDeliverableSnapshotFromProject({ blueprintContent: "bp" });
    assert.equal(snap.source, "project_flat");
    assert.equal(snap.blueprintContent, "bp");
  });
});
