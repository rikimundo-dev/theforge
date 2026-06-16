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
  extractProjectGovernanceFacts,
  type AgentGovernanceSuggestions,
  type ProjectGovernanceFacts,
  type SuggestAgentGovernanceInput,
} from "./suggest-agent-governance-artifacts.js";

/** Rutas que siempre se regeneran desde plantillas canónicas (inmunes al LLM). */
const LLM_PROOF_CANONICAL_PATHS = [
  `${GOVERNANCE_DOCS_PREFIX}INSTALACION.md`,
  "scripts/install-agent-governance.sh",
] as const;

const DUPLICATE_PROMPT_PATHS = [
  `${GOVERNANCE_DOCS_PREFIX}PROMPT-INICIAL.md`,
  "docs/agent-governance/PROMPT-INICIAL.md",
] as const;

const DOC_CONSUMPTION_GUIDE_PATH = `${GOVERNANCE_DOCS_PREFIX}references/THEFORGE-DOC-CONSUMPTION-GUIDE.md`;

/** Rutas obligatorias en todos los niveles de complejidad. */
export const AGENT_GOVERNANCE_REQUIRED_ALL = [
  "AGENTS.md",
  "CLAUDE.md",
  "PROMPT-INICIAL.md",
  `${GOVERNANCE_DOCS_PREFIX}agent-onboarding.md`,
  `${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`,
  `${GOVERNANCE_DOCS_PREFIX}INSTALACION.md`,
  "docs/sdd/PROGRESO.md",
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
    "| `docs/agent-governance/agents/*` | `.cursor/agents/*` |\n" +
    "| `docs/agent-governance/commands/*` | `.cursor/commands/*` |\n" +
    "| `docs/agent-governance/mcp.json.example` | `.cursor/mcp.json` |\n"
  );
}

