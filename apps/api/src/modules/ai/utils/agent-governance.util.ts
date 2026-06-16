import {
  AGENT_GOVERNANCE_TEMPLATE_VERSION,
  buildGovernanceInstallMap,
  GOVERNANCE_DOCS_PREFIX,
  migrateGovernancePath,
  type AgentGovernanceFile,
  type AgentGovernanceScaffold,
  type AgentGovernanceSuggestionsManifest,
  type ComplexityLevel,
} from "@theforge/shared-types";
import {
  getRuleById,
  getSkillById,
  type RuleCatalogEntry,
  type SkillCatalogEntry,
} from "./agent-governance-catalog.js";
import {
  buildArtifactTemplateContext,
  type AgentGovernanceSuggestions,
} from "./suggest-agent-governance-artifacts.js";

/** Rutas obligatorias en todos los niveles de complejidad. */
export const AGENT_GOVERNANCE_REQUIRED_ALL = [
  "AGENTS.md",
  "CLAUDE.md",
  `${GOVERNANCE_DOCS_PREFIX}agent-onboarding.md`,
  `${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`,
  `${GOVERNANCE_DOCS_PREFIX}INSTALACION.md`,
] as const;

// ── Multi-target path mapping ────────────────────────────────────────

export type GovernanceTarget = "cursor" | "openhands" | "hermes";

