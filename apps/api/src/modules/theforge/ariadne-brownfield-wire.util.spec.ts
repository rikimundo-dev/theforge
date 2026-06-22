import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAriadneBrownfieldWirePatchBody,
  resolveAriadneRepositoryIdsForBrownfieldWire,
} from "./ariadne-brownfield-wire.util.js";

describe("ariadne-brownfield-wire.util", () => {
  const catalog = [
    {
      id: "proj-1",
      roots: [{ id: "repo-a" }, { id: "repo-b" }],
    },
  ];

  it("returns all roots for workspace selection", () => {
    assert.deepEqual(resolveAriadneRepositoryIdsForBrownfieldWire("proj-1", catalog), [
      "repo-a",
      "repo-b",
    ]);
  });

  it("returns single repo when root id selected", () => {
    assert.deepEqual(resolveAriadneRepositoryIdsForBrownfieldWire("repo-a", catalog), ["repo-a"]);
  });

  it("builds PATCH body with stage and service JWT", () => {
    const body = buildAriadneBrownfieldWirePatchBody({
      workshopProjectId: "tf-1",
      workshopStageId: "stage-1",
      triggerMode: "incremental",
      persist: false,
      serviceJwt: "eyJ.jwt",
    });
    assert.equal(body.theforgeProjectId, "tf-1");
    assert.equal(body.theforgeStageId, "stage-1");
    assert.equal(body.theforgeConvergeTriggerMode, "incremental");
    assert.equal(body.theforgeServiceToken, "eyJ.jwt");
  });
});