function defaultDocConsumptionGuide(): string {
  return (
    "# Guía de consumo de documentos TheForge\n\n" +
    "Resumen para agentes que implementan desde entregables SDD incluidos en este ZIP.\n\n" +
    "## Orden de lectura\n\n" +
    "1. **`docs/sdd/mdd.md`** — Constitución (stack, entidades, reglas, auth).\n" +
    "2. **`docs/sdd/blueprint.md`** — Estructura del repo, convenciones, §8 UI si aplica.\n" +
    "3. **`docs/sdd/spec.md`** — Requisitos y criterios de aceptación.\n" +
    "4. **`docs/sdd/tasks.md`** — Checklist de implementación (contrastar siempre con MDD).\n" +
    "5. Entregables opcionales si existen: `api-contracts.md`, `logic-flows.md`, `architecture.md`, `infra.md`.\n\n" +
    "## Prioridad ante conflictos\n\n" +
    "**El MDD manda.** Si un entregable contradice otro, sigue MDD §2–§6 y documenta la resolución en `docs/sdd/PROGRESO.md`.\n\n" +
    "## Gates antes de cerrar tareas\n\n" +
    "- Lint, typecheck y tests del paquete tocado.\n" +
    "- Contratos API alineados a `docs/sdd/api-contracts.md` cuando exista.\n" +
    "- Actualizar `docs/sdd/PROGRESO.md` al completar ítems de Tasks.\n"
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
    "4. Consulta la guía de consumo de documentos: `" + DOC_CONSUMPTION_GUIDE_PATH + "`.\n" +
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
    "Crea las carpetas si no existen: `.cursor/rules/`, `.cursor/skills/`, `.cursor/references/`, `.cursor/agents/`, `.cursor/commands/`.\n\n" +
    "## Opción C — One-liner\n\n" +
    "```bash\n" +
    "mkdir -p .cursor/{rules,skills,references,agents,commands} && \\\n" +
    "cp docs/agent-governance/rules/*.mdc .cursor/rules/ 2>/dev/null; \\\n" +
    "cp -R docs/agent-governance/skills/* .cursor/skills/ 2>/dev/null; \\\n" +
    "cp docs/agent-governance/references/* .cursor/references/ 2>/dev/null; \\\n" +
    "cp -R docs/agent-governance/agents/* .cursor/agents/ 2>/dev/null; \\\n" +
    "cp -R docs/agent-governance/commands/* .cursor/commands/ 2>/dev/null; \\\n" +
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
    'mkdir -p "$ROOT/.cursor/rules" "$ROOT/.cursor/skills" "$ROOT/.cursor/references" "$ROOT/.cursor/agents" "$ROOT/.cursor/commands"\n' +
    'if [[ -d "$SRC/rules" ]]; then cp -f "$SRC/rules/"*.mdc "$ROOT/.cursor/rules/" 2>/dev/null || true; fi\n' +
    'if [[ -d "$SRC/skills" ]]; then cp -R "$SRC/skills/"* "$ROOT/.cursor/skills/" 2>/dev/null || true; fi\n' +
    'if [[ -d "$SRC/references" ]]; then cp -f "$SRC/references/"* "$ROOT/.cursor/references/" 2>/dev/null || true; fi\n' +
    'if [[ -d "$SRC/agents" ]]; then cp -R "$SRC/agents/"* "$ROOT/.cursor/agents/" 2>/dev/null || true; fi\n' +
    'if [[ -d "$SRC/commands" ]]; then cp -R "$SRC/commands/"* "$ROOT/.cursor/commands/" 2>/dev/null || true; fi\n' +
    'if [[ -f "$SRC/mcp.json.example" ]]; then cp -f "$SRC/mcp.json.example" "$ROOT/.cursor/mcp.json"; fi\n' +
    'echo "Gobernanza instalada en .cursor/ (rules, skills, references, agents, commands, mcp.json)."\n'
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
    "Consulta **`references/THEFORGE-DOC-CONSUMPTION-GUIDE.md`** " +
    "(incluida en este paquete bajo `docs/agent-governance/references/`).\n" +
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
    "- **Cargar:** MDD, Blueprint, `" + DOC_CONSUMPTION_GUIDE_PATH + "`\n\n",
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

function formatStackSection(facts: ProjectGovernanceFacts): string {
  const lines: string[] = [];
  if (facts.backendStack) lines.push(`- **Backend:** ${facts.backendStack}`);
  if (facts.frontendStack) lines.push(`- **Frontend:** ${facts.frontendStack}`);
  if (facts.mobileStack) lines.push(`- **Mobile:** ${facts.mobileStack}`);
  if (facts.infraStack) lines.push(`- **Infra / deploy:** ${facts.infraStack}`);
  return lines.length > 0 ? lines.join("\n") : "- Deriva el stack del MDD §2 y del Blueprint.";
}

function buildSddConflictSection(facts: ProjectGovernanceFacts): string {
  if (facts.sddConflicts.length === 0) return "";
  const lines = [
    "## Resolución de conflictos SDD\n\n",
    "El detector encontró posibles contradicciones entre entregables. **Prioriza el MDD** y documenta la decisión en `docs/sdd/PROGRESO.md`.\n\n",
  ];
  for (const c of facts.sddConflicts) lines.push(`- ${c}\n`);
  lines.push("\n");
  return lines.join("");
}

function stripSddConflictSections(content: string): string {
  return content
    .replace(/## Resolución de conflictos SDD[\s\S]*?(?=\n## [^#]|\n#\s|$)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentHasSddConflicts(content: string, facts: ProjectGovernanceFacts): boolean {
  if (!/Resolución de conflictos SDD/i.test(content)) return false;
  if (facts.sddConflicts.length === 0) return true;
  return facts.sddConflicts.every((c) => {
    const key = c.split(":")[0]?.trim();
    return key ? content.includes(key) : content.includes(c.slice(0, 40));
  });
}

function ruleHasCatalogStackEnrichment(content: string): boolean {
  return (
    /\*\*Módulos Blueprint:\*\*/i.test(content) &&
    (/\*\*Globs backend:\*\*/i.test(content) || /\*\*Globs frontend:\*\*/i.test(content))
  );
}

function buildProjectFactsBlock(
  facts: ProjectGovernanceFacts,
  options?: { includeSddConflicts?: boolean; compact?: boolean },
): string {
  const parts: string[] = [`## Hechos del proyecto (${facts.projectTitle})\n`];
  const stack = formatStackSection(facts);
  if (stack) parts.push(stack, "");
  if (!options?.compact) {
    if (facts.blueprintModules.length > 0) {
      parts.push("**Módulos Blueprint:**", ...facts.blueprintModules.map((m) => `- \`${m}\``), "");
    }
    if (facts.backendGlobs.length > 0) {
      parts.push("**Globs backend:**", ...facts.backendGlobs.map((g) => `- \`${g}\``), "");
    }
    if (facts.hasUiSurface && facts.frontendGlobs.length > 0) {
      parts.push("**Globs frontend:**", ...facts.frontendGlobs.map((g) => `- \`${g}\``), "");
    }
    if (facts.npmScripts.length > 0) {
      parts.push("**Scripts npm/pnpm:**", ...facts.npmScripts.map((s) => `- \`${s}\``), "");
    }
  }
  if (facts.architectureLayers.length > 0) {
    parts.push("**Capas:**", ...facts.architectureLayers.map((l) => `- ${l}`), "");
  }
  if (facts.taskCheckboxes.length > 0) {
    parts.push("**Tasks (extracto):**", ...facts.taskCheckboxes.slice(0, 5), "");
  } else if (facts.taskHeadings.length > 0) {
    parts.push("**Tasks (extracto):**", ...facts.taskHeadings.slice(0, 6).map((t) => `- ${t}`), "");
  }
  parts.push(
    "**Docs SDD:**",
    ...facts.docPaths.filter((p) => p.startsWith("docs/sdd/")).map((p) => `- \`${p}\``),
    "",
  );
  if (facts.sddConflicts.length > 0 && options?.includeSddConflicts !== false) {
    parts.push(buildSddConflictSection(facts).trim(), "");
  }
  return parts.join("\n");
}

function buildPromptInicialMd(facts: ProjectGovernanceFacts, complexity: ComplexityLevel): string {
  const docList = facts.docPaths.map((p) => `- \`${p}\``).join("\n");
  const tasksPreview =
    facts.taskCheckboxes.length > 0
      ? facts.taskCheckboxes.slice(0, 5).join("\n")
      : facts.taskHeadings.length > 0
        ? facts.taskHeadings.slice(0, 5).map((h) => `- [ ] ${h}`).join("\n")
        : "- Consulta `docs/sdd/tasks.md` para el checklist completo.";
  const archPreview =
    facts.architectureLayers.length > 0
      ? facts.architectureLayers.map((l) => `- ${l}`).join("\n")
      : "- Consulta `docs/sdd/architecture.md` si existe.";
  const modulesPreview =
    facts.blueprintModules.length > 0
      ? facts.blueprintModules.map((m) => `- \`${m}\``).join("\n")
      : "- Consulta `docs/sdd/blueprint.md` para módulos y rutas.";

  return (
    "# Prompt inicial — implementación\n\n" +
    "Bootstrap **específico de este proyecto** (generado por TheForge). " +
    "No uses plantillas genéricas de otros repos.\n\n" +
    "## Documentos del proyecto\n\n" +
    docList +
    "\n\n## Stack detectado\n\n" +
    formatStackSection(facts) +
    "\n\n## Módulos / rutas (Blueprint)\n\n" +
    modulesPreview +
    "\n\n## Capas de arquitectura\n\n" +
    archPreview +
    "\n\n## Primeras tareas (desde Tasks)\n\n" +
    tasksPreview +
    "\n\n" +
    buildSddConflictSection(facts) +
    "## Instrucciones para el agente\n\n" +
    "1. Instala gobernanza: `docs/agent-governance/INSTALACION.md` (o `./scripts/install-agent-governance.sh`).\n" +
    "2. Lee `AGENTS.md`, `docs/agent-governance/COMO-USAR-GOBERNANZA-IA.md` y el MDD en `docs/sdd/mdd.md`.\n" +
    "3. Implementa siguiendo **Tasks** (`docs/sdd/tasks.md`) y **Blueprint**; actualiza `docs/sdd/PROGRESO.md` al cerrar ítems.\n" +
    (complexity !== "LOW"
      ? "4. Respeta subflujos en `docs/agent-governance/references/workflows.md`.\n"
      : "4. Ejecuta lint/typecheck/tests del paquete tocado antes de cerrar.\n")
  );
}

function buildProgresoMd(facts: ProjectGovernanceFacts, tasksMarkdown?: string | null): string {
  const lines = [
    "# Progreso de implementación\n\n",
    "Checklist derivado de **Tasks** del proyecto. Marca `[x]` al completar cada ítem.\n\n",
    "## Referencias\n\n",
    "- Tasks completo: `docs/sdd/tasks.md`\n",
    "- Blueprint: `docs/sdd/blueprint.md`\n",
    "- MDD: `docs/sdd/mdd.md`\n\n",
  ];

  const tasks = (tasksMarkdown ?? "").trim();
  if (tasks.length > 0) {
    lines.push("## Checklist (desde Tasks)\n\n", tasks, "\n");
  } else if (facts.taskHeadings.length > 0) {
    lines.push("## Checklist\n\n");
    for (const h of facts.taskHeadings) lines.push(`- [ ] ${h}\n`);
    lines.push("\n");
  } else {
    lines.push(
      "## Checklist\n\n",
      "- [ ] Revisar MDD y Blueprint\n",
      "- [ ] Configurar entorno local según §2 del MDD\n",
      "- [ ] Implementar primera tarea de `docs/sdd/tasks.md`\n\n",
    );
  }

  lines.push("## Notas\n\n", "_Actualiza este archivo al cerrar tareas o hitos._\n");
  return lines.join("");
}

function buildCursorAgentMd(role: string, description: string, loadPaths: string[]): string {
  return (
    `# Subagente: ${role}\n\n` +
    `${description}\n\n` +
    "## Cuándo delegar\n\n" +
    `- Tareas acotadas de ${role.toLowerCase()} sin tocar otras capas.\n\n` +
    "## Cargar antes de actuar\n\n" +
    loadPaths.map((p) => `- \`${p}\``).join("\n") +
    "\n\n## Gates\n\n" +
    "- Lint, typecheck y tests del paquete tocado.\n" +
    "- Respeta contratos y auth del MDD.\n"
  );
}

function buildDynamicCursorAgents(facts: ProjectGovernanceFacts): Record<string, string> {
  const out: Record<string, string> = {};
  if (facts.mobileStack) {
    out[`${GOVERNANCE_DOCS_PREFIX}agents/mobile-implementer.md`] = buildCursorAgentMd(
      "Mobile",
      `Implementación ${facts.mobileStack} según MDD §2 y Blueprint.`,
      ["AGENTS.md", "docs/sdd/mdd.md", "docs/sdd/blueprint.md", "docs/sdd/tasks.md"],
    );
  }
  if (facts.backendStack) {
    out[`${GOVERNANCE_DOCS_PREFIX}agents/backend-implementer.md`] = buildCursorAgentMd(
      "Backend",
      `API y lógica ${facts.backendStack} según MDD §4 y Architecture.`,
      ["AGENTS.md", "docs/sdd/mdd.md", "docs/sdd/architecture.md", "docs/sdd/api-contracts.md"],
    );
  }
  if (facts.hasUiSurface && (facts.frontendStack || facts.mobileStack)) {
    const stack = facts.frontendStack ?? facts.mobileStack ?? "UI";
    out[`${GOVERNANCE_DOCS_PREFIX}agents/frontend-implementer.md`] = buildCursorAgentMd(
      "Frontend",
      `UI ${stack} alineada a UX/UI guide y design system del MDD.`,
      ["AGENTS.md", "docs/sdd/mdd.md", "docs/sdd/ux-ui-guide.md", "docs/sdd/blueprint.md"],
    );
  }
  return out;
}

function buildDynamicCursorCommands(facts: ProjectGovernanceFacts): Record<string, string> {
  const out: Record<string, string> = {};
  out[`${GOVERNANCE_DOCS_PREFIX}commands/implementar-tarea.md`] =
    "# Implementar tarea\n\n" +
    "1. Lee `PROMPT-INICIAL.md` y la tarea pendiente en `docs/sdd/tasks.md`.\n" +
    "2. Actualiza `docs/sdd/PROGRESO.md` al terminar.\n" +
    "3. Ejecuta gates del paquete (lint, typecheck, tests).\n";

  if (facts.backendStack) {
    out[`${GOVERNANCE_DOCS_PREFIX}commands/revisar-api.md`] =
      "# Revisar contratos API\n\n" +
      "Valida cambios contra `docs/sdd/api-contracts.md` y MDD §4.\n";
  }
  return out;
}

const THIN_CONTENT_MIN_CHARS = 140;

/** Opciones para reconciliar/parsear sin reutilizar bloques genéricos obsoletos. */
export interface AgentGovernanceOverlayOptions {
  forceFreshOverlay?: boolean;
}

function isThinGovernanceContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < THIN_CONTENT_MIN_CHARS) return true;
  if (/parametrizar desde MDD/i.test(trimmed) && trimmed.length < 420) return true;
  if (/^#\s+\w+\s*\n\nDeriva comandos exactos/i.test(trimmed)) return true;
  return false;
}

function isStaleProjectFactsSection(content: string, facts: ProjectGovernanceFacts): boolean {
  const match = content.match(/## Hechos del proyecto \(([^)]+)\)/i);
  if (!match) return false;
  const embeddedTitle = match[1].trim();
  if (/^theforge$/i.test(embeddedTitle) || /^proyecto theforge$/i.test(embeddedTitle)) {
    return true;
  }
  if (facts.projectTitle && embeddedTitle !== facts.projectTitle) return true;
  if (/parametrizar desde MDD/i.test(content)) return true;
  if (facts.backendGlobs.length > 0 && /\*\*Globs backend:\*\*/i.test(content)) {
    const hasCurrentGlob = facts.backendGlobs.some((g) => content.includes(g));
    if (!hasCurrentGlob) return true;
  }
  if (facts.blueprintModules.length > 0 && /\*\*Módulos Blueprint:\*\*/i.test(content)) {
    const hasModule = facts.blueprintModules.some((m) => content.includes(m));
    if (!hasModule) return true;
  }
  return false;
}

function stripProjectFactsSection(content: string): string {
  const lines = content.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^## Hechos del proyecto \(/i.test(lines[i] ?? "")) {
      start = i;
      break;
    }
  }
  if (start < 0) return content;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## [^#]/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  const before = lines.slice(0, start).join("\n").trimEnd();
  const after = lines.slice(end).join("\n").trimStart();
  if (before && after) return `${before}\n\n${after}`;
  return before || after || "";
}

function shouldReplaceGovernanceArtifact(
  existing: string | undefined,
  facts: ProjectGovernanceFacts,
  forceFreshOverlay: boolean,
): boolean {
  if (!existing?.trim()) return true;
  if (forceFreshOverlay) return true;
  if (isThinGovernanceContent(existing)) return true;
  if (/Hechos del proyecto \(TheForge\)/i.test(existing)) return true;
  if (isStaleProjectFactsSection(existing, facts)) return true;
  return false;
}

function overlayProjectFacts(
  content: string,
  facts: ProjectGovernanceFacts,
  overlayOptions?: AgentGovernanceOverlayOptions,
  artifactPath?: string,
): string {
  const forceFreshOverlay = overlayOptions?.forceFreshOverlay === true;
  const compact =
    ruleHasCatalogStackEnrichment(content) &&
    (artifactPath?.includes("/rules/stack-backend") ||
      artifactPath?.includes("/rules/stack-frontend"));
  const includeSddConflicts = !contentHasSddConflicts(content, facts);
  const block = buildProjectFactsBlock(facts, { compact, includeSddConflicts });
  let base = stripSddConflictSections(content);
  if (/## Hechos del proyecto \(/i.test(base)) {
    if (forceFreshOverlay || isStaleProjectFactsSection(base, facts)) {
      console.warn(
        `[agent-gov] overlayProjectFacts replacing stale TheForge block projectTitle=${facts.projectTitle} forceFreshOverlay=${forceFreshOverlay}`,
      );
      base = stripProjectFactsSection(base);
      return base.trim() ? `${base.trimEnd()}\n\n${block}` : block;
    }
    return base;
  }
  return `${base.trimEnd()}\n\n${block}`;
}

function appendSddConflictToAgents(content: string, facts: ProjectGovernanceFacts): string {
  const section = buildSddConflictSection(facts);
  if (!section.trim()) return stripSddConflictSections(content);
  if (contentHasSddConflicts(content, facts)) return stripSddConflictSections(content);
  const base = stripSddConflictSections(content);
  return `${base.trimEnd()}\n\n${section.trim()}\n`;
}

function dropDuplicateGovernancePromptPaths(fileMap: Record<string, string>): void {
  for (const path of DUPLICATE_PROMPT_PATHS) {
    delete fileMap[path];
  }
}

/** Entregables SDD opcionales para incluir en export ZIP bajo docs/sdd/. */
export interface ProjectDeliverableExportInput {
  mddMarkdown?: string | null;
  blueprintMarkdown?: string | null;
  specMarkdown?: string | null;
  architectureMarkdown?: string | null;
  tasksMarkdown?: string | null;
  useCasesMarkdown?: string | null;
  userStoriesMarkdown?: string | null;
  apiContractsMarkdown?: string | null;
  logicFlowsMarkdown?: string | null;
  uxUiGuideMarkdown?: string | null;
  infraMarkdown?: string | null;
}

const SDD_EXPORT_ENTRIES: Array<{
  key: keyof ProjectDeliverableExportInput;
  path: string;
}> = [
  { key: "mddMarkdown", path: "docs/sdd/mdd.md" },
  { key: "blueprintMarkdown", path: "docs/sdd/blueprint.md" },
  { key: "specMarkdown", path: "docs/sdd/spec.md" },
  { key: "architectureMarkdown", path: "docs/sdd/architecture.md" },
  { key: "tasksMarkdown", path: "docs/sdd/tasks.md" },
  { key: "useCasesMarkdown", path: "docs/sdd/use-cases.md" },
  { key: "userStoriesMarkdown", path: "docs/sdd/user-stories.md" },
  { key: "apiContractsMarkdown", path: "docs/sdd/api-contracts.md" },
  { key: "logicFlowsMarkdown", path: "docs/sdd/logic-flows.md" },
  { key: "uxUiGuideMarkdown", path: "docs/sdd/ux-ui-guide.md" },
  { key: "infraMarkdown", path: "docs/sdd/infra.md" },
];

/** Añade entregables del proyecto al scaffold de export (docs/sdd/*). */
export function appendProjectDeliverablesToScaffold(
  scaffold: AgentGovernanceScaffold,
  deliverables: ProjectDeliverableExportInput,
): AgentGovernanceScaffold {
  const fileMap: Record<string, string> = {};
  for (const file of scaffold.files) {
    fileMap[normalizePath(file.path)] = file.content;
  }

  const written: string[] = [];
  const skipped: string[] = [];
  for (const { key, path } of SDD_EXPORT_ENTRIES) {
    const content = deliverables[key]?.trim();
    if (!content) {
      skipped.push(path);
      continue;
    }
    const hadExisting = Boolean(fileMap[path]?.trim());
    fileMap[path] = content;
    written.push(hadExisting ? `${path} (overwrite)` : path);
  }
  console.warn(
    `[agent-gov] appendProjectDeliverablesToScaffold written=${written.join(", ") || "none"} skipped=${skipped.join(", ") || "none"}`,
  );

  const files = recordToFileEntries(fileMap);
  const paths = files.map((f) => f.path);
  return {
    manifest: {
      ...scaffold.manifest,
      files: paths,
      installMap: buildGovernanceInstallMap(paths),
    },
    files,
  };
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
  governanceInput?: SuggestAgentGovernanceInput,
) => string;

const FALLBACK_BY_PATH: Record<string, FallbackFactory> = {
  "AGENTS.md": (_c, _s, input) => {
    const base = defaultAgentsMd();
    if (!input) return base;
    const facts = extractProjectGovernanceFacts(input);
    return overlayProjectFacts(base, facts);
  },
  "CLAUDE.md": () => defaultClaudeShim(),
  "PROMPT-INICIAL.md": (c, _s, input) =>
    buildPromptInicialMd(
      input
        ? extractProjectGovernanceFacts(input)
        : {
            projectTitle: "Proyecto TheForge",
            docPaths: ["docs/sdd/mdd.md"],
            taskHeadings: [],
            taskCheckboxes: [],
            architectureLayers: [],
            blueprintModules: [],
            backendGlobs: [],
            frontendGlobs: [],
            npmScripts: [],
            sddConflicts: [],
            hasUiSurface: false,
          },
      c,
    ),
  "docs/sdd/PROGRESO.md": (_c, _s, input) =>
    buildProgresoMd(
      input
        ? extractProjectGovernanceFacts(input)
        : {
            projectTitle: "Proyecto TheForge",
            docPaths: [],
            taskHeadings: [],
            taskCheckboxes: [],
            architectureLayers: [],
            blueprintModules: [],
            backendGlobs: [],
            frontendGlobs: [],
            npmScripts: [],
            sddConflicts: [],
            hasUiSurface: false,
          },
      input?.tasksMarkdown,
    ),
  [`${GOVERNANCE_DOCS_PREFIX}agent-onboarding.md`]: (_c, _s, input) => {
    const base = defaultAgentOnboarding();
    if (!input) return base;
    return overlayProjectFacts(base, extractProjectGovernanceFacts(input));
  },
  [`${GOVERNANCE_DOCS_PREFIX}COMO-USAR-GOBERNANZA-IA.md`]: (_c, s) => defaultComoUsarGovernanza(s),
  [`${GOVERNANCE_DOCS_PREFIX}INSTALACION.md`]: () => defaultInstalacion(),
  [`${GOVERNANCE_DOCS_PREFIX}references/workflows.md`]: (c) => defaultWorkflows(c),
  [`${GOVERNANCE_DOCS_PREFIX}references/CURSOR_SKILLS_Y_RULES.md`]: () => defaultCursorSkillsYRules(),
  [`${GOVERNANCE_DOCS_PREFIX}references/PROMPT_HANDOFF_AGENTE.md`]: () => defaultPromptHandoff(),
  [DOC_CONSUMPTION_GUIDE_PATH]: () => defaultDocConsumptionGuide(),
  [`${GOVERNANCE_DOCS_PREFIX}mcp.json.example`]: () => defaultMcpJson(),
  "scripts/install-agent-governance.sh": () => defaultInstallScript(),
};

function applyCanonicalGovernanceDefaults(
  fileMap: Record<string, string>,
  complexity: ComplexityLevel,
  suggestions?: AgentGovernanceSuggestions | null,
  governanceInput?: SuggestAgentGovernanceInput,
): void {
  for (const path of LLM_PROOF_CANONICAL_PATHS) {
    const factory = FALLBACK_BY_PATH[path];
    if (factory) fileMap[path] = factory(complexity, suggestions, governanceInput);
  }
  dropDuplicateGovernancePromptPaths(fileMap);
}

function ensureDocConsumptionGuide(fileMap: Record<string, string>): void {
  if (!fileMap[DOC_CONSUMPTION_GUIDE_PATH]?.trim()) {
    fileMap[DOC_CONSUMPTION_GUIDE_PATH] = defaultDocConsumptionGuide();
  }
}

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
  governanceInput?: SuggestAgentGovernanceInput,
): string[] {
  const missing: string[] = [];
  for (const required of getRequiredAgentGovernancePaths(complexity)) {
    if (!fileMap[required]?.trim()) {
      missing.push(required);
      const factory = FALLBACK_BY_PATH[required];
      if (factory) fileMap[required] = factory(complexity, suggestions, governanceInput);
    }
  }
  ensureAgentsInstallSection(fileMap);
  ensureDocConsumptionGuide(fileMap);
  return missing;
}

