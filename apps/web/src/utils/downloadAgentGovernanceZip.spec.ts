import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { AgentGovernanceScaffold, SpecKitBundleFile } from "@theforge/shared-types";
import {
  addAgentGovernanceEntriesToZip,
  AGENT_GOVERNANCE_ZIP_ROOT,
  buildAgentGovernanceZipEntries,
  buildUnifiedHandoffManifest,
  logAgentGovernanceZipBuild,
  normalizeAgentGovernanceZipPath,
} from "./downloadAgentGovernanceZip.js";

function addMockSpecKitToZip(zip: JSZip, files: SpecKitBundleFile[]): void {
  for (const file of files) {
    zip.file(file.path, file.content, { createFolders: true });
  }
}

const MOCK_SPEC_KIT: SpecKitBundleFile[] = [
  { path: ".specify/memory/constitution.md", content: "# MDD\n" },
  { path: "specs/001-demo-app/spec.md", content: "# Spec\n" },
  { path: "specs/001-demo-app/plan.md", content: "# Plan\n" },
  { path: "IMPLEMENT.md", content: "# Implement\n" },
  { path: "THEFORGE-DOC-CONSUMPTION-GUIDE.md", content: "# Guía\n" },
];

const MOCK_SCAFFOLD: AgentGovernanceScaffold = {
  manifest: {
    templateVersion: "2.0.0",
    files: [],
    generatedAt: "2026-06-09T00:00:00.000Z",
  },
  files: [
    { path: "AGENTS.md", content: "# AGENTS\n" },
    { path: "CLAUDE.md", content: "@AGENTS.md\n" },
    { path: "docs/agent-governance/rules/git-commits.mdc", content: "---\nalwaysApply: true\n---\n" },
    { path: "docs/agent-governance/rules/stack-backend.mdc", content: "backend rule\n" },
    { path: "docs/agent-governance/skills/demo-package/SKILL.md", content: "---\nname: demo\n---\n" },
    { path: "docs/agent-governance/references/workflows.md", content: "# Workflows\n" },
    { path: "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md", content: "# Cómo usar\n" },
    { path: "docs/agent-governance/agent-onboarding.md", content: "# Onboarding\n" },
    { path: "docs/agent-governance/INSTALACION.md", content: "# Instalación\n" },
  ],
};

const LEGACY_SCAFFOLD: AgentGovernanceScaffold = {
  manifest: { templateVersion: "1.0.0", files: [] },
  files: [
    { path: "AGENTS.md", content: "# AGENTS\n" },
    { path: ".cursor/rules/git-commits.mdc", content: "legacy rule\n" },
    { path: ".cursor/skills/demo-package/SKILL.md", content: "legacy skill\n" },
    { path: ".cursor/mcp.json", content: "{}\n" },
    { path: "docs/COMO-USAR-GOBERNANZA-IA.md", content: "# Legacy doc\n" },
  ],
};

