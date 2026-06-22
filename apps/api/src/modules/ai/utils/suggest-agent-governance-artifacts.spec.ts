import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractProjectGovernanceFacts,
  extractProjectTitle,
  extractTaskCheckboxes,
  inferStacks,
  isValidBlueprintModulePath,
  suggestAgentGovernanceArtifacts,
} from "./suggest-agent-governance-artifacts.js";
import { parseAgentGovernanceResponse } from "./agent-governance.util.js";

const NEST_REACT_MDD = `
# MDD Proyecto Demo

## 2. Stack técnico
- Backend: NestJS con TypeScript
- Frontend: React 18 + Vite
- Monorepo con packages/api y packages/web

## 4. Contratos de API
REST con validación Zod y OpenAPI.

## 6. Seguridad
JWT y OAuth2 para sesiones.
`;

const ARIADNE_LEGACY_MDD = `
# MDD Legacy

## 1. Contexto
Integración MCP Ariadne para análisis de código legacy existente.
Proyecto strangler fig sobre monolito.

## 2. Stack
Backend Express, refactor incremental.
`;

const KMS_BLUEPRINT = `
## Estructura del repositorio

- kms-backend/
- packages/shared/
- packages/kms-auth/

## Convenciones

- **Autenticación/Autorización:** OAuth2 con JWT — no es una ruta de código.
- **Observabilidad:** logs estructurados y métricas Prometheus.
`;

const KMS_MDD = `# Master Design Document

## 1. Contexto

**(KMS Corporativo)** — plataforma documental API-first.

Este documento constituye el Master Design Document del proyecto.

## 2. Stack técnico

Backend NestJS. MVP API-only sin dashboard ni frontend.
Monorepo kms-backend/ y packages/shared.
`;

describe("suggestAgentGovernanceArtifacts", () => {
  it("MDD NestJS+React MEDIUM sugiere stack-backend, stack-frontend y orchestrator", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: NEST_REACT_MDD,
      complexity: "MEDIUM",
    });
    const ruleIds = result.suggestedRules.map((r) => r.id);
    assert.ok(ruleIds.includes("stack-backend"), `rules: ${ruleIds.join(",")}`);
    assert.ok(ruleIds.includes("stack-frontend"));
    assert.ok(ruleIds.includes("orchestrator"));
    assert.ok(ruleIds.includes("api-contracts"));
    assert.ok(result.archetypes.includes("nestjs-react-monorepo"));
  });

  it("MDD con Ariadne sugiere skill mcp-ariadne y rule mcp-governance", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: ARIADNE_LEGACY_MDD,
      complexity: "MEDIUM",
    });
    const skillIds = result.suggestedSkills.map((s) => s.id);
    const ruleIds = result.suggestedRules.map((r) => r.id);
    assert.ok(skillIds.includes("mcp-ariadne"), `skills: ${skillIds.join(",")}`);
    assert.ok(ruleIds.includes("mcp-governance"), `rules: ${ruleIds.join(",")}`);
    assert.ok(result.archetypes.includes("legacy-ariadne"));
  });

  it("LOW limita a pocas rules y sin skills", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: NEST_REACT_MDD,
      complexity: "LOW",
    });
    assert.ok(result.suggestedRules.length <= 2);
    assert.equal(result.suggestedSkills.length, 0);
    assert.ok(result.rationale.some((r) => /LOW/i.test(r)));
  });

  it("HIGH monorepo sugiere más skills (domain + monorepo)", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: NEST_REACT_MDD + "\nDesign system en packages/ui con Storybook.\n",
      complexity: "HIGH",
    });
    const skillIds = result.suggestedSkills.map((s) => s.id);
    assert.ok(skillIds.includes("domain-package"));
    assert.ok(
      skillIds.includes("monorepo-packages") || skillIds.includes("design-system-ui"),
      `skills: ${skillIds.join(",")}`,
    );
    assert.ok(
      result.rationale.some((r) => /monorepo|HIGH/i.test(r)),
      "debe mencionar monorepo o HIGH",
    );
  });
});

describe("inferStacks", () => {
  it("detecta Expo, Cloudflare Workers, Hono y FastAPI", () => {
    assert.equal(inferStacks("Mobile app con Expo SDK 52").mobile, "Expo");
    assert.equal(inferStacks("Backend: Cloudflare Workers con Hono").backend, "Cloudflare Workers");
    assert.equal(inferStacks("API en FastAPI con Python").backend, "FastAPI");
    assert.equal(inferStacks("Despliegue serverless en Cloudflare").infra, "Serverless");
  });

  it("prioriza Kubernetes sobre Docker en infra", () => {
    assert.equal(
      inferStacks("Deploy con Kubernetes y Helm charts").infra,
      "Kubernetes",
    );
  });
});

