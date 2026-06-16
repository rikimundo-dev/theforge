import { describe, it } from "node:test";
import assert from "node:assert";
import {
  AGENT_GOVERNANCE_REQUIRED_ALL,
  AGENT_GOVERNANCE_REQUIRED_MEDIUM,
  appendProjectDeliverablesToScaffold,
  getRequiredAgentGovernancePaths,
  parseAgentGovernanceResponse,
  reconcileAgentGovernanceScaffold,
} from "./agent-governance.util.js";
import { suggestAgentGovernanceArtifacts } from "./suggest-agent-governance-artifacts.js";

describe("getRequiredAgentGovernancePaths", () => {
  it("LOW incluye COMO-USAR, INSTALACION y base sin references", () => {
    const paths = getRequiredAgentGovernancePaths("LOW");
    for (const p of AGENT_GOVERNANCE_REQUIRED_ALL) {
      assert.ok(paths.includes(p), `falta ${p}`);
    }
    for (const p of AGENT_GOVERNANCE_REQUIRED_MEDIUM) {
      assert.equal(paths.includes(p), false, `no debería incluir ${p} en LOW`);
    }
  });

  it("MEDIUM añade references obligatorias bajo docs/agent-governance/", () => {
    const paths = getRequiredAgentGovernancePaths("MEDIUM");
    for (const p of AGENT_GOVERNANCE_REQUIRED_MEDIUM) {
      assert.ok(paths.includes(p), `falta ${p}`);
    }
    assert.ok(paths.includes("docs/agent-governance/references/workflows.md"));
    assert.ok(paths.includes("docs/agent-governance/mcp.json.example"));
    assert.ok(paths.includes("scripts/install-agent-governance.sh"));
  });
});

