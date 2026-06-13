/**
 * Detección de contenido Phase 0 en `phase0SummaryContent` / `dbgaContent`.
 * El borrador estructurado (entrevista/auditoría) es JSON con `proposito`;
 * Deep Research en Benchmark es markdown.
 */

export function isPhase0BorradorJson(raw: string | null | undefined): boolean {
  const t = raw?.trim() ?? "";
  if (!t.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    return !!parsed.proposito && typeof parsed.proposito === "object";
  } catch {
    return false;
  }
}

/** Solo reemplazar `phase0SummaryContent` con JSON de borrador si no hay Deep Research guardado. */
export function shouldReplacePhase0SummaryWithBorrador(
  existing: string | null | undefined,
): boolean {
  const t = existing?.trim() ?? "";
  if (!t) return true;
  return isPhase0BorradorJson(t);
}