describe("archetype false positives", () => {
  it("no activa legacy-ariadne solo por FalkorDB fase 2", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# KMS
## Roadmap
Fase 2: índice FalkorDB para análisis futuro.
Backend NestJS API-only MVP sin dashboard.
`,
      complexity: "MEDIUM",
    });
    assert.equal(result.archetypes.includes("legacy-ariadne"), false);
    assert.equal(result.suggestedSkills.some((s) => s.id === "mcp-ariadne"), false);
  });

  it("no activa legacy-ariadne por grafo/FalkorDB fase 2 en blueprint KMS", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: KMS_MDD,
      blueprintMarkdown: `
## Stack
- **Base de datos grafo (fase 2):** FalkorDB (compatible con Neo4j)

# 4. Componentes transversales (pipeline, IA, grafo)

11. **Fase 2 (opcional)** – Integrar FalkorDB para grafo de dependencias.
`,
      complexity: "MEDIUM",
    });
    assert.equal(result.archetypes.includes("legacy-ariadne"), false);
    assert.equal(result.suggestedSkills.some((s) => s.id === "mcp-ariadne"), false);
  });

  it("no activa legacy-ariadne por Ariadne solo en roadmap diferido", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# Proyecto
## Roadmap
Fase 2 (opcional): evaluar integración con Ariadne para grafo futuro.
Backend NestJS API-only.
`,
      complexity: "MEDIUM",
    });
    assert.equal(result.archetypes.includes("legacy-ariadne"), false);
    assert.equal(result.suggestedSkills.some((s) => s.id === "mcp-ariadne"), false);
  });

  it("omite stack-frontend y design-system-ui en API-only sin UI", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# KMS Backend
## 2. Stack
Backend NestJS. API-only MVP sin dashboard ni frontend.
Monorepo kms-backend/ packages/shared
`,
      specMarkdown: "CLI-only para operaciones; sin interfaz web.",
      blueprintMarkdown: "## Árbol\n- kms-backend/\n- packages/shared/\n",
      complexity: "HIGH",
    });
    const ruleIds = result.suggestedRules.map((r) => r.id);
    const skillIds = result.suggestedSkills.map((s) => s.id);
    assert.equal(ruleIds.includes("stack-frontend"), false);
    assert.equal(skillIds.includes("design-system-ui"), false);
  });

  it("prefiere deploy-kubernetes sobre deploy-docker con señales K8s", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: `
# Plataforma
## 7. Infra
Despliegue en Kubernetes con Helm charts e ingress.
`,
      complexity: "HIGH",
    });
    assert.ok(result.archetypes.includes("kubernetes"));
    assert.ok(result.suggestedSkills.some((s) => s.id === "deploy-kubernetes"));
    assert.equal(result.suggestedSkills.some((s) => s.id === "deploy-docker"), false);
  });
});

describe("extractProjectTitle", () => {
  it("extrae KMS Corporativo desde §1 cuando el H1 es Master Design Document", () => {
    const title = extractProjectTitle({
      mddMarkdown: `# Master Design Document

## 1. Contexto

**(KMS Corporativo)** — plataforma de gestión documental para empresas.

## 2. Arquitectura y Stack
Backend NestJS.
`,
      complexity: "MEDIUM",
    });
    assert.equal(title, "KMS Corporativo");
  });

  it("extrae KMS Corporativo desde §1 cuando el H1 es Master Design Document (em-dash)", () => {
    const title = extractProjectTitle({
      mddMarkdown: `# Master Design Document

## 1. Contexto

KMS Corporativo — plataforma de gestión documental para empresas.

## 2. Arquitectura y Stack
Backend NestJS.
`,
      complexity: "MEDIUM",
    });
    assert.equal(title, "KMS Corporativo");
  });

  it("prefiere projectName si §1 no tiene línea útil", () => {
    const title = extractProjectTitle({
      mddMarkdown: `# Master Design Document

## 1. Contexto

`,
      projectName: "Portal Clientes",
      complexity: "LOW",
    });
    assert.equal(title, "Portal Clientes");
  });

  it("prioriza projectName sobre entidad §1 con em-dash (patrón MDD real)", () => {
    const mddWithEntityBullets = `# Master Design Document

## 1. Contexto y entidades principales

### Entidades principales

- Geografía (país, estado, ciudad, plaza, ubicación) – tablas espejo
- Producto (SKU, precio, moneda) – catálogo central

## 2. Arquitectura y Stack
Backend NestJS.
`;

    assert.equal(
      extractProjectTitle({
        mddMarkdown: mddWithEntityBullets,
        projectName: "IMJ",
        complexity: "MEDIUM",
      }),
      "IMJ",
    );

    const microServicio = "Micro Servicio de costos y listas de precios";
    assert.equal(
      extractProjectTitle({
        mddMarkdown: mddWithEntityBullets,
        projectName: microServicio,
        complexity: "MEDIUM",
      }),
      microServicio,
    );
  });
});

const KMS_BLUEPRINT_PROSE_FRAGMENT = `
## Modelo de datos

- Entidades \`WorkflowProcess\`, \`Document\`
- Tabla \`audit_logs\`
- Todos los módulos en kms-backend/

## Schemas

- Schemas en Prisma para users y sessions

## Estructura del repositorio

- kms-backend/
- packages/shared/
- packages/kms-auth/
`;

describe("extractProjectGovernanceFacts", () => {
  it("filtra bullets prose del Blueprint y mantiene rutas reales", () => {
    const facts = extractProjectGovernanceFacts({
      mddMarkdown: KMS_MDD,
      blueprintMarkdown: KMS_BLUEPRINT,
      complexity: "HIGH",
    });
    assert.ok(facts.blueprintModules.includes("kms-backend"));
    assert.ok(facts.blueprintModules.includes("packages/shared"));
    assert.equal(
      facts.blueprintModules.some((m) => /autenticaci/i.test(m)),
      false,
    );
    assert.ok(facts.backendGlobs.every((g) => /^[\w./-]+\/\*\*$/.test(g)));
    assert.ok(facts.backendGlobs.some((g) => g.includes("kms-backend")));
  });

  it("rechaza prosa KMS (Entidades, Tabla, Todos, Schemas) y conserva árbol real", () => {
    const facts = extractProjectGovernanceFacts({
      mddMarkdown: KMS_MDD,
      blueprintMarkdown: KMS_BLUEPRINT_PROSE_FRAGMENT,
      complexity: "HIGH",
    });
    assert.deepEqual(facts.blueprintModules, [
      "kms-backend",
      "packages/shared",
      "packages/kms-auth",
    ]);
    for (const junk of ["Entidades", "Tabla", "Todos", "Schemas", "En"]) {
      assert.equal(
        facts.blueprintModules.some((m) => m.toLowerCase() === junk.toLowerCase()),
        false,
        `no debe incluir módulo basura: ${junk}`,
      );
    }
    assert.ok(facts.backendGlobs.some((g) => g.startsWith("kms-backend/")));
    assert.ok(facts.backendGlobs.some((g) => g.startsWith("packages/shared/")));
    assert.equal(facts.backendGlobs.some((g) => /Entidades|Tabla/i.test(g)), false);
  });

  it("ignora frontend aunque exista ux-ui-guide post-MVP", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: KMS_MDD,
      specMarkdown: "CLI-only para operaciones; sin interfaz web.",
      blueprintMarkdown: KMS_BLUEPRINT,
      uxUiGuideMarkdown: "# UX post-MVP\nDashboard React con design system.\n",
      complexity: "HIGH",
    });
    const ruleIds = result.suggestedRules.map((r) => r.id);
    const skillIds = result.suggestedSkills.map((s) => s.id);
    assert.equal(ruleIds.includes("stack-frontend"), false);
    assert.equal(skillIds.includes("design-system-ui"), false);
    assert.equal(result.archetypes.includes("design-system-ui"), false);
  });

  it("usa título del MDD y globs del Blueprint", () => {
    const facts = extractProjectGovernanceFacts({
      mddMarkdown: "# KMS Platform\n## 1. Visión\nSistema de llaves.\n",
      blueprintMarkdown: "## Módulos\n- kms-backend/\n- packages/shared/\n",
      tasksMarkdown: "- [ ] Configurar monorepo\n- [ ] Primer endpoint\n",
      complexity: "MEDIUM",
    });
    assert.equal(facts.projectTitle, "KMS Platform");
    assert.ok(facts.backendGlobs.some((g) => g.includes("kms-backend")));
    assert.ok(facts.docPaths.includes("docs/sdd/api-contracts.md") === false);
  });

  it("prioriza projectName sobre entidad §1 cuando H1 es Master Design Document", () => {
    const projectName = "Micro Servicio de costos y listas de precios";
    const facts = extractProjectGovernanceFacts({
      mddMarkdown: `
# Master Design Document
## 1. Entidades del dominio

### Entidades principales

- Geografía (país, estado, ciudad, plaza, ubicación) – tablas espejo
- Producto (SKU, precio, moneda) – catálogo central
## 2. Stack
Backend NestJS.
`,
      projectName,
      complexity: "MEDIUM",
    });
    assert.equal(facts.projectTitle, projectName);
  });

  it("inferNpmScripts expande capturas reales, no el índice $1", () => {
    const facts = extractProjectGovernanceFacts({
      mddMarkdown: "Monorepo. Ejecutar npm run test y npm run lint antes de merge.",
      complexity: "MEDIUM",
    });
    assert.ok(facts.npmScripts.some((s) => s === "npm run test"));
    assert.ok(facts.npmScripts.some((s) => s === "npm run lint"));
    assert.equal(facts.npmScripts.some((s) => s === "npm run 1"), false);
  });

  it("nombra skill de dominio desde carpeta Blueprint", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: "# KMS\nBackend NestJS monorepo.",
      blueprintMarkdown: "- kms-backend/src/\n- packages/kms-shared/\n",
      complexity: "HIGH",
    });
    const domain = result.suggestedSkills.find((s) => s.id === "domain-package");
    assert.ok(domain);
    assert.equal(domain.folder, "kms-backend");
    assert.match(domain.path, /kms-backend/);
  });

  it("extrae checkboxes concretos para PROMPT-INICIAL", () => {
    const boxes = extractTaskCheckboxes(`
## Fase 1
- [ ] Configurar monorepo pnpm
- [ ] Crear módulo auth
- [x] Hecho
`);
    assert.equal(boxes.length, 2);
    assert.match(boxes[0], /Configurar monorepo/);
  });
});

