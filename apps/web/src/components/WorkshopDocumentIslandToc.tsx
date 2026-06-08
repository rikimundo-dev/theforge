import type { RefObject } from "react";
import { DynamicIslandTOC } from "@/components/ui/dynamic-island-toc";

export type WorkshopDocToolbarViewModes = {
  mddViewMode: "preview" | "source";
  mddInicialViewMode: "preview" | "source";
  specViewMode: "preview" | "source";
  architectureViewMode: "preview" | "source";
  useCasesViewMode: "preview" | "source";
  userStoriesViewMode: "preview" | "source";
  uxUiGuideViewMode: "design" | "preview" | "source";
  aemViewMode: "preview" | "source";
  blueprintViewMode: "preview" | "source";
  apiContractsViewMode: "preview" | "source";
  logicFlowsViewMode: "preview" | "source";
  brdDocViewMode: "preview" | "source";
  infraViewMode: "preview" | "source";
};

const MARKDOWN_PREVIEW_SELECTOR =
  ".markdown-preview h1, .markdown-preview h2, .markdown-preview h3, .markdown-preview h4, .markdown-preview [data-toc]";

const NON_MARKDOWN_PANELS = new Set(["tasks", "legacy", "adrs", "wireframes"]);

function getWorkshopDocToolbarActiveViewMode(
  centralPanel: string,
  modes: WorkshopDocToolbarViewModes,
): string {
  if (centralPanel === "mdd") return modes.mddViewMode;
  if (centralPanel === "mdd-inicial") return modes.mddInicialViewMode;
  if (centralPanel === "spec") return modes.specViewMode;
  if (centralPanel === "architecture") return modes.architectureViewMode;
  if (centralPanel === "use-cases") return modes.useCasesViewMode;
  if (centralPanel === "user-stories") return modes.userStoriesViewMode;
  if (centralPanel === "ux-ui-guide") return modes.uxUiGuideViewMode;
  if (centralPanel === "aem") return modes.aemViewMode;
  if (centralPanel === "blueprint") return modes.blueprintViewMode;
  if (centralPanel === "api-contracts") return modes.apiContractsViewMode;
  if (centralPanel === "logic-flows") return modes.logicFlowsViewMode;
  if (centralPanel === "brd") return modes.brdDocViewMode;
  return modes.infraViewMode;
}

export function isWorkshopMarkdownPreviewActive(
  centralPanel: string,
  modes: WorkshopDocToolbarViewModes,
  benchmarkPhaseTab: "fase0" | "benchmark",
  benchmarkViewMode: "preview" | "source",
  phase0SummaryViewMode: "preview" | "source",
): boolean {
  if (NON_MARKDOWN_PANELS.has(centralPanel)) return false;

  if (centralPanel === "benchmark") {
    return benchmarkPhaseTab === "fase0"
      ? benchmarkViewMode === "preview"
      : phase0SummaryViewMode === "preview";
  }

  if (centralPanel === "ux-ui-guide") {
    return modes.uxUiGuideViewMode === "preview";
  }

  return getWorkshopDocToolbarActiveViewMode(centralPanel, modes) === "preview";
}

export interface WorkshopDocumentIslandTocProps {
  scrollContainerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  centralPanel: string;
  contentKey: string;
}

/**
 * Desktop-only table of contents for long workshop markdown previews.
 */
export function WorkshopDocumentIslandToc({
  scrollContainerRef,
  enabled,
  centralPanel,
  contentKey,
}: WorkshopDocumentIslandTocProps) {
  if (!enabled) return null;

  return (
    <DynamicIslandTOC
      selector={MARKDOWN_PREVIEW_SELECTOR}
      scrollContainerRef={scrollContainerRef}
      contentKey={`${centralPanel}:${contentKey}`}
      minHeadings={2}
    />
  );
}
