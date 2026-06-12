import type { MddStructured } from "../state/mdd-structured.schema.js";
import { mddStructuredToMarkdown } from "../render/mdd-structured-to-markdown.js";
import { injectProposedComponentDiagramIntoSection2 } from "./mdd-component-diagram.util.js";
import { injectMddDiagrams, suggestMddDiagrams } from "./mdd-diagram-suggestions.js";
import {
  extractSection3Body,
  finalizeMddDeliverable,
  getSection6Or7Range,
  hydrateStructuredFromDraft,
  mddHasDuplicateSectionHeadings,
  normalizeMddFormat,
  replaceContextWhenOnlyMetadata,
  replaceSection6Or7InDraft,
  sanitizeContextKeyValueAndObject,
  sanitizeContextSection,
} from "./mdd-sanitize.js";
import {
  enrichMddWithUiUxDesignIntent,
  reconcileUiUxDesignIntent,
} from "./mdd-enrich-uiux-intent.js";
import { isPlaceholderSeguridad } from "./mdd-security-parse.js";
import { ensureMddGovernanceSection, extractGovernanceSection } from "@theforge/shared-types/mdd-governance-patterns";

export function hasStructuredContent(mdd: MddStructured | null | undefined): boolean {
  if (!mdd || typeof mdd !== "object") return false;
  const keys = Object.keys(mdd) as (keyof MddStructured)[];
  return keys.some((k) => {
    const v = mdd[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return Object.keys(v as object).length > 0;
  });
}

export function draftHasSubstantialSection6(draft: string): boolean {
  const trimmed = (draft ?? "").trim();
  const range = getSection6Or7Range(trimmed, 6);
  if (!range) return false;
  const bodyStart = range.start + range.heading.length;
  const body = trimmed.slice(bodyStart, range.end).replace(/^\s*\n+/, "").trim();
  return body.length > 200 && !/^\s*\(Pendiente[^)]*\)\s*$/im.test(body) && !/^\s*\{/.test(body);
}

function draftHasSubstantialSection3(draft: string): boolean {
  const section3Body = extractSection3Body(draft);
  return (section3Body?.length ?? 0) > 200 && /\bCREATE\s+TABLE\b/i.test(section3Body ?? "");
}

function countH2Sections(draft: string): number {
  return (draft.match(/^##\s+/gm) ?? []).length;
}

/**
 * Prefiere el borrador markdown cuando reconstruir desde mddStructured perdería §1–§5
 * (p. ej. tras regenerar §6 con structured parcial o solo placeholder en seguridad).
 */
export function shouldPreferDraftOverStructured(
  draft: string,
  structured?: MddStructured | null,
): boolean {
  const trimmed = (draft ?? "").trim();
  if (trimmed.length < 200) return false;
  if (draftHasSubstantialSection6(trimmed)) return true;
  // Si el draft tiene §6 pero el structured solo tiene placeholder, preservar draft
  const s6Range = getSection6Or7Range(trimmed, 6);
  if (s6Range) {
    const body = trimmed.slice(s6Range.start + s6Range.heading.length, s6Range.end).replace(/^\s*\n+/, "").trim();
    const hasRealContent = body.length > 15 && !/^\s*\(?Pendiente[^)]*\)?\s*$/im.test(body);
    if (hasRealContent && (!structured?.seguridad?.length || isPlaceholderSeguridad(structured.seguridad))) {
      return true;
    }
  }
  if (draftHasSubstantialSection3(trimmed)) return true;
  if (countH2Sections(trimmed) >= 4 && trimmed.length > 500) return true;
  if (!hasStructuredContent(structured)) return trimmed.length > 0;
  try {
    const hydrated = hydrateStructuredFromDraft(structured, trimmed);
    const rebuilt = mddStructuredToMarkdown(hydrated).trim();
    if (rebuilt.length > 0 && rebuilt.length < trimmed.length * 0.85) return true;
  } catch {
    return true;
  }
  return false;
}

/** Detecta heading canónico §6 (semáforo y validación post-/seguridad). */
export function draftHasSection6Heading(draft: string): boolean {
  return getSection6Or7Range((draft ?? "").trim(), 6) != null;
}

/**
 * normalizeMddFormat (deduplicateAndReorderMddSections) puede eliminar §6/§7 recién insertadas.
 * Restaura desde el borrador pre-normalize si desaparecieron.
 */
function restoreSections6And7AfterNormalize(source: string, normalized: string): string {
  // No reinyectar desde un borrador con §5/§6/§7 repetidas (evita reintroducir el bucle de duplicación).
  if (mddHasDuplicateSectionHeadings(source)) return normalized;
  let out = normalized;
  for (const section of [6, 7] as const) {
    const srcRange = getSection6Or7Range(source, section);
    if (!srcRange) continue;
    if (getSection6Or7Range(out, section)) continue;
    const sectionMd = source.slice(srcRange.start, srcRange.end).trim();
    if (sectionMd.length > 0) out = replaceSection6Or7InDraft(out, section, sectionMd);
  }
  return out;
}

/**
 * Fuente del markdown a enviar. Se prefiere mddDraft cuando es sustancial para no reconstruir desde
 * mddStructured (que podría tener §3 desactualizado o solo §6). Luego sanitize, normalize e inyección.
 */
export type PrepareMddForOutputOptions = {
  /** Sección inmutable del wizard; si no se pasa, se extrae del borrador de entrada. */
  preservedGovernance?: string | null;
};

export function prepareMddForOutput(
  input: { mddStructured?: MddStructured; mddDraft?: string } | string,
  options?: PrepareMddForOutputOptions,
): string {
  let raw: string;
  if (typeof input === "string") {
    raw = input;
  } else {
    const draft = (input.mddDraft ?? "").trim();
    if (shouldPreferDraftOverStructured(draft, input.mddStructured)) {
      raw = draft;
    } else if (hasStructuredContent(input.mddStructured)) {
      const hydrated = hydrateStructuredFromDraft(input.mddStructured, draft);
      raw = mddStructuredToMarkdown(hydrated);
    } else {
      raw = draft;
    }
  }
  const preserved =
    options?.preservedGovernance?.trim() ||
    extractGovernanceSection(raw) ||
    null;
  const sanitized =
    replaceContextWhenOnlyMetadata(sanitizeContextKeyValueAndObject(sanitizeContextSection(raw)));
  const normalized = restoreSections6And7AfterNormalize(raw, normalizeMddFormat(sanitized));
  const withDiagrams = injectMddDiagrams(normalized, suggestMddDiagrams(normalized));
  const withComponentDiagram = injectProposedComponentDiagramIntoSection2(withDiagrams);
  const enriched = enrichMddWithUiUxDesignIntent(withComponentDiagram);
  const withGovernance = ensureMddGovernanceSection(enriched, preserved);
  return reconcileUiUxDesignIntent(finalizeMddDeliverable(withGovernance));
}