describe("isValidBlueprintModulePath", () => {
  it("acepta apps/packages/kms paths y rechaza prose", () => {
    assert.equal(isValidBlueprintModulePath("kms-backend/"), true);
    assert.equal(isValidBlueprintModulePath("packages/shared"), true);
    assert.equal(isValidBlueprintModulePath("apps/api"), true);
    assert.equal(isValidBlueprintModulePath("**Autenticación/Autorización:** OAuth2"), false);
    assert.equal(isValidBlueprintModulePath("Observabilidad: logs"), false);
    assert.equal(isValidBlueprintModulePath("Entidades"), false);
    assert.equal(isValidBlueprintModulePath("Tabla"), false);
    assert.equal(isValidBlueprintModulePath("Todos"), false);
    assert.equal(isValidBlueprintModulePath("Schemas"), false);
    assert.equal(isValidBlueprintModulePath("Si"), false);
    assert.equal(isValidBlueprintModulePath("En"), false);
  });
});

describe("suggestAgentGovernanceArtifacts con Tasks y Architecture", () => {
  it("usa Tasks y Architecture en rationale y facts", () => {
    const result = suggestAgentGovernanceArtifacts({
      mddMarkdown: NEST_REACT_MDD,
      blueprintMarkdown: "## Módulos\n- `apps/api`\n- `apps/mobile`\n",
      tasksMarkdown: "## Fase 1\n### Configurar monorepo\n",
      architectureMarkdown: "## Capa API\n## Capa UI\n",
      complexity: "HIGH",
    });
    assert.ok(result.rationale.some((r) => /Tasks disponibles/i.test(r)));
  });
});

