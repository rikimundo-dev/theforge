/**
 * Opciones `LegacyGenerateOptions` para regeneración individual (Workshop) y cascada legacy.
 */

import type { StageStatus } from "@theforge/database";
import type { LegacyGenerateOptions } from "../ai/ai.service.js";
import { resolveLegacyBaselineStageFlag } from "../ai/utils/legacy-as-is-spec.util.js";
import { pickPrimaryStage } from "../projects/stage-helpers.js";

export type LegacyGateStage = { ordinal: number; workflowStatus: StageStatus };

export interface BuildLegacyGenerateOptionsParams {
  projectType: string | null | undefined;
  theforgeProjectId: string | null | undefined;
  mddMarkdown: string;
  stages: LegacyGateStage[];
  theforgeConfigured: boolean;
  getContextForDeliverables: (theforgeProjectId: string) => Promise<string>;
  gatherContractSpecsForApi: (theforgeProjectId: string) => Promise<string>;
}

/** Contexto LLM legacy (TheForge + etapa 1 AS-IS). `undefined` si el proyecto no es LEGACY. */
export async function buildLegacyGenerateOptions(
  params: BuildLegacyGenerateOptionsParams,
): Promise<LegacyGenerateOptions | undefined> {
  if (params.projectType !== "LEGACY") return undefined;

  const gateStage = pickPrimaryStage(params.stages);
  const legacyBaselineStage = resolveLegacyBaselineStageFlag(gateStage, params.mddMarkdown);

  let theforgeContext: string | undefined;
  let contractSpecs: string | undefined;
  if (params.theforgeProjectId && params.theforgeConfigured) {
    [theforgeContext, contractSpecs] = await Promise.all([
      params.getContextForDeliverables(params.theforgeProjectId),
      params.gatherContractSpecsForApi(params.theforgeProjectId),
    ]);
  }

  if (!legacyBaselineStage && !theforgeContext?.trim() && !contractSpecs?.trim()) {
    return undefined;
  }

  return {
    legacyBaselineStage,
    theforgeContext: theforgeContext?.trim() || undefined,
    contractSpecs: contractSpecs?.trim() || undefined,
  };
}
