/**
 * Estructura de export compatible con github/spec-kit:
 * `.specify/memory/constitution.md` + `specs/{NNN}-{slug}/`.
 */

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
}

/** Resumen para handoff de implementación (equivalente a consumir docs The Forge en repo destino). */
export const SDD_IMPLEMENT_README = `# Implementación desde The Forge

1. Lee primero \`.specify/memory/constitution.md\` (MDD) — fuente de verdad.
2. Sigue \`spec.md\` (what/why) y \`plan.md\` (blueprint).
3. Implementa con \`tasks.md\` como checklist; contrasta siempre con MDD y contratos.
4. Los API contracts son vinculantes (métodos, paths, DTOs).
5. Si hay conflicto entre documentos, **el MDD gana**.

Ver \`THEFORGE-DOC-CONSUMPTION-GUIDE.md\` en este bundle para reglas completas de consumo por agentes.
`;

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

function buildQuickstart(spec: string | null | undefined): string {
  const s = (spec ?? "").trim();
  if (!s) {
    return `# Quickstart\n\n- [ ] Validar que el entorno de desarrollo arranca según plan.md\n- [ ] Ejecutar smoke test del flujo principal descrito en spec.md\n`;
  }
  const lines = s.split("\n").filter((l) => /criterio|éxito|aceptación|validar/i.test(l)).slice(0, 8);
  const bullets =
    lines.length > 0
      ? lines.map((l) => `- [ ] ${l.replace(/^[-*#\s]+/, "").trim()}`).join("\n")
      : "- [ ] Validar criterios de éxito del spec.md en entorno local";
  return `# Quickstart\n\n## Escenarios de validación\n\n${bullets}\n`;
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

  files.push({ path: `${featureDir}/quickstart.md`, content: buildQuickstart(input.specContent) });

  const guide = (input.consumptionGuideContent ?? "").trim();
  if (guide) {
    files.push({ path: "THEFORGE-DOC-CONSUMPTION-GUIDE.md", content: guide });
  }

  files.push({ path: "IMPLEMENT.md", content: SDD_IMPLEMENT_README });

  return files;
}
