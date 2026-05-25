/**
 * DBGA en Fase 0: a veces el modelo concatena el MDD del proyecto al final del Research Report.
 */

const MDD_EMBED_MARKERS: RegExp[] = [
  /\n\s*\[Contenido actual del MDD[^\n]*\n/i,
  /\n\s*Master Design Document\s*[—–-]\s/m,
  /\n\s*#\s*Master Design Document\b/m,
  /\n1\.\s*Contexto y Alcance\s*\n\s*1\.1\s+Propósito/im,
];

export function splitEmbeddedMddFromDbga(text: string): {
  dbgaBody: string;
  embeddedMdd: string | null;
} {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { dbgaBody: "", embeddedMdd: null };

  let earliest = -1;
  for (const re of MDD_EMBED_MARKERS) {
    const m = trimmed.match(re);
    if (m?.index != null && m.index >= 0 && (earliest < 0 || m.index < earliest)) {
      earliest = m.index;
    }
  }
  if (earliest < 0) return { dbgaBody: trimmed, embeddedMdd: null };

  const dbgaBody = trimmed.slice(0, earliest).trim();
  const embeddedMdd = trimmed.slice(earliest).trim();
  return { dbgaBody, embeddedMdd: embeddedMdd.length > 0 ? embeddedMdd : null };
}
