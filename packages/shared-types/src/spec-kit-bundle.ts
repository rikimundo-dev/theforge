/**
 * Estructura de export compatible con github/spec-kit:
 * `.specify/memory/constitution.md` + `specs/{NNN}-{slug}/`.
 */

import { formatDocumentPathMapTable } from "./document-layout.js";

export interface SpecKitBundleFile {
  path: string;
  content: string;
}

export interface SpecKitBundleInput {
  projectName: string;
  /** Número de feature (default 1 → `001-`). */
  featureOrdinal?: number;
  mddContent: string;
  specContent?: string | null;
  blueprintContent?: string | null;
  tasksContent?: string | null;
  apiContractsContent?: string | null;
  logicFlowsContent?: string | null;
  infraContent?: string | null;
  phase0SummaryContent?: string | null;
  dbgaContent?: string | null;
  uxUiGuideContent?: string | null;
  /** Guía para agentes implementadores (p. ej. THEFORGE-DOC-CONSUMPTION-GUIDE). */
  consumptionGuideContent?: string | null;
  /** Stage delta change spec (stage 2+ brownfield). */
  changeSpecContent?: string | null;
  /** Acceptance criteria lines from spec or change spec. */
  acceptanceCriteriaLines?: string[] | null;
}

/** Resumen para handoff de implementación (equivalente a `/speckit.implement` + consumo The Forge). */
export function buildSddImplementReadme(featureDir: string): string {
  const pathMapTable = formatDocumentPathMapTable(featureDir);
  return `# Implementation from The Forge (spec-kit style)

## Document order (mandatory)

1. Read \`.specify/memory/constitution.md\` (MDD) — single source of truth.
2. Read \`spec.md\` (what/why) and \`plan.md\` (blueprint / technical plan) under \`${featureDir}/\`.
3. Use \`tasks.md\` as the execution checklist; always cross-check MDD §3–§4 and \`contracts/\`.
4. API contracts are binding (methods, paths, DTOs).
5. On conflict between artifacts, **the MDD wins**.

## Path map (spec-kit primary ↔ governance mirror)

${pathMapTable}

**The spec-kit layout is canonical.** Files under \`docs/sdd/\` mirror content for agent rules/skills — not an alternate SSOT.

## Installation order

1. Extract all bundled files at **repo root** (\`.specify/\`, \`${featureDir}/\`, \`AGENTS.md\`, \`docs/agent-governance/\`, \`docs/sdd/\`, \`scripts/\`).
2. Install \`docs/agent-governance/\` → \`.cursor/\` per \`docs/agent-governance/INSTALACION.md\` (or run \`scripts/install-agent-governance.sh\`).
3. Verify \`docs/sdd/*\` mirrors match spec-kit artifacts (optional cross-check).

## Executing tasks (agent workflow)

1. Open \`${featureDir}/tasks.md\` and find the first open item (\`- [ ]\`).
2. Tasks marked \`[P]\` may run **in parallel** within the same user-story **Checkpoint** block.
3. Each task should list target **file paths** (e.g. \`src/...\`); edit only those files unless the task explicitly expands scope.
4. After completing a Checkpoint section, run smoke checks from \`${featureDir}/quickstart.md\` for that user story.
5. Mark completed items as \`- [x]\` in \`tasks.md\` (or track in your agent session) before moving to the next task.
6. If implementation diverges from spec, stop and run **converge** (The Forge) or update the MDD first — do not silently drift.

## Agent governance (if bundled)

If this ZIP includes governance docs at repo root, install rules/skills per \`docs/agent-governance/INSTALACION.md\` before coding.
The \`docs/sdd/\` folder is a **mirror** for rules that reference SDD paths — always prefer spec-kit paths when both exist.

## Git branch naming

Create feature branches as \`{NNN}-{slug}\` where \`NNN\` is the 3-digit stage ordinal from The Forge (e.g. \`002-discount-module\`). One branch per stage change; see \`openspec/BRANCH-POLICY.md\` when bundled.

## Full consumption rules

See \`THEFORGE-DOC-CONSUMPTION-GUIDE.md\` at repo root (next to this file) for complete agent consumption rules.
`;
}

/** @deprecated Use {@link buildSddImplementReadme} with a concrete featureDir. */
export const SDD_IMPLEMENT_README = buildSddImplementReadme("specs/NNN-slug");

export function slugifySpecKitFeature(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "feature";
}

