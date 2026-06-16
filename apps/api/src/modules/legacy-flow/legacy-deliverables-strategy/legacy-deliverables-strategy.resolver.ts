import type { DeliverableKind } from "@theforge/shared-types";
import { legacyDeliverableKindSupportsSectionMerge } from "../legacy-section-merge-deliverables.runner.js";
import {
  countLegacyDeliverablesPromptTokens,
  ensureLegacyStrategyTiktokenLoaded,
  readTiktokenInstructionOverheadTokens,
} from "./legacy-deliverables-tiktoken.util.js";
import type {
  LegacyDeliverablesEnvelopeStrategyId,
  LegacyDeliverablesSectionMergeFixedPolicy,
  LegacyDeliverablesSectionMergePolicy,
  LegacyDeliverablesStrategyContext,
  LegacyDeliverablesStrategyResolution,
  LegacyDeliverablesTokenEstimateMethod,
} from "./legacy-deliverables-strategy.types.js";
import { isLegacyBaselineFullDetailEnabled } from "../../ai/utils/legacy-baseline-detail.util.js";

function readTheForgePrependMaxChars(): number {
  const n = parseInt(process.env.THEFORGE_CONTEXT_PREPEND_MAX_CHARS ?? "16000", 10);
  return Number.isFinite(n) && n > 2000 ? n : 16000;
}

function readCharsPerToken(): number {
  const n = parseFloat(process.env.LEGACY_DELIVERABLES_STRATEGY_CHARS_PER_TOKEN ?? "4");
  return Number.isFinite(n) && n >= 2 && n <= 8 ? n : 4;
}

function readAutoUserPromptTokenThreshold(): number {
  const n = parseInt(process.env.LEGACY_DELIVERABLES_STRATEGY_AUTO_USER_PROMPT_TOKEN_MAX ?? "28000", 10);
  return Number.isFinite(n) && n > 1000 ? n : 28000;
}

function readTiktokenEncodingLabel(): string {
  return (process.env.LEGACY_DELIVERABLES_STRATEGY_TIKTOKEN_ENCODING?.trim() || "cl100k_base").toLowerCase();
}

/**
 * Lee `LEGACY_DELIVERABLES_SECTION_MERGE`.
 * Valores desconocidos se tratan como `all` (comportamiento histórico), salvo `auto` explícito.
 */
export function readLegacyDeliverablesSectionMergePolicy(): LegacyDeliverablesSectionMergePolicy {
  const v = process.env.LEGACY_DELIVERABLES_SECTION_MERGE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return "off";
  if (v === "blueprint") return "blueprint";
  if (v === "auto") return "auto";
  if (v === "all" || v === undefined || v === "") return "all";
  return "all";
}

function mddTheforgeContextMaxCharsForUx(): number {
  const n = parseInt(process.env.LEGACY_MDD_THEFORGE_CONTEXT_MAX_CHARS ?? "64000", 10);
  return Number.isFinite(n) && n > 0 ? n : 64000;
}

function block(label: string, body: string): string {
  if (!body) return "";
  return `${label}\n---\n${body}\n---\n`;
}

/**
 * Muestra del user prompt monolítico con los **mismos recortes** que `AiService` por tipo de entregable.
 */
export function buildLegacyMonolithicUserPromptSample(
  kind: DeliverableKind,
  ctx: LegacyDeliverablesStrategyContext,
): string {
  const mdd = ctx.mddText ?? "";
  const tfRaw = ctx.theforgeContextText ?? "";
  const bp = ctx.blueprintText ?? "";
  const sp = ctx.specText ?? "";
  const uc = ctx.useCasesText ?? "";
  const fullDetail = ctx.legacyBaselineStage === true && isLegacyBaselineFullDetailEnabled();

  const tfCapStandard = readTheForgePrependMaxChars();
  const tfStandard = tfRaw.length > 0 ? tfRaw.slice(0, tfCapStandard) : "";

  const capMdd = (n: number) => (fullDetail ? mdd : mdd.slice(0, n));
  const capAux = (text: string, n: number) => (fullDetail ? text : text.slice(0, n));

  let parts = "";

  if (kind === "ux_ui_guide") {
    const tfUx = tfRaw.length > 0 ? tfRaw.slice(0, mddTheforgeContextMaxCharsForUx()) : "";
    if (tfUx) parts += block("THEFORGE_CONTEXT", tfUx);
    parts += block("MDD", capMdd(8000));
    parts += block("BLUEPRINT", capAux(bp, 4000));
    return parts.trimEnd();
  }

  if (tfStandard) parts += block("THEFORGE_CONTEXT", tfStandard);

  switch (kind) {
    case "spec":
      parts += block("MDD", capMdd(12000));
      break;
    case "blueprint":
      parts += block("MDD", mdd);
      break;
    case "architecture":
      parts += block("MDD", capMdd(10000));
      parts += block("BLUEPRINT", capAux(bp, 8000));
      break;
    case "use_cases":
      parts += block("MDD", capMdd(12000));
      parts += block("SPEC", capAux(sp, 8000));
      break;
    case "api_contracts":
      parts += block("MDD", mdd);
      parts += block("BLUEPRINT", capAux(bp, 8000));
      break;
    case "logic_flows":
      parts += block("MDD", mdd);
      break;
    case "user_stories":
      parts += block("MDD", capMdd(10000));
      parts += block("SPEC", capAux(sp, 6000));
      parts += block("USE_CASES", capAux(uc, 6000));
      break;
    case "tasks":
      parts += block("MDD", capMdd(10000));
      parts += block("BLUEPRINT", capAux(bp, 8000));
      break;
    case "infra":
      parts += block("MDD", mdd);
      parts += block("BLUEPRINT", capAux(bp, 6000));
      break;
    default:
      parts += block("MDD", mdd);
  }

  return parts.trimEnd();
}