/** Reglas de renombre de paths por target. Se aplican en orden. */
const TARGET_PATH_MAP: Record<GovernanceTarget, Array<{ from: RegExp; to: string | ((match: RegExpMatchArray) => string) }>> = {
  cursor: [
    // Cursor es el default — solo normaliza paths de LLM
    { from: /^\.cursor\//, to: `${GOVERNANCE_DOCS_PREFIX}` },
  ],
  openhands: [
    // OpenHands: reglas → .openhands/rules/, skills → .openhands/skills/
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}rules/(.+\\.mdc)$`), to: ".openhands/rules/$1" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}skills/(.+)/SKILL\\.md$`), to: ".openhands/skills/$1/SKILL.md" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}references/`), to: ".openhands/references/" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}mcp\\.json\\.example$`), to: ".openhands/mcp.json" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}`), to: ".openhands/" },
    // Omitir shims de Cursor
    { from: /^CLAUDE\.md$/, to: "" }, // omitido
    { from: /^\.cursor\//, to: ".openhands/" },
  ],
  hermes: [
    // Hermes: skills → .hermes/skills/, reglas se convierten en skills
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}rules/(.+)\\.mdc$`), to: ".hermes/skills/$1/SKILL.md" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}skills/(.+)/SKILL\\.md$`), to: ".hermes/skills/$1/SKILL.md" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}references/`), to: ".hermes/references/" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}mcp\\.json\\.example$`), to: ".hermes/mcp.json.example" },
    { from: new RegExp(`^${GOVERNANCE_DOCS_PREFIX}`), to: ".hermes/" },
    // Omitir shims de Cursor
    { from: /^CLAUDE\.md$/, to: "" }, // omitido
    { from: /^\.cursor\//, to: ".hermes/" },
  ],
};

/** Aplica el mapeo de paths según el target. Retorna nuevo path (o "" para omitir). */
function remapPathForTarget(rawPath: string, target: GovernanceTarget): string {
  const normalized = rawPath.trim();
  const rules = TARGET_PATH_MAP[target];
  for (const rule of rules) {
    const match = normalized.match(rule.from);
    if (match) {
      if (typeof rule.to === "function") return rule.to(match);
      return rule.to; // "" => omitir
    }
  }
  // Sin match = mantener el path original
  return normalized;
}

/**
 * Transforma todos los paths de un scaffold al target especificado.
 * Omite archivos cuyo path queda vacío (ej. CLAUDE.md en openhands/hermes).
 */
function remapGovernanceScaffold(scaffold: AgentGovernanceScaffold, target: GovernanceTarget): AgentGovernanceScaffold {
  if (target === "cursor") return scaffold; // no-op

  const remappedFiles: AgentGovernanceFile[] = [];
  const remappedManifestPaths: string[] = [];

  for (const file of scaffold.files) {
    const newPath = remapPathForTarget(file.path, target);
    if (!newPath) continue; // omitir
    remappedFiles.push({ ...file, path: newPath });
    remappedManifestPaths.push(newPath);
  }

  return {
    ...scaffold,
    manifest: {
      ...scaffold.manifest,
      files: remappedManifestPaths,
    },
    files: remappedFiles,
  };
}

/** Rutas obligatorias a partir de MEDIUM. */
export const AGENT_GOVERNANCE_REQUIRED_MEDIUM = [
  `${GOVERNANCE_DOCS_PREFIX}references/workflows.md`,
  `${GOVERNANCE_DOCS_PREFIX}references/CURSOR_SKILLS_Y_RULES.md`,
  `${GOVERNANCE_DOCS_PREFIX}references/PROMPT_HANDOFF_AGENTE.md`,
  `${GOVERNANCE_DOCS_PREFIX}mcp.json.example`,
  "scripts/install-agent-governance.sh",
] as const;

function stripJsonFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function defaultClaudeShim(): string {
  return "@AGENTS.md\n";
}

function defaultInstallMapTableRows(): string {
  return (
    "| `docs/agent-governance/rules/*.mdc` | `.cursor/rules/*.mdc` |\n" +
    "| `docs/agent-governance/skills/*/SKILL.md` | `.cursor/skills/*/SKILL.md` |\n" +
    "| `docs/agent-governance/references/*` | `.cursor/references/*` |\n" +
    "| `docs/agent-governance/mcp.json.example` | `.cursor/mcp.json` |\n"
  );
}

function defaultAgentsMd(): string {
  return (
    "# AGENTS\n\n" +
    "Punto de entrada para agentes de código (Cursor, Claude Code, Copilot, etc.).\n\n" +
    "## Instalación de gobernanza\n\n" +
    "El ZIP **no incluye** la carpeta oculta `.cursor/` (macOS/Finder la oculta al extraer). " +
    "Los artefactos viven en `docs/agent-governance/`; instálalos en el repo destino así:\n\n" +
    "1. Lee `docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md` y `docs/agent-governance/INSTALACION.md`.\n" +
    "2. Copia o mapea cada archivo según la tabla (o ejecuta `scripts/install-agent-governance.sh`).\n\n" +
    "| Archivo en ZIP | Destino en repo destino |\n" +
    "|----------------|-------------------------|\n" +
    defaultInstallMapTableRows() +
    "\n" +
    "- **Uso del paquete:** `docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md`\n" +
    "- **Onboarding:** `docs/agent-governance/agent-onboarding.md`\n" +
    "- **Instalación paso a paso:** `docs/agent-governance/INSTALACION.md`\n"
  );
}

function defaultAgentOnboarding(): string {
  return (
    "# Onboarding para agentes implementadores\n\n" +
    "1. Lee **`docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md`** (guía principal).\n" +
    "2. Si aún no instalaste gobernanza en `.cursor/`, sigue **`docs/agent-governance/INSTALACION.md`**.\n" +
    "3. Lee el **MDD** (Constitución) y el **Blueprint** si existe.\n" +
    "4. Consulta la guía de consumo de documentos TheForge: `THEFORGE-DOC-CONSUMPTION-GUIDE.md`.\n" +
    "5. Carga `AGENTS.md` y las rules/skills en `.cursor/` según la tarea.\n" +
    "6. Antes de implementar, confirma gates (lint, typecheck, tests) definidos en workflows.\n"
  );
}

function defaultInstalacion(): string {
  return (
    "# Instalación de gobernanza IA en el repo destino\n\n" +
    "Este paquete TheForge entrega reglas, skills y referencias bajo **`docs/agent-governance/`** " +
    "(visible en Finder y al extraer el ZIP). En el repo destino deben vivir en **`.cursor/`** " +
    "para que Cursor y herramientas compatibles las carguen automáticamente.\n\n" +
    "## Opción A — Script (recomendado)\n\n" +
    "Desde la raíz del repo destino (tras copiar el ZIP):\n\n" +
    "```bash\n" +
    "chmod +x scripts/install-agent-governance.sh\n" +
    "./scripts/install-agent-governance.sh\n" +
    "```\n\n" +
    "## Opción B — Copia manual\n\n" +
    "| Archivo en ZIP | Destino en repo destino |\n" +
    "|----------------|-------------------------|\n" +
    defaultInstallMapTableRows() +
    "\n" +
    "Crea las carpetas si no existen: `.cursor/rules/`, `.cursor/skills/`, `.cursor/references/`.\n\n" +
    "## Opción C — One-liner\n\n" +
    "```bash\n" +
    "mkdir -p .cursor/{rules,skills,references} && \\\n" +
    "cp docs/agent-governance/rules/*.mdc .cursor/rules/ 2>/dev/null; \\\n" +
    "cp -R docs/agent-governance/skills/* .cursor/skills/ 2>/dev/null; \\\n" +
    "cp docs/agent-governance/references/* .cursor/references/ 2>/dev/null; \\\n" +
    "cp docs/agent-governance/mcp.json.example .cursor/mcp.json 2>/dev/null\n" +
    "```\n\n" +
    "## Verificación\n\n" +
    "- `AGENTS.md` y `CLAUDE.md` quedan en la **raíz** del repo (no se mueven).\n" +
    "- Abre el proyecto en Cursor y confirma que aparecen rules/skills en configuración.\n" +
    "- Consulta `MANIFEST.json` → `installMap` para el mapeo exacto de este paquete.\n"
  );
}

function defaultInstallScript(): string {
  return (
    "#!/usr/bin/env bash\n" +
    "# Instala gobernanza IA desde docs/agent-governance/ hacia .cursor/\n" +
    "set -euo pipefail\n" +
    'ROOT="$(cd "$(dirname "$0")/.." && pwd)"\n' +
    'SRC="$ROOT/docs/agent-governance"\n' +
    'mkdir -p "$ROOT/.cursor/rules" "$ROOT/.cursor/skills" "$ROOT/.cursor/references"\n' +
    'if [[ -d "$SRC/rules" ]]; then cp -f "$SRC/rules/"*.mdc "$ROOT/.cursor/rules/" 2>/dev/null || true; fi\n' +
    'if [[ -d "$SRC/skills" ]]; then cp -R "$SRC/skills/"* "$ROOT/.cursor/skills/" 2>/dev/null || true; fi\n' +
    'if [[ -d "$SRC/references" ]]; then cp -f "$SRC/references/"* "$ROOT/.cursor/references/" 2>/dev/null || true; fi\n' +
    'if [[ -f "$SRC/mcp.json.example" ]]; then cp -f "$SRC/mcp.json.example" "$ROOT/.cursor/mcp.json"; fi\n' +
    'echo "Gobernanza instalada en .cursor/ (rules, skills, references, mcp.json)."\n'
  );
}

function formatSuggestionsRationaleTable(suggestions: AgentGovernanceSuggestions | null | undefined): string {
  if (!suggestions?.rationale.length && !suggestions?.suggestedRules.length) return "";

  const rows: string[] = [];
  for (const r of suggestions?.suggestedRules ?? []) {
    rows.push(`| \`${r.path}\` | rule | ${r.purpose} | ${r.strength} |`);
  }
  for (const s of suggestions?.suggestedSkills ?? []) {
    rows.push(`| \`${s.path}\` | skill | ${s.purpose} | ${s.strength} |`);
  }

  let block =
    "## 8. Por qué se incluyeron estos skills/rules\n\n" +
    "Sugerencias del **detector TheForge** según MDD, Blueprint, complejidad y patrones wizard.\n\n";

  if (suggestions?.archetypes.length) {
    block += `**Arquetipos:** ${suggestions.archetypes.join(", ")}\n\n`;
  }

  if (rows.length > 0) {
    block +=
      "| Artefacto | Tipo | Propósito | Señal |\n" +
      "|-----------|------|-----------|-------|\n" +
      rows.join("\n") +
      "\n\n";
  }

  const extra = (suggestions?.rationale ?? []).slice(0, 8);
  if (extra.length > 0) {
    block += "**Notas del detector:**\n\n";
    for (const line of extra) block += `- ${line}\n`;
    block += "\n";
  }

  return block;
}

function defaultComoUsarGovernanza(suggestions?: AgentGovernanceSuggestions | null): string {
  return (
    "# Cómo usar la gobernanza de agentes IA\n\n" +
    "## 1. Qué es este paquete\n\n" +
    "Este directorio es un **scaffold ejecutable** generado por **TheForge** " +
    "como entregable `agent_governance`, derivado del MDD del proyecto. Contiene reglas, skills y " +
    "referencias para que agentes de código implementen el repositorio con el stack y dominio acordados.\n\n" +
    "Los archivos están en **`docs/agent-governance/`** (visible al extraer el ZIP). " +
    "En el repo destino se instalan en **`.cursor/`** — ver **`INSTALACION.md`** en esta carpeta.\n\n" +
    "## 2. Instalación\n\n" +
    "1. Copia el contenido del ZIP a la **raíz del repositorio destino**.\n" +
    "2. Lee **`INSTALACION.md`** (esta carpeta) y ejecuta el script o la tabla de mapeo.\n" +
    "3. `AGENTS.md` y `CLAUDE.md` permanecen en la raíz; rules/skills van a `.cursor/`.\n\n" +
    "Árbol en el ZIP (sin carpetas ocultas):\n\n" +
    "```\n" +
    "AGENTS.md\n" +
    "CLAUDE.md\n" +
    "docs/agent-governance/\n" +
    "├── COMO-USAR-GOBERNANZA-IA.md\n" +
    "├── INSTALACION.md\n" +
    "├── agent-onboarding.md\n" +
    "├── rules/\n" +
    "├── skills/\n" +
    "├── references/\n" +
    "└── mcp.json.example\n" +
    "scripts/install-agent-governance.sh\n" +
    "MANIFEST.json\n" +
    "```\n\n" +
    "## 3. Artefactos\n\n" +
    "| Artefacto | Función |\n" +
    "|-----------|--------|\n" +
    "| `AGENTS.md` | Punto de entrada cross-tool; incluye tabla de instalación |\n" +
    "| `CLAUDE.md` | Shim que delega en `AGENTS.md` (`@AGENTS.md`) |\n" +
    "| `docs/agent-governance/rules/*.mdc` | Política (se copia a `.cursor/rules/`) |\n" +
    "| `docs/agent-governance/skills/*/SKILL.md` | Guías de dominio (→ `.cursor/skills/`) |\n" +
    "| `docs/agent-governance/references/` | Workflows, handoff, mantenimiento (→ `.cursor/references/`) |\n" +
    "| `docs/agent-governance/mcp.json.example` | Plantilla MCP (→ `.cursor/mcp.json`) |\n" +
    "| `MANIFEST.json` | Índice, `installMap` y `templateVersion` |\n\n" +
    "## 4. Orden de lectura recomendado\n\n" +
    "1. Este archivo\n" +
    "2. `INSTALACION.md`\n" +
    "3. `AGENTS.md` (raíz)\n" +
    "4. `agent-onboarding.md`\n" +
    "5. Rules con `alwaysApply: true` (tras instalar en `.cursor/rules/`)\n" +
    "6. MDD y Blueprint del proyecto\n\n" +
    "## 5. Subflujos y cuándo cargar qué\n\n" +
    "- **Feature:** `AGENTS.md` → rule de stack → skill de dominio → `references/workflows.md`\n" +
    "- **Debug:** rule de stack + workflows (Debug)\n" +
    "- **Refactor (MEDIUM+):** skill MCP/arquitectura si el MDD lo declara\n" +
    "- **Consumo docs TheForge:** sección 7\n\n" +
    "## 6. Mantenimiento\n\n" +
    "- Regenera desde TheForge Workshop tras cambios en el MDD.\n" +
    "- Nuevas rules/skills: `references/CURSOR_SKILLS_Y_RULES.md`.\n" +
    "- Handoff: `references/PROMPT_HANDOFF_AGENTE.md`.\n\n" +
    "## 7. Consumo de documentación TheForge\n\n" +
    "Consulta **`THEFORGE-DOC-CONSUMPTION-GUIDE.md`**; no dupliques esa guía aquí.\n" +
    formatSuggestionsRationaleTable(suggestions)
  );
}

function defaultCursorSkillsYRules(): string {
  return (
    "# Skills y reglas de Cursor en este proyecto\n\n" +
    "Guía para **añadir o mantener** Agent Skills y Cursor Rules.\n\n" +
    "## Dónde vive cada cosa\n\n" +
    "| Artefacto | Ruta en repo (tras instalar) | Fuente en ZIP |\n" +
    "|-----------|------------------------------|---------------|\n" +
    "| Entrada agente | `AGENTS.md` | raíz del ZIP |\n" +
    "| Skills | `.cursor/skills/<nombre>/SKILL.md` | `docs/agent-governance/skills/` |\n" +
    "| Reglas | `.cursor/rules/<nombre>.mdc` | `docs/agent-governance/rules/` |\n" +
    "| Referencias | `.cursor/references/` | `docs/agent-governance/references/` |\n\n" +
    "## Checklist al añadir o cambiar\n\n" +
    "1. Skill nueva: `.cursor/skills/<name>/SKILL.md` con frontmatter `name` y `description`.\n" +
    "2. Regla nueva: `.cursor/rules/<name>.mdc` con `description` y `globs` o `alwaysApply`.\n" +
    "3. Actualiza `AGENTS.md` si cambia el mapa global.\n" +
    "4. Documenta el subflujo en `workflows.md`.\n"
  );
}

function defaultPromptHandoff(): string {
  return (
    "# Prompt: handoff entre agentes (pegar en nueva conversación)\n\n" +
    "Copia el bloque siguiente y envíalo al **nuevo agente** al cambiar de sesión o modelo.\n\n" +
    "---\n\n" +
    "## Instrucciones para el agente (handoff)\n\n" +
    "Continúas el trabajo en este repositorio. Antes de implementar:\n\n" +
    "0. Lee `@AGENTS.md` y `docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md`.\n" +
    "1. Confirma que gobernanza está instalada en `.cursor/` (ver `docs/agent-governance/INSTALACION.md`).\n" +
    "2. Inventario: `.cursor/skills/*/SKILL.md` y `.cursor/rules/*.mdc`.\n" +
    "3. Carga la skill/rule del subflujo (ver `@.cursor/references/workflows.md`).\n" +
    "4. Respeta gates (lint, typecheck, tests) del MDD.\n\n" +
    "**Contexto del handoff (rellena el humano):**\n\n" +
    "- Objetivo pendiente:\n" +
    "- Archivos ya modificados:\n" +
    "- Restricciones:\n\n" +
    "---\n\n" +
    "Fin del prompt de handoff.\n"
  );
}

function defaultWorkflows(complexity: ComplexityLevel): string {
  const lines = [
    "# Workflows de agente\n\n",
    "Cada subflujo: **trigger** → **roles** → **gates** → **archivos a cargar**.\n\n",
    "## Feature\n\n",
    "- **Trigger:** nueva funcionalidad o ticket de producto\n",
    "- **Roles:** PM (alcance) → Dev → QA → Reviewer\n",
    "- **Gates:** lint, typecheck, tests del paquete tocado\n",
    "- **Cargar:** `AGENTS.md`, rules de stack, skill de dominio\n\n",
    "## Debug\n\n",
    "- **Trigger:** bug, regresión, fallo de CI\n",
    "- **Roles:** Dev → QA\n",
    "- **Gates:** reproducir + test que falle en rojo antes del fix\n",
    "- **Cargar:** rules de stack, `workflows.md`\n\n",
    "## Consumo docs TheForge\n\n",
    "- **Trigger:** implementar desde entregables SDD\n",
    "- **Cargar:** MDD, Blueprint, `THEFORGE-DOC-CONSUMPTION-GUIDE.md`\n\n",
  ];
  if (complexity !== "LOW") {
    lines.push(
      "## Refactor\n\n",
      "- **Trigger:** refactor con impacto multi-archivo\n",
      "- **Gates:** análisis de impacto; MCP de grafo si el MDD lo declara\n",
      "- **Cargar:** skill MCP/arquitectura si aplica\n\n",
      "## PR / Review\n\n",
      "- **Trigger:** abrir o revisar pull request\n",
      "- **Gates:** diff acotado, convenciones del repo\n\n",
    );
  }
  if (complexity === "HIGH") {
    lines.push(
      "## Auditoría de módulo\n\n",
      "- **Trigger:** revisión completa de un módulo o paquete\n",
      "- **Gates:** lint + typecheck + tests en verde\n\n",
      "## Publicación de paquete\n\n",
      "- **Trigger:** solo con petición explícita que nombre el paquete\n",
      "- **Gates:** QA humano + checklist de release del proyecto\n\n",
    );
  }
  return lines.join("");
}

function defaultMcpJson(): string {
  return JSON.stringify(
    {
      mcpServers: {
        example: {
          url: "{{API_URL}}",
          headers: {
            Authorization: "Bearer {{PROJECT_ID}}",
          },
        },
      },
    },
    null,
    2,
  );
}

/** Rutas obligatorias según complejidad (sin MANIFEST.json). */
export function getRequiredAgentGovernancePaths(complexity: ComplexityLevel): string[] {
  const paths: string[] = [...AGENT_GOVERNANCE_REQUIRED_ALL];
  if (complexity !== "LOW") {
    paths.push(...AGENT_GOVERNANCE_REQUIRED_MEDIUM);
  }
  return paths;
}