describe("parseAgentGovernanceResponse", () => {
  it("aplica fallback COMO-USAR e INSTALACION cuando el LLM omite rutas base", () => {
    const raw = JSON.stringify({
      files: {
        "AGENTS.md": "# AGENTS\n",
        "CLAUDE.md": "@AGENTS.md\n",
      },
    });
    const scaffold = parseAgentGovernanceResponse(raw, "LOW");
    const paths = scaffold.files.map((f) => f.path);
    assert.ok(paths.includes("docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md"));
    assert.ok(paths.includes("docs/agent-governance/agent-onboarding.md"));
    assert.ok(paths.includes("docs/agent-governance/INSTALACION.md"));
    assert.ok(paths.includes("docs/agent-governance/references/THEFORGE-DOC-CONSUMPTION-GUIDE.md"));
    assert.ok(paths.includes("PROMPT-INICIAL.md"));
    assert.ok(paths.includes("docs/sdd/PROGRESO.md"));
    const agents = scaffold.files.find((f) => f.path === "AGENTS.md");
    assert.ok(agents?.content.includes("Instalación de gobernanza"));
    const comoUsar = scaffold.files.find(
      (f) => f.path === "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md",
    );
    assert.ok(comoUsar?.content.includes("THEFORGE-DOC-CONSUMPTION-GUIDE"));
    assert.ok(comoUsar?.content.includes("INSTALACION"));
  });

  it("aplica fallback de references en MEDIUM bajo docs/agent-governance/", () => {
    const scaffold = parseAgentGovernanceResponse('{"files":{}}', "MEDIUM");
    const paths = scaffold.files.map((f) => f.path);
    assert.ok(paths.includes("docs/agent-governance/references/workflows.md"));
    assert.ok(paths.includes("docs/agent-governance/references/CURSOR_SKILLS_Y_RULES.md"));
    assert.ok(paths.includes("docs/agent-governance/references/PROMPT_HANDOFF_AGENTE.md"));
    assert.ok(paths.includes("docs/agent-governance/mcp.json.example"));
    assert.ok(paths.includes("scripts/install-agent-governance.sh"));
    const installScript = scaffold.files.find(
      (f) => f.path === "scripts/install-agent-governance.sh",
    );
    assert.ok(installScript?.content.includes(".cursor/agents"));
    assert.ok(installScript?.content.includes(".cursor/commands"));
    assert.equal(paths.some((p) => p.startsWith(".cursor/")), false);
    assert.ok(scaffold.manifest.installMap?.length);
  });

  it("parsea JSON con fences markdown", () => {
    const inner = JSON.stringify({
      files: { "AGENTS.md": "# OK\n", "CLAUDE.md": "@AGENTS.md\n" },
    });
    const raw = "```json\n" + inner + "\n```";
    const scaffold = parseAgentGovernanceResponse(raw, "LOW");
    assert.ok(scaffold.files.some((f) => f.path === "AGENTS.md"));
    assert.equal(scaffold.manifest.templateVersion.length > 0, true);
  });

  it("no incluye MANIFEST.json en files (lo genera el ZIP)", () => {
    const scaffold = parseAgentGovernanceResponse('{"files":{}}', "LOW");
    assert.equal(scaffold.files.some((f) => f.path === "MANIFEST.json"), false);
    assert.ok(scaffold.manifest.files.length > 0);
  });

  it("materializa rules débiles omitidas por el LLM (no solo strong)", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# MDD
## 2. Stack
Backend NestJS, frontend React, monorepo packages/api packages/web.
## 4. API
REST OpenAPI Zod.
`,
      complexity: "MEDIUM",
    });
    const weakOrchestrator = suggestions.suggestedRules.find((r) => r.id === "orchestrator");
    assert.ok(weakOrchestrator, "fixture debe incluir orchestrator");
    assert.equal(weakOrchestrator.strength, "weak");

    const scaffold = parseAgentGovernanceResponse('{"files":{}}', "MEDIUM", { suggestions });
    const paths = scaffold.files.map((f) => f.path);
    assert.ok(
      paths.includes("docs/agent-governance/rules/orchestrator.mdc"),
      `orchestrator weak debe materializarse; paths=${paths.join(",")}`,
    );
  });

  it("migra cursor/ sin punto desde respuesta LLM legacy", () => {
    const raw = JSON.stringify({
      files: {
        "cursor/rules/git-commits.mdc": "---\nalwaysApply: true\n---\n# Git\n",
      },
    });
    const scaffold = parseAgentGovernanceResponse(raw, "LOW");
    assert.ok(
      scaffold.files.some((f) => f.path === "docs/agent-governance/rules/git-commits.mdc"),
    );
    assert.equal(
      scaffold.files.some((f) => f.path.startsWith(".cursor/")),
      false,
    );
  });

  it("enriquece contenido fino del LLM con hechos del proyecto", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# MDD
## 2. Stack
Backend FastAPI, frontend React Native Expo.
`,
      complexity: "MEDIUM",
    });
    const raw = JSON.stringify({
      files: {
        "docs/agent-governance/rules/stack-backend.mdc": "# Stack backend\n\nCorto.\n",
      },
    });
    const scaffold = parseAgentGovernanceResponse(raw, "MEDIUM", {
      suggestions,
      governanceInput: {
        mddMarkdown: "Backend FastAPI, mobile Expo",
        tasksMarkdown: "## Sprint 1\n",
        complexity: "MEDIUM",
      },
    });
    const rule = scaffold.files.find(
      (f) => f.path === "docs/agent-governance/rules/stack-backend.mdc",
    );
    assert.ok(rule?.content.includes("Hechos del proyecto ("));
    assert.ok(
      scaffold.files.some((f) => f.path === "docs/agent-governance/agents/mobile-implementer.md"),
    );
  });
});

