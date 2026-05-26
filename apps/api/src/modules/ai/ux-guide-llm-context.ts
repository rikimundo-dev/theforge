import type { GenerateResponseOptions } from "./interfaces/llm-provider.interface.js";
import { getDesignBySlug, formatDesignReferencePrompt } from "../design-ref/data/design-references.js";

/** Campos de proyecto necesarios para enriquecer la Guía UX/UI y el Prompt Stitch (solo NEW). */
export type UxGuideProjectFields = {
  projectType: string;
  specContent?: string | null;
  useCasesContent?: string | null;
  userStoriesContent?: string | null;
  logicFlowsContent?: string | null;
  architectureContent?: string | null;
  apiContractsContent?: string | null;
  dbgaContent?: string | null;
  phase0SummaryContent?: string | null;
  uxGuideDesignRef?: string | null;
};

function sliceDoc(s: string | null | undefined, max: number): string | undefined {
  const t = (s ?? "").trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max)}\n…`;
}

/**
 * Opciones de LLM para la Guía UX/UI: tipo de proyecto (Stitch solo NEW), fragmentos SDD y design reference.
 */
export function uxGuideLlmOptions(
  project: UxGuideProjectFields,
): Pick<
  GenerateResponseOptions,
  "projectTypeForUxGuide" | "uxGuideAdditionalDocs" | "uxGuideDesignRef" | "uxGuideDesignRefPromptBlock"
> {
  const base: Pick<
    GenerateResponseOptions,
    "projectTypeForUxGuide" | "uxGuideAdditionalDocs" | "uxGuideDesignRef" | "uxGuideDesignRefPromptBlock"
  > = {
    projectTypeForUxGuide: project.projectType === "LEGACY" ? "LEGACY" : "NEW",
  };

  // Design Reference
  const refSlug = project.uxGuideDesignRef?.trim();
  if (refSlug) {
    base.uxGuideDesignRef = refSlug;
    if (refSlug !== "auto") {
      // Buscar en el catálogo
      const ref = getDesignBySlug(refSlug);
      if (ref) {
        base.uxGuideDesignRefPromptBlock = formatDesignReferencePrompt(ref);
      }
    }
  }

  // SDD docs (solo NEW)
  if (project.projectType !== "LEGACY") {
    base.uxGuideAdditionalDocs = {
      spec: sliceDoc(project.specContent, 6000),
      useCases: sliceDoc(project.useCasesContent, 5000),
      userStories: sliceDoc(project.userStoriesContent, 5000),
      logicFlows: sliceDoc(project.logicFlowsContent, 5000),
      architecture: sliceDoc(project.architectureContent, 5000),
      apiContracts: sliceDoc(project.apiContractsContent, 4000),
      dbga: sliceDoc(project.dbgaContent, 4000),
      phase0: sliceDoc(project.phase0SummaryContent, 3000),
    };
  }

  return base;
}