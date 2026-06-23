import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveHandoffDescriptionForStage,
  stageHasHandoffPayload,
} from "./reconcile-handoff.util.js";

describe("stageHasHandoffPayload", () => {
  it("returns true when handoffImportedAt is set", () => {
    assert.equal(
      stageHasHandoffPayload({
        id: "s1",
        ordinal: 2,
        handoffImportedAt: new Date(),
        handoffSnapshot: null,
        linkedNewProjectId: null,
        legacyChangeState: null,
      }),
      true,
    );
  });

  it("returns true when snapshot has items", () => {
    assert.equal(
      stageHasHandoffPayload({
        id: "s1",
        ordinal: 2,
        handoffImportedAt: null,
        handoffSnapshot: { items: [{ id: "NEW-LEG-01", title: "T", description: "D" }] },
        linkedNewProjectId: null,
        legacyChangeState: null,
      }),
      true,
    );
  });
});

describe("resolveHandoffDescriptionForStage", () => {
  it("prefers legacyChangeState.description", () => {
    const desc = resolveHandoffDescriptionForStage(
      {
        id: "s1",
        ordinal: 2,
        handoffImportedAt: new Date(),
        handoffSnapshot: { items: [{ id: "NEW-LEG-01", title: "T", description: "D" }] },
        linkedNewProjectId: "new-1",
        legacyChangeState: { description: "Persisted description" },
      },
      "NEW Project",
    );
    assert.equal(desc, "Persisted description");
  });

  it("rebuilds from snapshot when description missing", () => {
    const desc = resolveHandoffDescriptionForStage(
      {
        id: "s1",
        ordinal: 2,
        handoffImportedAt: new Date(),
        handoffSnapshot: {
          items: [{ id: "NEW-LEG-01", title: "Login", description: "OAuth flow" }],
        },
        linkedNewProjectId: "new-1",
        legacyChangeState: null,
      },
      "Micro X",
    );
    assert.ok(desc.includes("Micro X"));
    assert.ok(desc.includes("NEW-LEG-01"));
    assert.ok(desc.includes("Login"));
  });
});
