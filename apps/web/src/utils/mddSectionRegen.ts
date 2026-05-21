/** Alineado con `REGENERATE_SECTION_N_PATTERN` en `mdd-manager.node.ts` (backend). */
const REGENERATE_SECTION_N_PATTERN =
  /\b(?:regenera(?:r)?|rehacer|actualiza(?:r)?|genera(?:r)?\s+de\s+nuevo)\s+(?:solo\s+)?(?:la\s+)?(?:secci[oó]n|paso)\s*([1-7])\b/i;

export const MDD_SECTION_COMMANDS = [
  { slug: "contexto", label: "1. Contexto", section: 1 },
  { slug: "arquitectura", label: "2. Arquitectura y Stack", section: 2 },
  { slug: "modelo-datos", label: "3. Modelo de Datos", section: 3 },
  { slug: "contratos-api", label: "4. Contratos de API", section: 4 },
  { slug: "logica", label: "5. Lógica y Edge Cases", section: 5 },
  { slug: "seguridad", label: "6. Seguridad", section: 6 },
  { slug: "infraestructura", label: "7. Infraestructura", section: 7 },
] as const;

export function getRegenerateSectionFromSlashCommand(msg: string): number | null {
  const t = msg.trim().toLowerCase();
  if (!t.startsWith("/") || t.includes(" ")) return null;
  const slug = t.slice(1);
  if (!slug) return null;
  const cmd = MDD_SECTION_COMMANDS.find((c) => c.slug === slug || String(c.section) === slug);
  return cmd?.section ?? null;
}

/** Lenguaje natural: «regenera la sección 6», «rehacer paso 3», etc. (no exige fin de línea). */
export function detectNaturalRegenerateSection(msg: string): number | null {
  const m = msg.trim().match(REGENERATE_SECTION_N_PATTERN);
  if (!m) return null;
  const section = parseInt(m[1]!, 10);
  return section >= 1 && section <= 7 ? section : null;
}

export function resolveRegenerateSectionFromChatMessage(msg: string): number | null {
  return getRegenerateSectionFromSlashCommand(msg) ?? detectNaturalRegenerateSection(msg);
}