export function specKitFeatureDir(ordinal: number, projectName: string): string {
  const n = String(Math.max(1, ordinal)).padStart(3, "0");
  return `specs/${n}-${slugifySpecKitFeature(projectName)}`;
}

/** Extrae una sección H2 del MDD (## N. Título). */
export function extractMddSection(mdd: string, sectionNumber: number): string {
  const content = (mdd ?? "").trim();
  if (!content) return "";
  const pattern = new RegExp(`^##\\s*${sectionNumber}\\.[^\\n]*`, "im");
  const m = content.match(pattern);
  if (!m || m.index === undefined) return "";
  const start = m.index + m[0].length;
  const rest = content.slice(start);
  const next = rest.match(/\n##\s+\d+\./m);
  const end = next?.index !== undefined ? next.index + 1 : rest.length;
  return rest.slice(0, end).trim();
}

function buildQuickstart(
  spec: string | null | undefined,
  changeSpec?: string | null,
  acceptanceLines?: string[] | null,
): string {
  const bullets: string[] = [];

  if (acceptanceLines?.length) {
    for (const line of acceptanceLines.slice(0, 10)) {
      bullets.push(`- [ ] ${line.replace(/^[-*#\s]+/, "").trim()}`);
    }
  }

  const s = (spec ?? "").trim();
  if (s) {
    const lines = s
      .split("\n")
      .filter((l) => /criterio|éxito|aceptación|validar|acceptance/i.test(l))
      .slice(0, 8);
    for (const l of lines) {
      const b = `- [ ] ${l.replace(/^[-*#\s]+/, "").trim()}`;
      if (!bullets.includes(b)) bullets.push(b);
    }
  }

  const delta = (changeSpec ?? "").trim();
  if (delta) {
    const deltaChecks = delta
      .split("\n")
      .filter((l) => l.startsWith("- ") || l.startsWith("* "))
      .slice(0, 6);
    for (const l of deltaChecks) {
      const b = `- [ ] Validar: ${l.replace(/^[-*]\s*/, "").trim()}`;
      if (!bullets.includes(b)) bullets.push(b);
    }
  }

  if (bullets.length === 0) {
    bullets.push("- [ ] Validar criterios de éxito del spec.md en entorno local");
    bullets.push("- [ ] Ejecutar smoke test del flujo principal descrito en plan.md");
  }

  return `# Quickstart\n\n## Escenarios de validación\n\n${bullets.join("\n")}\n`;
}

/**
 * Genera entradas path → contenido para ZIP spec-kit.
 * Omite archivos vacíos salvo constitution (siempre si hay MDD).
 */
export function buildSpecKitBundleFiles(input: SpecKitBundleInput): SpecKitBundleFile[] {
  const featureDir = specKitFeatureDir(input.featureOrdinal ?? 1, input.projectName);
  const files: SpecKitBundleFile[] = [];

  const mdd = (input.mddContent ?? "").trim();
  if (mdd) {
    files.push({ path: ".specify/memory/constitution.md", content: mdd });
  }

  const pushIf = (rel: string, content: string | null | undefined) => {
    const t = (content ?? "").trim();
    if (t) files.push({ path: `${featureDir}/${rel}`, content: t });
  };

  pushIf("spec.md", input.specContent);
  pushIf("plan.md", input.blueprintContent);
  pushIf("tasks.md", input.tasksContent);
  pushIf("contracts/api-contracts.md", input.apiContractsContent);
  pushIf("logic-flows.md", input.logicFlowsContent);
  pushIf("infra.md", input.infraContent);
  pushIf("design-system.md", input.uxUiGuideContent);

  const research =
    (input.phase0SummaryContent ?? "").trim() || (input.dbgaContent ?? "").trim();
  pushIf("research.md", research || null);

  const dataModel = extractMddSection(mdd, 3);
  if (dataModel) {
    files.push({
      path: `${featureDir}/data-model.md`,
      content: `# Modelo de datos\n\n${dataModel}\n`,
    });
  }

  files.push({
    path: `${featureDir}/quickstart.md`,
    content: buildQuickstart(
      input.specContent,
      input.changeSpecContent,
      input.acceptanceCriteriaLines,
    ),
  });

  const guide = (input.consumptionGuideContent ?? "").trim();
  if (guide) {
    files.push({ path: "THEFORGE-DOC-CONSUMPTION-GUIDE.md", content: guide });
  }

  files.push({ path: "IMPLEMENT.md", content: buildSddImplementReadme(featureDir) });

  return files;
}