function injectDynamicCursorArtifacts(
  fileMap: Record<string, string>,
  facts: ProjectGovernanceFacts,
  complexity: ComplexityLevel,
): void {
  if (complexity === "LOW") return;
  for (const [path, content] of Object.entries(buildDynamicCursorAgents(facts))) {
    if (!fileMap[path]?.trim()) fileMap[path] = content;
  }
  for (const [path, content] of Object.entries(buildDynamicCursorCommands(facts))) {
    if (!fileMap[path]?.trim()) fileMap[path] = content;
  }
}

function enrichGovernanceArtifacts(
  fileMap: Record<string, string>,
  complexity: ComplexityLevel,
  governanceInput: SuggestAgentGovernanceInput,
  overlayOptions?: AgentGovernanceOverlayOptions,
): void {
  const facts = extractProjectGovernanceFacts(governanceInput);
  const overlayOpts = overlayOptions;
  console.warn(
    `[agent-gov] enrichGovernanceArtifacts projectTitle=${facts.projectTitle} forceFreshOverlay=${overlayOptions?.forceFreshOverlay === true} fileCount=${Object.keys(fileMap).length}`,
  );
  const agentsPath = "AGENTS.md";
  if (fileMap[agentsPath]?.trim()) {
    fileMap[agentsPath] = appendSddConflictToAgents(
      overlayProjectFacts(fileMap[agentsPath], facts, overlayOpts),
      facts,
    );
  }
  for (const [path, content] of Object.entries(fileMap)) {
    const isRuleOrSkill =
      path.startsWith(`${GOVERNANCE_DOCS_PREFIX}rules/`) ||
      path.includes(`${GOVERNANCE_DOCS_PREFIX}skills/`);
    const forceFresh = overlayOptions?.forceFreshOverlay === true;
    if (
      isRuleOrSkill &&
      content.trim() &&
      /## Hechos del proyecto \(/i.test(content) &&
      !isStaleProjectFactsSection(content, facts) &&
      !forceFresh
    ) {
      continue;
    }
    if (
      isRuleOrSkill &&
      content.trim() &&
      shouldReplaceGovernanceArtifact(content, facts, forceFresh)
    ) {
      fileMap[path] = overlayProjectFacts(content, facts, overlayOpts, path);
    }
  }
  const promptPath = "PROMPT-INICIAL.md";
  if (
    shouldReplaceGovernanceArtifact(fileMap[promptPath], facts, overlayOptions?.forceFreshOverlay === true)
  ) {
    fileMap[promptPath] = buildPromptInicialMd(facts, complexity);
  }
  const progresoPath = "docs/sdd/PROGRESO.md";
  if (
    shouldReplaceGovernanceArtifact(fileMap[progresoPath], facts, overlayOptions?.forceFreshOverlay === true)
  ) {
    fileMap[progresoPath] = buildProgresoMd(facts, governanceInput.tasksMarkdown);
  }
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
  governanceInput: SuggestAgentGovernanceInput,
  overlayOptions?: AgentGovernanceOverlayOptions,
): string[] {
  if (!suggestions) return [];

  const added: string[] = [];
  const ctx = buildArtifactTemplateContext(suggestions, complexity, governanceInput);
  const facts = ctx.projectFacts ?? extractProjectGovernanceFacts(governanceInput);
  const forceFreshOverlay = overlayOptions?.forceFreshOverlay === true;
  const overlayOpts = overlayOptions;

  for (const spec of suggestions.suggestedRules) {
    const path = normalizePath(spec.path);
    const rule = getRuleById(spec.id);
    if (!rule) continue;
    const catalogContent = overlayProjectFacts(
      renderRuleFromCatalog(rule, ctx),
      facts,
      overlayOpts,
      path,
    );
    const existing = fileMap[path]?.trim();
    if (existing && !shouldReplaceGovernanceArtifact(existing, facts, forceFreshOverlay)) continue;
    fileMap[path] = catalogContent;
    added.push(path);
  }

  for (const spec of suggestions.suggestedSkills) {
    const path = normalizePath(spec.path);
    const skill = getSkillById(spec.id);
    if (!skill) continue;
    const catalogContent = overlayProjectFacts(
      renderSkillFromCatalog(skill, ctx, spec.folder),
      facts,
      overlayOpts,
      path,
    );
    const existing = fileMap[path]?.trim();
    if (existing && !shouldReplaceGovernanceArtifact(existing, facts, forceFreshOverlay)) continue;
    fileMap[path] = catalogContent;
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
    governanceInput?: SuggestAgentGovernanceInput;
    /** @deprecated use governanceInput */
    mddMarkdown?: string;
    target?: GovernanceTarget;
    forceFreshOverlay?: boolean;
  },
): AgentGovernanceScaffold {
  const suggestions =
    options?.suggestions ??
    suggestionsFromManifest(scaffold.manifest.suggestions) ??
    null;
  const governanceInput: SuggestAgentGovernanceInput =
    options?.governanceInput ??
    ({
      mddMarkdown: options?.mddMarkdown ?? "",
      complexity,
    } satisfies SuggestAgentGovernanceInput);
  const target = options?.target ?? "cursor";
  const overlayOptions: AgentGovernanceOverlayOptions = {
    forceFreshOverlay: options?.forceFreshOverlay === true,
  };
  const filesBefore = scaffold.files.length;

  const fileMap: Record<string, string> = {};
  for (const file of scaffold.files) {
    fileMap[normalizePath(file.path)] = file.content;
  }

  const facts = extractProjectGovernanceFacts(governanceInput);
  const merged = mergeSuggestedArtifacts(
    fileMap,
    complexity,
    suggestions,
    governanceInput,
    overlayOptions,
  );
  if (merged.length > 0) {
    console.warn(
      `[agent-gov] reconcileAgentGovernanceScaffold addedPaths=${merged.join(", ")} forceFreshOverlay=${overlayOptions.forceFreshOverlay}`,
    );
  } else {
    console.warn(
      `[agent-gov] reconcileAgentGovernanceScaffold no catalog paths added forceFreshOverlay=${overlayOptions.forceFreshOverlay} filesBefore=${filesBefore}`,
    );
  }

  applyRequiredFileFallbacks(fileMap, complexity, suggestions, governanceInput);
  enrichGovernanceArtifacts(fileMap, complexity, governanceInput, overlayOptions);
  injectDynamicCursorArtifacts(fileMap, facts, complexity);
  appendSuggestionsToComoUsar(fileMap, suggestions);
  applyCanonicalGovernanceDefaults(fileMap, complexity, suggestions, governanceInput);

  const files = recordToFileEntries(fileMap);
  const paths = files.map((f) => f.path);
  console.warn(
    `[agent-gov] reconcileAgentGovernanceScaffold filesBefore=${filesBefore} filesAfter=${files.length}`,
  );

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
  governanceInput?: SuggestAgentGovernanceInput;
  /** @deprecated use governanceInput */
  mddMarkdown?: string;
  target?: string;
  forceFreshOverlay?: boolean;
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
  const governanceInput: SuggestAgentGovernanceInput =
    options?.governanceInput ??
    ({
      mddMarkdown: options?.mddMarkdown ?? "",
      complexity,
    } satisfies SuggestAgentGovernanceInput);
  const target = (options?.target as GovernanceTarget) ?? "cursor";
  const overlayOptions: AgentGovernanceOverlayOptions = {
    forceFreshOverlay: options?.forceFreshOverlay === true,
  };

  const fileMap = capRulesAndSkills(parseLlmFilesPayload(parsed));
  const llmFileCount = Object.keys(fileMap).length;
  const facts = extractProjectGovernanceFacts(governanceInput);
  const merged = mergeSuggestedArtifacts(
    fileMap,
    complexity,
    suggestions,
    governanceInput,
    overlayOptions,
  );
  console.warn(
    `[agent-gov] parseAgentGovernanceResponse llmFiles=${llmFileCount} forceFreshOverlay=${overlayOptions.forceFreshOverlay} mergedCatalog=${merged.join(", ") || "none"}`,
  );
  if (merged.length > 0) {
    console.warn(
      `[agent-gov] parseAgentGovernanceResponse catalog paths added: ${merged.join(", ")}`,
    );
  }

  const missing = applyRequiredFileFallbacks(fileMap, complexity, suggestions, governanceInput);
  if (missing.length > 0) {
    console.warn(
      `[agent-gov] parseAgentGovernanceResponse required fallbacks (${complexity}): ${missing.join(", ")}`,
    );
  }

  enrichGovernanceArtifacts(fileMap, complexity, governanceInput, overlayOptions);
  injectDynamicCursorArtifacts(fileMap, facts, complexity);
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
    { suggestions, governanceInput, target, forceFreshOverlay: overlayOptions.forceFreshOverlay },
  );
}

/** Serializa el scaffold para persistencia en `Project.agentGovernanceContent`. */
export function serializeAgentGovernanceScaffold(scaffold: AgentGovernanceScaffold): string {
  return JSON.stringify(scaffold, null, 2);
}
