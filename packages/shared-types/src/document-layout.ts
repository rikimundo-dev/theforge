/**
 * Document layout mapping: spec-kit primary paths ↔ docs/sdd mirror (agent governance).
 */

export type DocumentLayoutKind = "spec-kit-primary";

export interface DocumentPathEntry {
  /** Primary path (spec-kit layout at repo root). */
  primary: string;
  /** Mirror path under docs/sdd/ (agent governance scaffold). */
  mirror: string;
  label: string;
}

/** Static entries (featureDir placeholder resolved at runtime). */
export const DOCUMENT_PATH_MAP_STATIC: DocumentPathEntry[] = [
  {
    primary: ".specify/memory/constitution.md",
    mirror: "docs/sdd/mdd.md",
    label: "Constitución (MDD)",
  },
  {
    primary: "{featureDir}/spec.md",
    mirror: "docs/sdd/spec.md",
    label: "Spec",
  },
  {
    primary: "{featureDir}/plan.md",
    mirror: "docs/sdd/blueprint.md",
    label: "Blueprint / Plan",
  },
  {
    primary: "{featureDir}/tasks.md",
    mirror: "docs/sdd/tasks.md",
    label: "Tasks",
  },
];

/** Resolve path map for a concrete feature directory (e.g. specs/001-my-feature). */
export function resolveDocumentPathMap(featureDir: string): DocumentPathEntry[] {
  return DOCUMENT_PATH_MAP_STATIC.map((entry) => ({
    ...entry,
    primary: entry.primary.replace("{featureDir}", featureDir),
  }));
}

/** Markdown table rows for handoff / governance docs. */
export function formatDocumentPathMapTable(featureDir: string): string {
  const rows = resolveDocumentPathMap(featureDir)
    .map((e) => `| ${e.label} | \`${e.primary}\` | \`${e.mirror}\` |`)
    .join("\n");
  return `| Documento | Primario (spec-kit) | Espejo (gobernanza) |\n|-----------|---------------------|---------------------|\n${rows}`;
}

export interface NextTaskDocumentLayout {
  documentLayout: DocumentLayoutKind;
  featureDir: string;
  constitutionPath: string;
  tasksPath: string;
  specPath: string;
  planPath: string;
  governancePresent: boolean;
  implementReadmePath: string;
  implementHint?: string;
}

export function buildNextTaskDocumentLayout(
  featureDir: string,
  governancePresent: boolean,
): NextTaskDocumentLayout {
  return {
    documentLayout: "spec-kit-primary",
    featureDir,
    constitutionPath: ".specify/memory/constitution.md",
    tasksPath: `${featureDir}/tasks.md`,
    specPath: `${featureDir}/spec.md`,
    planPath: `${featureDir}/plan.md`,
    governancePresent,
    implementReadmePath: "IMPLEMENT.md",
  };
}
