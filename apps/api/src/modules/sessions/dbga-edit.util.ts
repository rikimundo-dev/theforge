/** Heurística: el usuario pide cambiar el DBGA / Fase 0 (no solo preguntar). */
export function looksLikeDbgaEditRequest(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  return /\b(modific|actualiz|añad|agreg|quitar|cambiar|ajustes?|hay que|debe|necesit|incorpor|espej|tenant|multi-?tenant|catálogo|mantenimiento|obp4?mo)\b/i.test(
    m,
  );
}

export function normalizeDbgaForCompare(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export function isDbgaContentNearlyIdentical(next: string, current: string): boolean {
  const a = normalizeDbgaForCompare(next);
  const b = normalizeDbgaForCompare(current);
  if (a === b) return true;
  const lenDiff = Math.abs(a.length - b.length);
  return lenDiff < Math.max(150, b.length * 0.008);
}

/**
 * Comprueba si el documento parece incorporar requisitos explícitos del mensaje del usuario.
 * Evita persistir un "DBGA actualizado" que solo repite el texto anterior.
 */
export function dbgaReflectsUserEditIntent(doc: string, userMessage: string): boolean {
  const d = doc.toLowerCase();
  const u = userMessage.toLowerCase();

  if (/\btenant[_\s-]?id\b|multi-?tenant|multi tenant/.test(u)) {
    if (!/\btenant_id\b/.test(d)) return false;
    if (/multi-?tenant|multi tenant/.test(u) && !/multi-?tenant|multi tenant|multi-tenancy/.test(d)) {
      return false;
    }
  }

  if (/catálogo de costos|catalogo de costos/.test(u) && /obp4?mo|obp\b/.test(u)) {
    if (/alimentad|espej|origen|tenant/.test(u) && !/tenant_id|espej|obp4?mo/.test(d)) {
      return false;
    }
  }

  if (/módulo\s*0?1|modulo\s*0?1/.test(u) && /aplicacion|aplicaciones|obp/.test(u)) {
    if (!/módulo\s*0?1|modulo\s*0?1|catálogo de costos/.test(d)) return false;
  }

  if (/\bespejo\b|tablas?\s+espejo|id\s+(de\s+)?origen|id\s+propio/i.test(u)) {
    const mirrorCols =
      /\borigen_id\b|\bsource_id\b|\bid_origen\b|\bid_fuente\b|\bid_espejo\b|\bmirror_id\b|\bid_propio\b|\bexternal_id\b|\btenant_id\b|CREATE\s+TABLE/i;
    if (!mirrorCols.test(d)) return false;
    if (/\borigen\b/i.test(u) && !/\borigen|origin|source|fuente|external/i.test(d)) return false;
    if (/\bpropio\b/i.test(u) && !/\bpropio|mirror_id|id_espejo|PRIMARY/i.test(d)) return false;
  }

  const geoMirror =
    /\b(pa[ií]s|paises|estados?|ciudades?|colonias?|c[oó]digos?\s*postales?|geograf|espejo)\b/i.test(
      u,
    );
  if (geoMirror) {
    const needsPaises = /\bpa[ií]s|paises\b/i.test(u);
    const needsEstados = /\bestados?\b/i.test(u);
    const needsCiudades = /\bciudades?\b/i.test(u);
    if (needsPaises && !/\bpaises\b|\bpa[ií]s\b/i.test(d)) return false;
    if (needsEstados && !/\bestados?\b/i.test(d)) return false;
    if (needsCiudades && !/\bciudades?\b/i.test(d)) return false;
    if (/\bespejo\b/i.test(u) && !/\bespejo\b|CREATE\s+TABLE/i.test(d)) return false;
  }

  return true;
}

export const BENCHMARK_CHAT_ACK =
  "Fase 0 (DBGA) actualizado. Revisa el panel «Análisis (DBGA)».";

export const BENCHMARK_CHAT_NO_CHANGE =
  "No se guardaron cambios en Fase 0 (DBGA). La respuesta no incluyó el documento completo con ---FIN_DBGA---. Repite la petición (p. ej. integrar el diagrama en tablas espejo con tenant_id) o edita el panel directamente.";

/** Evita mensaje de éxito en chat cuando el panel no se persistió. */
export function benchmarkAssistantChatMessage(
  rawChat: string,
  finalDbga: string | undefined,
): string {
  const chat = rawChat.trim();
  if (finalDbga?.trim()) {
    return !chat || chat === BENCHMARK_CHAT_ACK ? BENCHMARK_CHAT_ACK : chat;
  }
  if (
    !chat ||
    chat === BENCHMARK_CHAT_ACK ||
    /^benchmark actualizado/i.test(chat) ||
    /^fase 0 \(dbga\) actualizado/i.test(chat)
  ) {
    return BENCHMARK_CHAT_NO_CHANGE;
  }
  return chat;
}

/** Separa documento DBGA del mensaje de chat (tolerante a `---FIN_DBGA---` pegado al texto). */
export function parseBenchmarkResponse(
  response: string,
): { docPart: string; chatPart: string } | null {
  const trimmed = response.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
  const re = /-{1,}\s*FIN_DBGA\s*-{1,}/i;
  const match = re.exec(normalized);
  if (!match || match.index == null) return null;
  const idx = match.index;
  const docPart = trimmed.slice(0, idx).trim();
  const chatPart = trimmed.slice(idx + match[0].length).trim() || BENCHMARK_CHAT_ACK;
  if (!docPart) return null;
  return { docPart, chatPart };
}

/** El modelo a veces devuelve solo un fragmento (### Módulos…) sin el `# Research Report` inicial. */
export function isPartialBenchmarkDoc(docPart: string, current?: string): boolean {
  const p = docPart.trim();
  const cur = (current ?? "").trim();
  if (!p || !cur) return false;
  return !/^#\s/m.test(p) && (/^#\s/m.test(cur) || cur.length > 800);
}

/**
 * Integra un fragmento parcial en el DBGA completo (conserva cabecera / metadata del panel).
 */
export function mergeBenchmarkPartialDoc(current: string, partial: string): string {
  const cur = current.trim();
  let par = partial.trim();
  if (!par) return cur;
  if (/^#\s/m.test(par)) return par;

  // El modelo a veces antepone "Etapa: …" al fragmento; no debe sobrescribir la cabecera del panel.
  if (/^Etapa:\s*/im.test(par) && /###\s+Módulos del proyecto/im.test(par)) {
    par = par.replace(/^Etapa:\s*[^\n]+\n+/im, "").trim();
  }

  const anchors = [
    /^###\s+Módulos del proyecto/im,
    /^##\s+Dos objetivos centrales/im,
    /^##\s+Arquitectura/im,
    /^#\s+Research Report/im,
    /^#\s+Domain Benchmark/im,
  ] as const;

  for (const anchor of anchors) {
    const parMatch = par.match(anchor);
    if (!parMatch || parMatch.index == null) continue;
    const curIdx = cur.search(anchor);
    if (curIdx >= 0) {
      return `${cur.slice(0, curIdx).trimEnd()}\n\n${par.slice(parMatch.index).trim()}`.trim();
    }
  }

  const headEnd = cur.search(/\n(?:##|###)\s+/);
  if (headEnd > 0) {
    return `${cur.slice(0, headEnd).trimEnd()}\n\n${par}`.trim();
  }
  return `${cur}\n\n---\n\n${par}`.trim();
}

/** Rechaza persistir un DBGA que borra la mayor parte del documento actual (p. ej. fragmento sin merge). */
export function wouldShrinkDbgaDangerously(
  current: string,
  next: string,
  minRatio = 0.55,
): boolean {
  const c = current.trim();
  const n = next.trim();
  if (!c || c.length < 400) return false;
  if (!n) return true;
  if (n.length >= c.length * minRatio) return false;
  // Reemplazo completo legítimo (nuevo doc largo con H1)
  if (/^#\s/m.test(n) && n.length >= Math.min(c.length * 0.85, 2500)) return false;
  return true;
}