function normalizePath(path: string): string {
  return migrateGovernancePath(path);
}

function recordToFileEntries(files: Record<string, string>): AgentGovernanceFile[] {
  return Object.entries(files)
    .filter(([path, content]) => path.trim().length > 0 && typeof content === "string")
    .map(([path, content]) => ({ path: normalizePath(path), content }))
    .filter((f) => f.path.length > 0 && f.path !== "MANIFEST.json")
    .sort((a, b) => a.path.localeCompare(b.path));
}

function capRulesAndSkills(files: Record<string, string>): Record<string, string> {
  const rules = Object.keys(files).filter(
    (p) => p.startsWith(`${GOVERNANCE_DOCS_PREFIX}rules/`) && p.endsWith(".mdc"),
  );
  const skills = Object.keys(files).filter(
    (p) => p.includes(`${GOVERNANCE_DOCS_PREFIX}skills/`) && p.endsWith("SKILL.md"),
  );
  const out = { ...files };
  if (rules.length > 8) {
    for (const drop of rules.slice(8)) delete out[drop];
  }
  if (skills.length > 5) {
    for (const drop of skills.slice(5)) delete out[drop];
  }
  return out;
}

function parseLlmFilesPayload(parsed: unknown): Record<string, string> {
  if (!parsed || typeof parsed !== "object") return {};
  const root = parsed as Record<string, unknown>;

  if (root.files && typeof root.files === "object" && !Array.isArray(root.files)) {
    const out: Record<string, string> = {};
    for (const [path, value] of Object.entries(root.files as Record<string, unknown>)) {
      if (typeof value === "string") out[normalizePath(path)] = value;
    }
    return out;
  }

  if (Array.isArray(root.files)) {
    const out: Record<string, string> = {};
    for (const item of root.files) {
      if (!item || typeof item !== "object") continue;
      const { path, content } = item as { path?: unknown; content?: unknown };
      if (typeof path === "string" && typeof content === "string") {
        out[normalizePath(path)] = content;
      }
    }
    return out;
  }

  return {};
}

