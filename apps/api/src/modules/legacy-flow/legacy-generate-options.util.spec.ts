import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StageStatus } from "@theforge/database";
import { buildLegacyGenerateOptions, mergeLegacyTasksGenerateOptions } from "./legacy-generate-options.util.js";

describe("legacy-generate-options.util", () => {
  it("returns undefined for non-LEGACY projects", async () => {
    const out = await buildLegacyGenerateOptions({
      projectType: "NEW",
      theforgeProjectId: "x",
      mddMarkdown: "# MDD",
      stages: [{ ordinal: 1, workflowStatus: StageStatus.ACTIVE }],
      theforgeConfigured: true,
      getContextForDeliverables: async () => "ctx",
      gatherContractSpecsForApi: async () => "",
    });
    assert.equal(out, undefined);
  });

  it("sets legacyBaselineStage for LEGACY ordinal 1", async () => {
    const out = await buildLegacyGenerateOptions({
      projectType: "LEGACY",
      theforgeProjectId: null,
      mddMarkdown: "# MDD\n\n## 1. Contexto\n\nSistema AS-IS.",
      stages: [{ ordinal: 1, workflowStatus: StageStatus.ACTIVE }],
      theforgeConfigured: false,
      getContextForDeliverables: async () => "",
      gatherContractSpecsForApi: async () => "",
    });
    assert.equal(out?.legacyBaselineStage, true);
  });

  it("mergeLegacyTasksGenerateOptions spreads legacy opts and project deliverables", () => {
    const out = mergeLegacyTasksGenerateOptions(
      {
        legacyBaselineStage: true,
        theforgeContext: "ctx",
        contractSpecs: "specs",
      },
      {
        specContent: "# Spec",
        userStoriesContent: "# HU",
        apiContractsContent: "# API",
        logicFlowsContent: "# Flows",
        infraContent: "# Infra",
      },
      "nav-map",
    );
    assert.equal(out.legacyBaselineStage, true);
    assert.equal(out.theforgeContext, "ctx");
    assert.equal(out.contractSpecs, "specs");
    assert.equal(out.navigationMap, "nav-map");
    assert.equal(out.specContent, "# Spec");
    assert.equal(out.userStoriesContent, "# HU");
    assert.equal(out.apiContractsContent, "# API");
    assert.equal(out.logicFlowsContent, "# Flows");
    assert.equal(out.infraContent, "# Infra");
  });
});
