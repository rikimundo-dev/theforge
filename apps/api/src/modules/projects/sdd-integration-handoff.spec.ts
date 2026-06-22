import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeAgentGovernanceScaffold } from "../ai/utils/agent-governance.util.js";
import {
  analyzeAgentGovernanceSlice,
  buildHermesHandoffPayload,
  buildUnifiedHandoff,
  hashHandoffContent,
  reconcileExportScaffold,
  scaffoldToRepoHandoffGovernance,
} from "./handoff-export.util.js";

const baseProject = {
  id: "proj-1",
  name: "Demo App",
  userId: "u1",
  visibility: "PRIVATE" as const,
  complexity: "MEDIUM" as const,
  projectType: "GREENFIELD" as const,
  hasUxTeam: false,
  specContent: "# Spec\n",
  blueprintContent: "# Blueprint\n",
  tasksContent: "- [ ] Task one\n",
  agentGovernanceContent: null as string | null,
  stages: [
    {
      id: "s1",
      projectId: "proj-1",
      ordinal: 1,
      status: "VERDE",
      mddContent: "# MDD\n\n## 2. Stack\nNestJS",
    },
  ],
};

describe("handoff-export.util", () => {
  it("buildUnifiedHandoff incluye spec-kit files y consumption guide en raíz", () => {
    const unified = buildUnifiedHandoff(baseProject as never, "# Guía\n");
    assert.ok(unified.specKitFiles.some((f) => f.path === ".specify/memory/constitution.md"));
    assert.ok(unified.specKitFiles.some((f) => f.path === "THEFORGE-DOC-CONSUMPTION-GUIDE.md"));
    assert.ok(unified.specKitFiles.some((f) => f.path === "IMPLEMENT.md"));
    const implement = unified.specKitFiles.find((f) => f.path === "IMPLEMENT.md");
    assert.ok(implement?.content.includes(unified.featureDir));
    assert.equal(unified.layout, "spec-kit-primary");
    assert.ok(unified.pathMap.length >= 4);
    assert.equal(unified.governancePresent, false);
  });

  it("reconcileExportScaffold añade docs/sdd y overlay AGENTS.md dual spec-kit", () => {
    const gov = serializeAgentGovernanceScaffold({
      manifest: { templateVersion: "2.0.0", files: ["AGENTS.md"] },
      files: [{ path: "AGENTS.md", content: "# AGENTS personalizado\n\nSolo cuerpo LLM.\n" }],
    });
    const project = { ...baseProject, agentGovernanceContent: gov };
    const scaffold = reconcileExportScaffold(project as never);
    assert.ok(scaffold);
    const paths = scaffold!.files.map((f) => f.path);
    assert.ok(paths.includes("docs/sdd/mdd.md"));
    assert.ok(paths.includes("docs/sdd/spec.md"));
    assert.ok(paths.includes("docs/sdd/tasks.md"));
    const agents = scaffold!.files.find((f) => f.path === "AGENTS.md");
    assert.ok(agents?.content.includes("Documentos SDD (layout dual)"));
    assert.ok(agents?.content.includes("specs/001-demo-app/spec.md"));
    assert.ok(agents?.content.includes("Instalación de gobernanza"));
    assert.ok(agents?.content.includes("Solo cuerpo LLM"));
  });

  it("scaffoldToRepoHandoffGovernance mapea present/files", () => {
    const scaffold = {
      manifest: { templateVersion: "2.0.0", files: ["AGENTS.md"] },
      files: [{ path: "AGENTS.md", content: "# AGENTS\n" }],
    };
    const out = scaffoldToRepoHandoffGovernance(scaffold);
    assert.equal(out.present, true);
    assert.equal(out.files.length, 1);
  });

  it("analyzeAgentGovernanceSlice detecta ausencia", () => {
    const slice = analyzeAgentGovernanceSlice(baseProject as never);
    assert.equal(slice.present, false);
    assert.ok(slice.missingRequiredPaths.length > 0);
  });

  it("buildHermesHandoffPayload incluye hashes SHA-256", () => {
    const unified = buildUnifiedHandoff(baseProject as never, null);
    const payload = buildHermesHandoffPayload(unified);
    assert.ok(payload.files.length > 0);
    assert.match(payload.files[0]!.sha256, /^[a-f0-9]{64}$/);
    assert.equal(payload.files[0]!.sha256, hashHandoffContent(payload.files[0]!.content));
    assert.ok(payload.cliFallback.includes("theforge-export"));
  });
});
