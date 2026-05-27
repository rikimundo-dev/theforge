/** Filename used when downloading the active workshop document tab. */
const PANEL_DOWNLOAD_FILENAME: Record<string, string> = {
  benchmark: "benchmark.md",
  spec: "spec.md",
  mdd: "mdd.md",
  "mdd-inicial": "mdd-inicial.md",
  brd: "brd.md",
  "ux-ui-guide": "design-system.md",
  blueprint: "blueprint.md",
  "api-contracts": "api-contracts.md",
  "logic-flows": "logic-flows.md",
  tasks: "tasks.md",
  infra: "infra.md",
  architecture: "architecture.md",
  "use-cases": "use-cases.md",
  "user-stories": "user-stories.md",
  aem: "aem.md",
};

export interface WorkshopActiveDocumentDownloadInput {
  panel: string;
  benchmarkPhaseTab?: "fase0" | "benchmark";
  dbgaContent?: string | null;
  phase0SummaryContent?: string | null;
  specContent?: string | null;
  mddContent?: string | null;
  mddInicialContent?: string | null;
  brdContent?: string | null;
  uxUiGuideContent?: string | null;
  blueprintContent?: string | null;
  apiContractsContent?: string | null;
  logicFlowsContent?: string | null;
  tasksContent?: string | null;
  infraContent?: string | null;
  architectureContent?: string | null;
  useCasesContent?: string | null;
  userStoriesContent?: string | null;
  aemContent?: string | null;
}

/**
 * Resolves markdown text and filename for the document currently shown in the workshop center column.
 */
export function resolveWorkshopActiveDocumentDownload(
  input: WorkshopActiveDocumentDownloadInput,
): { filename: string; content: string } | null {
  const { panel } = input;

  if (panel === "benchmark") {
    const isFase0 = input.benchmarkPhaseTab !== "benchmark";
    const content = isFase0 ? (input.dbgaContent ?? "") : (input.phase0SummaryContent ?? "");
    const filename = isFase0 ? "fase0-dbga.md" : "benchmark.md";
    if (!content.trim()) return null;
    return { filename, content };
  }

  const filename = PANEL_DOWNLOAD_FILENAME[panel];
  if (!filename) return null;

  const contentByPanel: Record<string, string | null | undefined> = {
    spec: input.specContent,
    mdd: input.mddContent,
    "mdd-inicial": input.mddInicialContent,
    brd: input.brdContent,
    "ux-ui-guide": input.uxUiGuideContent,
    blueprint: input.blueprintContent,
    "api-contracts": input.apiContractsContent,
    "logic-flows": input.logicFlowsContent,
    tasks: input.tasksContent,
    infra: input.infraContent,
    architecture: input.architectureContent,
    "use-cases": input.useCasesContent,
    "user-stories": input.userStoriesContent,
    aem: input.aemContent,
  };

  const content = contentByPanel[panel] ?? "";
  if (!content.trim()) return null;
  return { filename, content };
}
