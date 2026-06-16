import type { DeliverableKind } from "@theforge/shared-types";

/**
 * Política env (`LEGACY_DELIVERABLES_SECTION_MERGE`).
 * `auto` elige por entregable según estimación de tokens del prompt monolítico equivalente.
 */
export type LegacyDeliverablesSectionMergePolicy = "off" | "blueprint" | "all" | "auto";

/** Forma “legacy” sin `auto` (compat interna). */
export type LegacyDeliverablesSectionMergeFixedPolicy = Exclude<LegacyDeliverablesSectionMergePolicy, "auto">;

/**
 * Identificador de envoltura de generación (extensible).
 * Hoy: `section_merge` = ventanas § + ensamblado; `monolithic` = una llamada tipo AiService.generate*.
 */
export type LegacyDeliverablesEnvelopeStrategyId = "section_merge" | "monolithic";

export type LegacyDeliverablesTokenEstimateMethod = "tiktoken" | "approx_chars";

/**
 * Entrada para estimar el camino monolítico.
 * Se usan **textos reales** (mismos recortes que `AiService`) para contar con `js-tiktoken`.
 */
export type LegacyDeliverablesStrategyContext = {
  /** MDD enviado a la cascada (rollup/truncate ya aplicados). */
  mddText: string;
  /** Contexto TheForge (el resolver aplica caps como en prompts legacy). */
  theforgeContextText: string;
  blueprintText?: string;
  specText?: string;
  useCasesText?: string;
  /** Etapa 1 AS-IS: fuerza monolítico + MDD completo en estimación. */
  legacyBaselineStage?: boolean;
};

export interface LegacyDeliverablesStrategyResolution {
  kind: DeliverableKind;
  policy: LegacyDeliverablesSectionMergePolicy;
  envelopeStrategy: LegacyDeliverablesEnvelopeStrategyId;
  /** Si el coordinador debe invocar `trySectionMergeDeliverable`. */
  attemptSectionMerge: boolean;
  /** Muestra del user prompt monolítico (MDD/spec/TF recortados) usada para el conteo. */
  estimatedMonolithicUserPromptChars: number;
  /** Tokens estimados (tiktoken sobre la muestra + overhead de instrucciones, o fallback chars/ratio). */
  estimatedMonolithicUserPromptTokens: number;
  tokenEstimateMethod: LegacyDeliverablesTokenEstimateMethod;
  /** Encoding tiktoken usado cuando `tokenEstimateMethod === "tiktoken"`. */
  tiktokenEncoding?: string;
  /** Umbral en tokens estimados por encima del cual `auto` prefiere section merge. */
  autoUserPromptTokenThreshold: number;
  /** Ratio chars→tokens solo para fallback `approx_chars`. */
  charsPerToken: number;
  /** Texto breve para logs / `lastDeliverablesDebug`. */
  reason: string;
}