/** @deprecated Usar `buildLegacyMonolithicUserPromptSample` + conteo tiktoken; se mantiene para pruebas / telemetría aproximada. */
export function estimateLegacyMonolithicUserPromptChars(
  kind: DeliverableKind,
  ctx: LegacyDeliverablesStrategyContext,
): number {
  return buildLegacyMonolithicUserPromptSample(kind, ctx).length + 350;
}

function estimateTokens(
  sample: string,
  charsPerToken: number,
): { tokens: number; method: LegacyDeliverablesTokenEstimateMethod } {
  const { tokens: body, method } = countLegacyDeliverablesPromptTokens(sample, charsPerToken);
  const overhead = readTiktokenInstructionOverheadTokens();
  return { tokens: body + overhead, method };
}

function fixedPolicyAttempt(
  policy: LegacyDeliverablesSectionMergeFixedPolicy,
  kind: DeliverableKind,
): boolean {
  if (!legacyDeliverableKindSupportsSectionMerge(kind)) return false;
  if (policy === "off") return false;
  if (policy === "blueprint") return kind === "blueprint";
  return true;
}

function resolveEnvelope(attemptSectionMerge: boolean): LegacyDeliverablesEnvelopeStrategyId {
  return attemptSectionMerge ? "section_merge" : "monolithic";
}

export async function resolveLegacyDeliverablesSectionMergeAttempt(
  kind: DeliverableKind,
  ctx: LegacyDeliverablesStrategyContext,
): Promise<LegacyDeliverablesStrategyResolution> {
  await ensureLegacyStrategyTiktokenLoaded();
  const policy = readLegacyDeliverablesSectionMergePolicy();
  const charsPerToken = readCharsPerToken();
  const threshold = readAutoUserPromptTokenThreshold();
  const sample = buildLegacyMonolithicUserPromptSample(kind, ctx);

  if (ctx.legacyBaselineStage === true && isLegacyBaselineFullDetailEnabled()) {
    const { tokens, method } = estimateTokens(sample, charsPerToken);
    return {
      kind,
      policy,
      envelopeStrategy: "monolithic",
      attemptSectionMerge: false,
      estimatedMonolithicUserPromptChars: sample.length + 350,
      estimatedMonolithicUserPromptTokens: tokens,
      tokenEstimateMethod: method,
      tiktokenEncoding: method === "tiktoken" ? readTiktokenEncodingLabel() : undefined,
      autoUserPromptTokenThreshold: threshold,
      charsPerToken,
      reason: "legacy_baseline_stage_full_detail",
    };
  }

  if (!legacyDeliverableKindSupportsSectionMerge(kind)) {
    const { tokens, method } = estimateTokens(sample, charsPerToken);
    return {
      kind,
      policy,
      envelopeStrategy: "monolithic",
      attemptSectionMerge: false,
      estimatedMonolithicUserPromptChars: sample.length + 350,
      estimatedMonolithicUserPromptTokens: tokens,
      tokenEstimateMethod: method,
      tiktokenEncoding: method === "tiktoken" ? readTiktokenEncodingLabel() : undefined,
      autoUserPromptTokenThreshold: threshold,
      charsPerToken,
      reason: "kind_sin_section_merge_en_KIND_CFG",
    };
  }

  if (policy === "auto") {
    const { tokens, method } = estimateTokens(sample, charsPerToken);
    const preferMerge = tokens > threshold;
    return {
      kind,
      policy,
      envelopeStrategy: resolveEnvelope(preferMerge),
      attemptSectionMerge: preferMerge,
      estimatedMonolithicUserPromptChars: sample.length + 350,
      estimatedMonolithicUserPromptTokens: tokens,
      tokenEstimateMethod: method,
      tiktokenEncoding: method === "tiktoken" ? readTiktokenEncodingLabel() : undefined,
      autoUserPromptTokenThreshold: threshold,
      charsPerToken,
      reason: preferMerge
        ? `auto:est_tokens_${tokens}>threshold_${threshold}(${method})`
        : `auto:est_tokens_${tokens}<=threshold_${threshold}(${method})`,
    };
  }

  const attempt = fixedPolicyAttempt(policy, kind);
  const { tokens, method } = estimateTokens(sample, charsPerToken);
  return {
    kind,
    policy,
    envelopeStrategy: resolveEnvelope(attempt),
    attemptSectionMerge: attempt,
    estimatedMonolithicUserPromptChars: sample.length + 350,
    estimatedMonolithicUserPromptTokens: tokens,
    tokenEstimateMethod: method,
    tiktokenEncoding: method === "tiktoken" ? readTiktokenEncodingLabel() : undefined,
    autoUserPromptTokenThreshold: threshold,
    charsPerToken,
    reason: `fixed_policy:${policy}`,
  };
}