describe("buildUnifiedHandoffManifest", () => {
  it("fusiona rutas de gobernanza y spec-kit sin duplicados", () => {
    const governancePaths = ["AGENTS.md", "docs/agent-governance/rules/git-commits.mdc"];
    const merged = buildUnifiedHandoffManifest(governancePaths, MOCK_SPEC_KIT);
    assert.ok(merged.includes("AGENTS.md"));
    assert.ok(merged.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(merged.includes("IMPLEMENT.md"));
    assert.ok(merged.includes(".specify/memory/constitution.md"));
    assert.ok(merged.includes("THEFORGE-DOC-CONSUMPTION-GUIDE.md"));
    assert.ok(merged.some((p) => p.startsWith("specs/001-demo-app/")));
    assert.equal(merged.includes("MANIFEST.json"), false);
    assert.equal(merged.length, new Set(merged).size);
    assert.deepEqual(merged, [...merged].sort((a, b) => a.localeCompare(b)));
  });

  it("sin spec-kit devuelve solo rutas de gobernanza", () => {
    const governancePaths = ["AGENTS.md", "docs/agent-governance/INSTALACION.md"];
    assert.deepEqual(buildUnifiedHandoffManifest(governancePaths), governancePaths);
    assert.deepEqual(buildUnifiedHandoffManifest(governancePaths, []), governancePaths);
  });
});

describe("implement-handoff MANIFEST", () => {
  it("MANIFEST.json incluye spec-kit al exportar implement-handoff", async () => {
    const build = buildAgentGovernanceZipEntries(MOCK_SCAFFOLD);
    assert.ok(build);

    const handoffBuild = {
      ...build,
      manifest: {
        ...build.manifest,
        files: buildUnifiedHandoffManifest(build.manifest.files, MOCK_SPEC_KIT),
      },
    };

    const zip = new JSZip();
    addMockSpecKitToZip(zip, MOCK_SPEC_KIT);
    addAgentGovernanceEntriesToZip(zip, handoffBuild, { flattenToZipRoot: true });

    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
    const manifestRaw = await loaded.file("MANIFEST.json")!.async("string");
    const manifest = JSON.parse(manifestRaw) as { files: string[] };

    assert.ok(manifest.files.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(manifest.files.includes("IMPLEMENT.md"));
    assert.ok(manifest.files.includes(".specify/memory/constitution.md"));
    assert.ok(manifest.files.includes("THEFORGE-DOC-CONSUMPTION-GUIDE.md"));
    assert.ok(manifest.files.some((p) => p.startsWith("specs/001-demo-app/")));
    assert.equal(manifest.files.includes("MANIFEST.json"), false);
  });
});

describe("normalizeAgentGovernanceZipPath", () => {
  it("quita prefijo agent-governance/ y migra .cursor/ a docs/agent-governance/", () => {
    assert.equal(
      normalizeAgentGovernanceZipPath("agent-governance/.cursor/rules/a.mdc"),
      "docs/agent-governance/rules/a.mdc",
    );
    assert.equal(normalizeAgentGovernanceZipPath("/AGENTS.md"), "AGENTS.md");
    assert.equal(
      normalizeAgentGovernanceZipPath("cursor/rules/foo.mdc"),
      "docs/agent-governance/rules/foo.mdc",
    );
    assert.equal(
      normalizeAgentGovernanceZipPath("docs/COMO-USAR-GOBERNANZA-IA.md"),
      "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md",
    );
  });
});

describe("buildAgentGovernanceZipEntries", () => {
  it("incluye rutas bajo docs/agent-governance/ sin .cursor/", () => {
    const build = buildAgentGovernanceZipEntries(MOCK_SCAFFOLD);
    assert.ok(build);
    const paths = [...build!.entries.keys()].sort();
    assert.ok(paths.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(paths.includes("docs/agent-governance/skills/demo-package/SKILL.md"));
    assert.ok(paths.includes("docs/agent-governance/references/workflows.md"));
    assert.ok(paths.includes("docs/agent-governance/INSTALACION.md"));
    assert.equal(paths.some((p) => p.startsWith(".cursor/")), false);
    assert.equal(paths.includes("MANIFEST.json"), false);
  });

  it("añade mcp.json.example en MEDIUM/HIGH si falta", () => {
    const build = buildAgentGovernanceZipEntries(MOCK_SCAFFOLD);
    assert.ok(build?.entries.has("docs/agent-governance/mcp.json.example"));
    assert.ok(build?.entries.get("docs/agent-governance/mcp.json.example")?.includes("mcpServers"));
  });

  it("reescribe scaffold legacy .cursor/ al exportar", () => {
    const build = buildAgentGovernanceZipEntries(LEGACY_SCAFFOLD);
    assert.ok(build);
    const paths = [...build!.entries.keys()];
    assert.ok(paths.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(paths.includes("docs/agent-governance/skills/demo-package/SKILL.md"));
    assert.ok(paths.includes("docs/agent-governance/mcp.json.example"));
    assert.ok(paths.includes("docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md"));
    assert.equal(paths.some((p) => p.startsWith(".cursor/")), false);
  });

  it("MANIFEST incluye installMap y files sin .cursor/", () => {
    const build = buildAgentGovernanceZipEntries(MOCK_SCAFFOLD);
    assert.ok(build);
    const entryPaths = [...build!.entries.keys()].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(build!.manifest.files, entryPaths);
    assert.ok(build!.manifest.installMap?.length);
    assert.ok(
      build!.manifest.installMap?.some(
        (e) =>
          e.source === "docs/agent-governance/rules/git-commits.mdc" &&
          e.target === ".cursor/rules/git-commits.mdc",
      ),
    );
    assert.equal(build!.manifest.files.some((p) => p.startsWith(".cursor/")), false);
  });
});

describe("addAgentGovernanceEntriesToZip", () => {
  it("genera ZIP visible bajo agent-governance/ sin .cursor/", async () => {
    const build = buildAgentGovernanceZipEntries(MOCK_SCAFFOLD);
    assert.ok(build);

    const zip = new JSZip();
    addAgentGovernanceEntriesToZip(zip, build!);

    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
    const expected = [
      `${AGENT_GOVERNANCE_ZIP_ROOT}/docs/agent-governance/rules/git-commits.mdc`,
      `${AGENT_GOVERNANCE_ZIP_ROOT}/docs/agent-governance/skills/demo-package/SKILL.md`,
      `${AGENT_GOVERNANCE_ZIP_ROOT}/docs/agent-governance/references/workflows.md`,
      `${AGENT_GOVERNANCE_ZIP_ROOT}/docs/agent-governance/mcp.json.example`,
      `${AGENT_GOVERNANCE_ZIP_ROOT}/docs/agent-governance/INSTALACION.md`,
      `${AGENT_GOVERNANCE_ZIP_ROOT}/AGENTS.md`,
      `${AGENT_GOVERNANCE_ZIP_ROOT}/MANIFEST.json`,
    ];

    for (const fullPath of expected) {
      const entry = loaded.file(fullPath);
      assert.ok(entry, `falta entrada ZIP: ${fullPath}`);
      const text = await entry!.async("string");
      assert.ok(text.length > 0, `contenido vacío: ${fullPath}`);
    }

    const zipPaths = Object.keys(loaded.files).filter((p) => !p.endsWith("/"));
    assert.equal(
      zipPaths.some((p) => p.includes("/.cursor/")),
      false,
      `ZIP no debe contener .cursor/: ${zipPaths.join(", ")}`,
    );

    const manifestRaw = await loaded.file(`${AGENT_GOVERNANCE_ZIP_ROOT}/MANIFEST.json`)!.async("string");
    const manifest = JSON.parse(manifestRaw) as { files: string[]; installMap: { source: string; target: string }[] };
    assert.ok(manifest.files.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(manifest.installMap?.length);
  });

  it("flattenToZipRoot escribe gobernanza en la raíz del ZIP (repo-handoff)", async () => {
    const build = buildAgentGovernanceZipEntries(MOCK_SCAFFOLD);
    assert.ok(build);

    const zip = new JSZip();
    addAgentGovernanceEntriesToZip(zip, build!, { flattenToZipRoot: true });

    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: "nodebuffer" }));
    const expected = [
      "docs/agent-governance/rules/git-commits.mdc",
      "AGENTS.md",
      "MANIFEST.json",
    ];

    for (const fullPath of expected) {
      assert.ok(loaded.file(fullPath), `falta entrada ZIP aplanada: ${fullPath}`);
    }

    const zipPaths = Object.keys(loaded.files).filter((p) => !p.endsWith("/"));
    assert.equal(zipPaths.some((p) => p.startsWith(`${AGENT_GOVERNANCE_ZIP_ROOT}/`)), false);
  });
});

const MEDIUM_SCAFFOLD_16: AgentGovernanceScaffold = {
  manifest: {
    templateVersion: "2.0.0",
    files: [],
    generatedAt: "2026-06-09T12:00:00.000Z",
    suggestions: {
      archetypes: ["nestjs-react-monorepo"],
      rationale: ["fixture 16 archivos"],
      entries: [],
    },
  },
  files: [
    { path: "AGENTS.md", content: "# AGENTS\n" },
    { path: "CLAUDE.md", content: "@AGENTS.md\n" },
    { path: "docs/agent-governance/agent-onboarding.md", content: "# Onboarding\n" },
    { path: "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md", content: "# Cómo usar\n" },
    { path: "docs/agent-governance/INSTALACION.md", content: "# Instalación\n" },
    { path: "docs/agent-governance/rules/git-commits.mdc", content: "rule git\n" },
    { path: "docs/agent-governance/rules/stack-backend.mdc", content: "rule backend\n" },
    { path: "docs/agent-governance/rules/stack-frontend.mdc", content: "rule frontend\n" },
    { path: "docs/agent-governance/rules/api-contracts.mdc", content: "rule api\n" },
    { path: "docs/agent-governance/rules/orchestrator.mdc", content: "rule orch\n" },
    { path: "docs/agent-governance/skills/demo-package/SKILL.md", content: "skill demo\n" },
    { path: "docs/agent-governance/skills/monorepo-packages/SKILL.md", content: "skill mono\n" },
    { path: "docs/agent-governance/references/workflows.md", content: "# Workflows\n" },
    { path: "docs/agent-governance/references/CURSOR_SKILLS_Y_RULES.md", content: "# Skills y rules\n" },
    { path: "docs/agent-governance/references/PROMPT_HANDOFF_AGENTE.md", content: "# Handoff\n" },
    { path: "docs/agent-governance/mcp.json.example", content: '{"mcpServers":{}}\n' },
    { path: "scripts/install-agent-governance.sh", content: "#!/bin/bash\n" },
  ],
};

describe("download path — scaffold realista sin .cursor/", () => {
  it("downloadAgentGovernanceZip escribe entradas en la raíz del ZIP (sin agent-governance/)", async () => {
    const build = buildAgentGovernanceZipEntries(MEDIUM_SCAFFOLD_16);
    assert.ok(build);
    assert.equal(build!.entries.size, 17);

    const governanceCount = [...build!.entries.keys()].filter((p) =>
      p.startsWith("docs/agent-governance/"),
    ).length;
    assert.equal(governanceCount, 14);

    logAgentGovernanceZipBuild(build!, "scaffold");

    const zip = new JSZip();
    addAgentGovernanceEntriesToZip(zip, build!, { flattenToZipRoot: true });
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(buffer);

    const zipPaths = Object.keys(loaded.files).filter((p) => !p.endsWith("/")).sort();
    assert.equal(zipPaths.length, 18, `ZIP paths: ${zipPaths.join(", ")}`);
    assert.ok(zipPaths.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(zipPaths.includes("AGENTS.md"));
    assert.ok(zipPaths.includes("MANIFEST.json"));
    assert.equal(zipPaths.some((p) => p.startsWith(`${AGENT_GOVERNANCE_ZIP_ROOT}/`)), false);
    assert.equal(zipPaths.some((p) => p.includes("/.cursor/")), false);
  });
});