type FallbackFactory = (
  complexity: ComplexityLevel,
  suggestions?: AgentGovernanceSuggestions | null,
) => string;

const FALLBACK_BY_PATH: Record<string, FallbackFactory> = {
  "AGENTS.md": () => defaultAgentsMd(),
  "CLAUDE.md": () => defaultClaudeShim(),
  [`${GOVERNANCE_DOCS_PREFIX}agent-onboarding.md`]: () => defaultAgentOnboarding(),
  [`${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`]: (_c, s) => defaultComoUsarGovernanza(s),
  [`${GOVERNANCE_DOCS_PREFIX}INSTALACION.md`]: () => defaultInstalacion(),
  [`${GOVERNANCE_DOCS_PREFIX}references/workflows.md`]: (c) => defaultWorkflows(c),
  [`${GOVERNANCE_DOCS_PREFIX}references/CURSOR_SKILLS_Y_RULES.md`]: () => defaultCursorSkillsYRules(),
  [`${GOVERNANCE_DOCS_PREFIX}references/PROMPT_HANDOFF_AGENTE.md`]: () => defaultPromptHandoff(),
  [`${GOVERNANCE_DOCS_PREFIX}mcp.json.example`]: () => defaultMcpJson(),
  "scripts/install-agent-governance.sh": () => defaultInstallScript(),
};