describe("parseAgentGovernanceResponse + sugerencias", () => {
  it("añade rules omitidas por el LLM desde catálogo (strong y weak)", () => {
    const suggestions = suggestAgentGovernanceArtifacts({
      mddMarkdown: NEST_REACT_MDD,
      complexity: "MEDIUM",
    });
    const raw = JSON.stringify({
      files: {
        "AGENTS.md": "# AGENTS\n",
        "CLAUDE.md": "@AGENTS.md\n",
      },
    });
    const scaffold = parseAgentGovernanceResponse(raw, "MEDIUM", {
      suggestions,
      governanceInput: {
        mddMarkdown: NEST_REACT_MDD,
        complexity: "MEDIUM",
      },
    });
    const paths = scaffold.files.map((f) => f.path);
    assert.ok(
      paths.includes("docs/agent-governance/rules/stack-backend.mdc"),
      `paths: ${paths.filter((p) => p.includes("rules")).join(",")}`,
    );
    assert.ok(
      paths.includes("docs/agent-governance/rules/orchestrator.mdc"),
      `orchestrator weak también debe materializarse; rules: ${paths.filter((p) => p.includes("rules")).join(",")}`,
    );
    assert.ok(scaffold.manifest.suggestions?.archetypes.includes("nestjs-react-monorepo"));
    const comoUsar = scaffold.files.find(
      (f) => f.path === "docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md",
    );
    assert.ok(comoUsar?.content.includes("Por qué se incluyeron estos skills/rules"));
    assert.ok(paths.includes("PROMPT-INICIAL.md"));
    assert.ok(paths.includes("docs/sdd/PROGRESO.md"));
  });
});
