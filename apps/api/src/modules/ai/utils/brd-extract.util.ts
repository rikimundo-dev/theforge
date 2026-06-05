import { normalizeDashes } from "../../sessions/document-content.util.js";

/** Patrones típicos de salida corrupta del LLM (thinking, placeholders, UI meta). */
export const CORRUPTED_BRD_TEXT_PATTERNS: RegExp[] = [
  /\bpress\s+reply\b/i,
  /\bplaceholder\b/i,
  /\bwill\s+rewrite\b/i,
  /<\s*think(?:ing)?\s*>/i,
  /\bthinking\s*:/i,
  /\bhere'?s\s+my\s+thinking\b/i,
  /\blet me (?:think|draft|start)\b/i,
];

export type BrdExtractFailure = "empty" | "corrupted" | "no_delimiter" | "too_short";

export type BrdExtractResult =
  | { ok: true; content: string; method: "delimited" | "delimited_open" | "fin_brd" | "markdown" }
  | { ok: false; failure: BrdExtractFailure };

/** Detecta texto LLM que no debe persistirse como BRD. */
export function isCorruptedBrdLlmText(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/<\s*think(?:ing)?\s*>/i.test(t)) return true;
  if (/\bpress\s+reply\b/i.test(t)) return true;
  const head = t.slice(0, 800);
  if (
    CORRUPTED_BRD_TEXT_PATTERNS.filter(
      (re) => !re.source.includes("press") && !re.source.includes("think"),
    ).some((re) => re.test(head))
  ) {
    return true;
  }
  const lines = t.split(/\n/).filter((l) => l.trim());
  if (lines.length <= 2 && t.length < 120) return true;
  return false;
}

const MIN_BRD_BODY_CHARS = 120;

function looksLikeBrdMarkdown(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_BRD_BODY_CHARS) return false;
  const hasHeading = /^#{1,3}\s+\S/m.test(t);
  const hasBrdSignals =
    /contexto\s+y\s+objetivos|problema\s+de\s+negocio|alcance|capacidades\s+funcionales|business\s+requirements|criterios\s+de\s+aceptaci[oó]n|entidades\s+de\s+negocio|reglas\s+de\s+(?:negocio|operaci[oó]n)|m[eé]tricas\s+de\s+[eé]xito|supuestos|matriz\s+de\s+permisos|decision\s+log|flujos\s+de\s+negocio|pain\s*points|usuarios\s+y\s+casos\s+de\s+uso|l[ií]mites\s+del\s+alcance/i.test(
      t,
    );
  return hasHeading && hasBrdSignals;
}

function extractMarkdownBrd(cleaned: string): string | null {
  const anchors = [
    /(?:^|\n)#\s+(?:Business\s+Requirements|BRD\b)/i,
    /(?:^|\n)##\s+(?:1\.\s+)?Contexto\s+y\s+Objetivos/i,
    /(?:^|\n)##\s+Pain\s+Points/i,
    /(?:^|\n)##\s+[^\n]*Problem\s+Statement/i,
    /(?:^|\n)#\s+[^\n]{8,}/,
  ];
  for (const re of anchors) {
    const m = cleaned.match(re);
    if (m?.index !== undefined) {
      const slice = cleaned.slice(m.index).trim();
      if (looksLikeBrdMarkdown(slice) && !isCorruptedBrdLlmText(slice)) return slice;
    }
  }
  return null;
}

function stripCodeFences(text: string): string {
  return text.replace(/```\w*\s*\n?/g, "").replace(/\s*```\s*$/g, "").trim();
}

/**
 * Extrae el cuerpo BRD desde la respuesta del LLM.
 * Acepta delimitadores <<<BRD>>>, ---FIN_BRD--- (Workshop) o markdown BRD reconocible.
 */
export function extractBrdFromLlmResponse(raw: string): BrdExtractResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, failure: "empty" };
  if (isCorruptedBrdLlmText(trimmed)) return { ok: false, failure: "corrupted" };

  const cleaned = stripCodeFences(normalizeDashes(trimmed));

  const delimited = cleaned.match(/<<<\s*BRD\s*>>>\s*([\s\S]*?)\s*<<<_?END_BRD_?>>>/i);
  if (delimited?.[1]?.trim()) {
    const body = delimited[1].trim();
    if (body.length >= MIN_BRD_BODY_CHARS && !isCorruptedBrdLlmText(body)) {
      return { ok: true, content: body, method: "delimited" };
    }
    if (body.length < MIN_BRD_BODY_CHARS) return { ok: false, failure: "too_short" };
  }

  const openBrd = cleaned.match(/<<<\s*BRD\s*>>>\s*([\s\S]+)/i);
  if (openBrd?.[1]?.trim()) {
    const body = openBrd[1]
      .replace(/\s*<<<_?END_BRD_?>.*$/i, "")
      .trim();
    if (body.length >= MIN_BRD_BODY_CHARS && looksLikeBrdMarkdown(body) && !isCorruptedBrdLlmText(body)) {
      return { ok: true, content: body, method: "delimited_open" };
    }
  }

  const finMatch = cleaned.match(/([\s\S]*?)\s*-{1,}\s*FIN_BRD\s*-{1,}/i);
  if (finMatch?.[1]?.trim()) {
    let body = finMatch[1].trim();
    const fromTag = body.match(/<<<\s*BRD\s*>>>\s*([\s\S]*)/i);
    if (fromTag?.[1]) body = fromTag[1].trim();
    if (body.length >= MIN_BRD_BODY_CHARS && looksLikeBrdMarkdown(body) && !isCorruptedBrdLlmText(body)) {
      return { ok: true, content: body, method: "fin_brd" };
    }
  }

  const markdown = extractMarkdownBrd(cleaned);
  if (markdown) return { ok: true, content: markdown, method: "markdown" };

  if (looksLikeBrdMarkdown(cleaned) && !isCorruptedBrdLlmText(cleaned)) {
    return { ok: true, content: cleaned, method: "markdown" };
  }

  return { ok: false, failure: "no_delimiter" };
}

/** Mensaje HTTP 400 en español según la causa del fallo. */
export function brdGenerationErrorMessage(
  failure: BrdExtractFailure,
  opts?: { dbgaTruncated?: boolean; rawLength?: number },
): string {
  const truncatedHint = opts?.dbgaTruncated
    ? " El DBGA era muy largo y se envió una versión resumida (inicio + final); si falta contexto, acórtalo manualmente o divide el benchmark."
    : "";
  switch (failure) {
    case "empty":
      return (
        "El proveedor de IA devolvió una respuesta vacía. Revisa la configuración del proveedor (API key, modelo, cuota) e inténtalo de nuevo." +
        truncatedHint
      );
    case "corrupted":
      return (
        "La respuesta del modelo parece incompleta o corrupta (p. ej. trazas de razonamiento o texto cortado). Reintenta; si persiste, acorta el DBGA o limpia contenido pegado del chat." +
        truncatedHint
      );
    case "too_short":
      return (
        "El BRD generado fue demasiado breve para guardarse. Reintenta con un DBGA más detallado o cambia de modelo." +
        truncatedHint
      );
    case "no_delimiter":
    default: {
      const lenHint =
        opts?.rawLength != null && opts.rawLength > 0
          ? ` (respuesta del modelo: ~${opts.rawLength} caracteres, sin delimitadores reconocibles).`
          : "";
      return (
        "No se pudo extraer un BRD válido de la respuesta del modelo" +
        lenHint +
        " Reintenta; si el DBGA es muy extenso, acórtalo o usa un modelo con mayor ventana de contexto." +
        truncatedHint
      );
    }
  }
}