function ensureAgentsInstallSection(fileMap: Record<string, string>): void {
  const path = "AGENTS.md";
  const current = fileMap[path]?.trim() ?? "";
  if (!current.includes("Instalación de gobernanza")) {
    fileMap[path] = current.length > 0 ? `${current.trimEnd()}\n\n${defaultAgentsMd()}` : defaultAgentsMd();
  }
}

function applyRequiredFileFallbacks(
  fileMap: Record<string, string>,
  complexity: ComplexityLevel,
  suggestions?: AgentGovernanceSuggestions | null,
): string[] {
  const missing: string[] = [];
  for (const required of getRequiredAgentGovernancePaths(complexity)) {
    if (!fileMap[required]?.trim()) {
      missing.push(required);
      const factory = FALLBACK_BY_PATH[required];
      if (factory) fileMap[required] = factory(complexity, suggestions);
    }
  }
  ensureAgentsInstallSection(fileMap);
  return missing;
}

function renderRuleFromCatalog(
  rule: RuleCatalogEntry,
  ctx: ReturnType<typeof buildArtifactTemplateContext>,
): string {
  return rule.template(ctx);
}

function renderSkillFromCatalog(
  skill: SkillCatalogEntry,
  ctx: ReturnType<typeof buildArtifactTemplateContext>,
  folder: string,
): string {
  const prev = ctx.domainSkillFolder;
  if (skill.dynamicFolder) {
    ctx.domainSkillFolder = folder;
  }
  const content = skill.template(ctx);
  ctx.domainSkillFolder = prev;
  return content;
}

