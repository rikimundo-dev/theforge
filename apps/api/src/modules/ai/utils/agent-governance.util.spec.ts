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

  it("reemplaza hechos obsoletos (TheForge) con título del proyecto", () => {
    const staleRule =
      "# Stack backend\n\n" +
      "## Hechos del proyecto (TheForge)\n\n" +
      "**Globs backend:**\n- `packages/api/**`\n\n" +
      "Contenido largo del LLM que no debe bloquear el overlay cuando el título es genérico " +
      "y los globs no coinciden con el blueprint actual del proyecto KMS Platform.\n".repeat(3);

    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: {
          templateVersion: "1.0.0",
          files: ["docs/agent-governance/rules/stack-backend.mdc"],
        },
        files: [{ path: "docs/agent-governance/rules/stack-backend.mdc", content: staleRule }],
      },
      "MEDIUM",
      {
        forceFreshOverlay: true,
        governanceInput: {
          mddMarkdown: "# KMS Platform\n## 2. Stack\nBackend FastAPI en services/api/",
          blueprintMarkdown: "## Estructura\n- services/api\n- apps/mobile",
          projectName: "KMS Platform",
          complexity: "MEDIUM",
        },
      },
    );
    const rule = reconciled.files.find(
      (f) => f.path === "docs/agent-governance/rules/stack-backend.mdc",
    );
    assert.ok(rule?.content.includes("Hechos del proyecto (KMS Platform)"));
    assert.equal(rule?.content.includes("Hechos del proyecto (TheForge)"), false);
  });

  it("forceFreshOverlay reemplaza reglas largas obsoletas al regenerar", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# MDD
## 2. Stack
Backend NestJS, frontend React, monorepo packages/api packages/web.
`,
      complexity: "MEDIUM",
    });
    const staleLongRule = "# Orchestrator\n\n".padEnd(200, "x") + "\n## Hechos del proyecto (TheForge)\n";
    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: {
          templateVersion: "1.0.0",
          files: ["docs/agent-governance/rules/orchestrator.mdc"],
        },
        files: [{ path: "docs/agent-governance/rules/orchestrator.mdc", content: staleLongRule }],
      },
      "MEDIUM",
      {
        suggestions,
        forceFreshOverlay: true,
        governanceInput: { mddMarkdown: "NestJS React monorepo", complexity: "MEDIUM" },
      },
    );
    const rule = reconciled.files.find(
      (f) => f.path === "docs/agent-governance/rules/orchestrator.mdc",
    );
    assert.ok(rule?.content.includes("Hechos del proyecto ("));
    assert.equal(rule?.content.includes("(TheForge)"), false);
    assert.ok((rule?.content.length ?? 0) > 200);
  });

  it("sobrescribe INSTALACION e install script aunque el LLM genere basura", () => {
    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: { templateVersion: "1.0.0", files: [] },
        files: [
          {
            path: "docs/agent-governance/INSTALACION.md",
            content: "# Instalación\n\nCopia todo a `.cursor/workflows.md` (incorrecto).\n",
          },
          {
            path: "scripts/install-agent-governance.sh",
            content: "#!/bin/bash\necho broken\n",
          },
        ],
      },
      "MEDIUM",
    );
    const instalacion = reconciled.files.find(
      (f) => f.path === "docs/agent-governance/INSTALACION.md",
    );
    const script = reconciled.files.find((f) => f.path === "scripts/install-agent-governance.sh");
    assert.ok(instalacion?.content.includes(".cursor/references/"));
    assert.ok(instalacion?.content.includes("Opción C"));
    assert.ok(instalacion?.content.includes(".cursor/agents"));
    assert.equal(instalacion?.content.includes("workflows.md"), false);
    assert.ok(script?.content.includes(".cursor/agents"));
    assert.ok(script?.content.includes(".cursor/commands"));
  });

  it("deduplica sección SDD y elimina PROMPT duplicado bajo docs/agent-governance/", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# MDD
## 2. Stack
Backend NestJS con TypeORM en borrador; Prisma en blueprint.
`,
      complexity: "MEDIUM",
    });
    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: { templateVersion: "1.0.0", files: ["AGENTS.md"] },
        files: [
          {
            path: "AGENTS.md",
            content:
              "# AGENTS\n\n## Resolución de conflictos SDD\n\n- TypeORM vs Prisma: prioriza el ORM declarado en MDD §2/Blueprint; no mezcles ambos en el mismo servicio.\n\n## Resolución de conflictos SDD\n\n- duplicado\n",
          },
          {
            path: "docs/agent-governance/PROMPT-INICIAL.md",
            content: "# Prompt corrupto\n",
          },
        ],
      },
      "MEDIUM",
      { suggestions, governanceInput: { mddMarkdown: "TypeORM Prisma NestJS", complexity: "MEDIUM" } },
    );
    const agents = reconciled.files.find((f) => f.path === "AGENTS.md");
    assert.ok(agents?.content.includes("Resolución de conflictos SDD"));
    assert.equal(
      (agents?.content.match(/## Resolución de conflictos SDD/gi) ?? []).length,
      1,
    );
    assert.equal(
      reconciled.files.some((f) => f.path === "docs/agent-governance/PROMPT-INICIAL.md"),
      false,
    );
    assert.ok(reconciled.files.some((f) => f.path === "PROMPT-INICIAL.md"));
  });

  it("no duplica Módulos/Globs en stack-backend con overlay compacto", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: "# KMS\nBackend NestJS monorepo.",
      blueprintMarkdown: "- kms-backend/\n- packages/shared/\n",
      complexity: "MEDIUM",
    });
    const reconciled = reconcileAgentGovernanceScaffold(
      {
        manifest: { templateVersion: "1.0.0", files: [] },
        files: [],
      },
      "MEDIUM",
      {
        suggestions,
        governanceInput: {
          mddMarkdown: "# KMS\nBackend NestJS.",
          blueprintMarkdown: "- kms-backend/\n",
          complexity: "MEDIUM",
        },
      },
    );
    const rule = reconciled.files.find(
      (f) => f.path === "docs/agent-governance/rules/stack-backend.mdc",
    );
    assert.ok(rule?.content.includes("**Módulos Blueprint:**"));
    assert.equal((rule?.content.match(/\*\*Módulos Blueprint:\*\*/g) ?? []).length, 1);
    assert.equal((rule?.content.match(/\*\*Globs backend:\*\*/g) ?? []).length, 1);
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

  it("incluye todos los entregables SDD presentes en el proyecto", () => {
    const base = parseAgentGovernanceResponse('{"files":{}}', "HIGH");
    const enriched = appendProjectDeliverablesToScaffold(base, {
      mddMarkdown: "# MDD\n",
      blueprintMarkdown: "# Blueprint\n",
      specMarkdown: "# Spec\n",
      architectureMarkdown: "# Arch\n",
      tasksMarkdown: "# Tasks\n",
      useCasesMarkdown: "# UC\n",
      userStoriesMarkdown: "# US\n",
      apiContractsMarkdown: "# API\n",
      logicFlowsMarkdown: "# Flows\n",
      uxUiGuideMarkdown: "# UX\n",
      infraMarkdown: "# Infra\n",
    });
    const paths = enriched.files.map((f) => f.path);
    for (const expected of [
      "docs/sdd/mdd.md",
      "docs/sdd/blueprint.md",
      "docs/sdd/spec.md",
      "docs/sdd/architecture.md",
      "docs/sdd/tasks.md",
      "docs/sdd/use-cases.md",
      "docs/sdd/user-stories.md",
      "docs/sdd/api-contracts.md",
      "docs/sdd/logic-flows.md",
      "docs/sdd/ux-ui-guide.md",
      "docs/sdd/infra.md",
    ]) {
      assert.ok(paths.includes(expected), `falta ${expected}`);
    }
  });
});