describe("reconcileAgentGovernanceScaffold", () => {
  it("expande scaffold de 4 archivos con sugerencias del MANIFEST a árbol completo", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# MDD Demo
## 2. Stack técnico
- Backend: NestJS con TypeScript
- Frontend: React 18 + Vite
- Monorepo con packages/api y packages/web
## 4. Contratos de API
REST con validación Zod y OpenAPI.
`,
      complexity: "MEDIUM",
    });

    const staleFiles = [
      { path: "AGENTS.md", content: "# AGENTS\n" },
      { path: "CLAUDE.md", content: "@AGENTS.md\n" },
      { path: "docs/agent-governance/agent-onboarding.md", content: "# Onboarding\n" },
      { path: "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md", content: "# Cómo usar\n" },
    ];

    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: {
          templateVersion: "1.0.0",
          files: staleFiles.map((f) => f.path),
          suggestions: {
            archetypes: suggestions.archetypes,
            rationale: suggestions.rationale,
            entries: [
              ...suggestions.suggestedRules.map((r) => ({
                id: r.id,
                path: r.path,
                kind: "rule" as const,
                purpose: r.purpose,
                strength: r.strength,
              })),
              ...suggestions.suggestedSkills.map((s) => ({
                id: s.id,
                path: s.path,
                kind: "skill" as const,
                purpose: s.purpose,
                strength: s.strength,
              })),
            ],
          },
        },
        files: staleFiles,
      },
      "MEDIUM",
      { suggestions },
    );

    const paths = reconciled.files.map((f) => f.path);
    assert.ok(paths.length >= 10, `esperado árbol expandido, obtuvo ${paths.length}: ${paths.join(",")}`);
    assert.ok(paths.includes("docs/agent-governance/rules/stack-backend.mdc"));
    assert.ok(paths.includes("docs/agent-governance/references/workflows.md"));
    assert.ok(paths.includes("docs/agent-governance/mcp.json.example"));
    assert.ok(reconciled.manifest.installMap?.length);
  });

  it("migra scaffold legacy con .cursor/ a docs/agent-governance/", () => {
    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: { templateVersion: "1.0.0", files: [] },
        files: [
          { path: "AGENTS.md", content: "# AGENTS\n" },
          { path: ".cursor/rules/git-commits.mdc", content: "rule\n" },
          { path: ".cursor/mcp.json", content: "{}\n" },
          { path: "docs/COMO-USAR-GOBERNANZA-IA.md", content: "# Doc\n" },
        ],
      },
      "MEDIUM",
    );
    const paths = reconciled.files.map((f) => f.path);
    assert.ok(paths.includes("docs/agent-governance/rules/git-commits.mdc"));
    assert.ok(paths.includes("docs/agent-governance/mcp.json.example"));
    assert.ok(paths.includes("docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md"));
    assert.equal(paths.some((p) => p.startsWith(".cursor/")), false);
  });
});

describe("appendProjectDeliverablesToScaffold", () => {
  it("añade entregables SDD bajo docs/sdd/ en export", () => {
    const base = parseAgentGovernanceResponse('{"files":{}}', "LOW");
    const enriched = appendProjectDeliverablesToScaffold(base, {
      mddMarkdown: "# MDD\n",
      tasksMarkdown: "# Tasks\n",
      blueprintMarkdown: "# Blueprint\n",
    });
    const paths = enriched.files.map((f) => f.path);
    assert.ok(paths.includes("docs/sdd/mdd.md"));
    assert.ok(paths.includes("docs/sdd/tasks.md"));
    assert.ok(paths.includes("docs/sdd/blueprint.md"));
  });

  it("incluye api-contracts, logic-flows e infra cuando hay contenido", () => {
    const base = parseAgentGovernanceResponse('{"files":{}}', "MEDIUM");
    const enriched = appendProjectDeliverablesToScaffold(base, {
      mddMarkdown: "# MDD\n",
      apiContractsMarkdown: "# API\n",
      logicFlowsMarkdown: "# Flows\n",
      infraMarkdown: "# Infra\n",
    });
    const paths = enriched.files.map((f) => f.path);
    assert.ok(paths.includes("docs/sdd/api-contracts.md"));
    assert.ok(paths.includes("docs/sdd/logic-flows.md"));
    assert.ok(paths.includes("docs/sdd/infra.md"));
    const api = enriched.files.find((f) => f.path === "docs/sdd/api-contracts.md");
    assert.equal(api?.content.trim(), "# API");
  });

  it("sobrescribe placeholders SDD con contenido del proyecto", () => {
    const base = parseAgentGovernanceResponse('{"files":{}}', "LOW");
    base.files.push({ path: "docs/sdd/api-contracts.md", content: "placeholder" });
    const enriched = appendProjectDeliverablesToScaffold(base, {
      apiContractsMarkdown: "# Contratos reales\n",
    });
    const api = enriched.files.find((f) => f.path === "docs/sdd/api-contracts.md");
    assert.equal(api?.content.trim(), "# Contratos reales");
  });
});