function mergeSuggestedArtifacts(
  fileMap: Record<string, string>,
  complexity: ComplexityLevel,
  suggestions: AgentGovernanceSuggestions | null | undefined,
  mddMarkdown: string,
): string[] {
  if (!suggestions) return [];

  const added: string[] = [];
  const ctx = buildArtifactTemplateContext(suggestions, complexity, mddMarkdown);

  for (const spec of suggestions.suggestedRules) {
    const path = normalizePath(spec.path);
    if (fileMap[path]?.trim()) continue;
    const rule = getRuleById(spec.id);
    if (!rule) continue;
    fileMap[path] = renderRuleFromCatalog(rule, ctx);
    added.push(path);
  }

  for (const spec of suggestions.suggestedSkills) {
    const path = normalizePath(spec.path);
    if (fileMap[path]?.trim()) continue;
    const skill = getSkillById(spec.id);
    if (!skill) continue;
    fileMap[path] = renderSkillFromCatalog(skill, ctx, spec.folder);
    added.push(path);
  }

  return added;
}

function appendSuggestionsToComoUsar(
  fileMap: Record<string, string>,
  suggestions: AgentGovernanceSuggestions | null | undefined,
): void {
  const path = `${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`;
  const table = formatSuggestionsRationaleTable(suggestions);
  if (!table.trim()) return;
  const current = fileMap[path] ?? defaultComoUsarGovernanza(suggestions);
  if (current.includes("Por qué se incluyeron estos skills/rules")) return;
  fileMap[path] = current.trimEnd() + "\n\n" + table;
}

