import type { MddStructured } from "../state/mdd-structured.schema.js";
import { mddStructuredToMarkdown } from "../render/mdd-structured-to-markdown.js";
import { injectMddDiagrams, suggestMddDiagrams } from "./mdd-diagram-suggestions.js";
import {
  extractSection3Body,
  getSection6Or7Range,
  hydrateStructuredFromDraft,
  normalizeMddFormat,
  replaceContextWhenOnlyMetadata,
  sanitizeContextKeyValueAndObject,
  sanitizeContextSection,
} from "./mdd-sanitize.js";
import { enrichMddWithUiUxDesignIntent } from "./mdd-enrich-uiux-intent.js";

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

/**
 * Fuente del markdown a enviar. Se prefiere mddDraft cuando es sustancial para no reconstruir desde
 * mddStructured (que podría tener §3 desactualizado o solo §6). Luego sanitize, normalize e inyección.
 */
export function prepareMddForOutput(
  input: { mddStructured?: MddStructured; mddDraft?: string } | string,
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
  const sanitized =
    replaceContextWhenOnlyMetadata(sanitizeContextKeyValueAndObject(sanitizeContextSection(raw)));
  const normalized = normalizeMddFormat(sanitized);
  const withDiagrams = injectMddDiagrams(normalized, suggestMddDiagrams(normalized));
  return enrichMddWithUiUxDesignIntent(withDiagrams);
}