function toManifestSuggestions(
  suggestions: AgentGovernanceSuggestions | null | undefined,
): AgentGovernanceSuggestionsManifest | undefined {
  if (!suggestions) return undefined;
  const entries = [
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
  ];
  return {
    archetypes: suggestions.archetypes,
    rationale: suggestions.rationale,
    entries,
  };
}

/** Reconstruye sugerencias del detector desde `MANIFEST.suggestions` (scaffolds ya persistidos). */
export function suggestionsFromManifest(
  manifest: AgentGovernanceSuggestionsManifest | undefined,
): AgentGovernanceSuggestions | null {
  if (!manifest?.entries?.length) return null;

  const suggestedRules: AgentGovernanceSuggestions["suggestedRules"] = [];
  const suggestedSkills: AgentGovernanceSuggestions["suggestedSkills"] = [];

  for (const entry of manifest.entries) {
    if (entry.kind === "rule") {
      suggestedRules.push({
        id: entry.id,
        path: entry.path,
        purpose: entry.purpose ?? "",
        strength: entry.strength ?? "weak",
      });
      continue;
    }
    const folder =
      entry.path.match(/docs\/agent-governance\/skills\/([^/]+)\//)?.[1] ??
      entry.path.match(/\.cursor\/skills\/([^/]+)\//)?.[1] ??
      entry.id;
    suggestedSkills.push({
      id: entry.id,
      path: entry.path,
      folder,
      purpose: entry.purpose ?? "",
      strength: entry.strength ?? "weak",
    });
  }

  return {
    archetypes: manifest.archetypes ?? [],
    rationale: manifest.rationale ?? [],
    suggestedRules,
    suggestedSkills,
  };
}

/**
 * Completa `scaffold.files` con artefactos sugeridos y rutas obligatorias omitidas.
 * Útil al exportar scaffolds generados antes de materializar sugerencias débiles.
 */
export function reconcileAgentGovernanceScaffold(
  scaffold: AgentGovernanceScaffold,
  complexity: ComplexityLevel,
  options?: {
    suggestions?: AgentGovernanceSuggestions | null;
    mddMarkdown?: string;
    target?: GovernanceTarget;
  },
): AgentGovernanceScaffold {
  const suggestions =
    options?.suggestions ??
    suggestionsFromManifest(scaffold.manifest.suggestions) ??
    null;
  const mddMarkdown = options?.mddMarkdown ?? "";
  const target = options?.target ?? "cursor";

  const fileMap: Record<string, string> = {};
  for (const file of scaffold.files) {
    fileMap[normalizePath(file.path)] = file.content;
  }

  const merged = mergeSuggestedArtifacts(fileMap, complexity, suggestions, mddMarkdown);
  if (merged.length > 0) {
    console.warn(
      `[agent-governance] Reconcile: artefactos añadidos desde catálogo: ${merged.join(", ")}`,
    );
  }

  applyRequiredFileFallbacks(fileMap, complexity, suggestions);
  appendSuggestionsToComoUsar(fileMap, suggestions);

  const files = recordToFileEntries(fileMap);
  const paths = files.map((f) => f.path);

  const reconciled: AgentGovernanceScaffold = {
    manifest: {
      ...scaffold.manifest,
      templateVersion: scaffold.manifest.templateVersion || AGENT_GOVERNANCE_TEMPLATE_VERSION,
      files: paths,
      suggestions: scaffold.manifest.suggestions ?? toManifestSuggestions(suggestions),
      installMap: buildGovernanceInstallMap(paths),
    },
    files,
  };

  // Aplicar adaptador multi-target
  return remapGovernanceScaffold(reconciled, target);
}

/**
 * Parsea la respuesta LLM y normaliza el scaffold agent-governance/.
 * Aplica plantillas de respaldo para rutas obligatorias omitidas por el LLM.
 */
export interface ParseAgentGovernanceOptions {
  suggestions?: AgentGovernanceSuggestions | null;
  mddMarkdown?: string;
  target?: string;
}

export function parseAgentGovernanceResponse(
  raw: string,
  complexity: ComplexityLevel,
  options?: ParseAgentGovernanceOptions,
): AgentGovernanceScaffold {
  const trimmed = stripJsonFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    parsed = {};
  }

  const suggestions = options?.suggestions ?? null;
  const mddMarkdown = options?.mddMarkdown ?? "";
  const target = (options?.target as GovernanceTarget) ?? "cursor";

  const fileMap = capRulesAndSkills(parseLlmFilesPayload(parsed));
  const merged = mergeSuggestedArtifacts(fileMap, complexity, suggestions, mddMarkdown);
  if (merged.length > 0) {
    console.warn(
      `[agent-governance] Artefactos sugeridos añadidos desde catálogo (LLM omitió): ${merged.join(", ")}`,
    );
  }

  const missing = applyRequiredFileFallbacks(fileMap, complexity, suggestions);
  if (missing.length > 0) {
    console.warn(
      `[agent-governance] Rutas obligatorias omitidas por LLM (${complexity}); fallback aplicado: ${missing.join(", ")}`,
    );
  }

  appendSuggestionsToComoUsar(fileMap, suggestions);

  const files = recordToFileEntries(fileMap);

  return reconcileAgentGovernanceScaffold(
    {
      manifest: {
        templateVersion: AGENT_GOVERNANCE_TEMPLATE_VERSION,
        files: files.map((f) => f.path),
        generatedAt: new Date().toISOString(),
        suggestions: toManifestSuggestions(suggestions),
      },
      files,
    },
    complexity,
    { suggestions, mddMarkdown, target },
  );
}

/** Serializa el scaffold para persistencia en `Project.agentGovernanceContent`. */
export function serializeAgentGovernanceScaffold(scaffold: AgentGovernanceScaffold): string {
  return JSON.stringify(scaffold, null, 2);
}
