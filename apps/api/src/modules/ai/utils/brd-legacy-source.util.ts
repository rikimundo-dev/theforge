import { compactCodebaseDocForMddPrompt } from "../../theforge/legacy-mdd-v1-markdown.util.js";
import { sanitizeSourceDocForBrdPrompt, truncateSourceDocForBrdPrompt } from "./dbga-prompt-context.util.js";

/** Tope del codebaseDoc en prompt BRD legacy (post-compactación). Default mayor que DBGA greenfield. */
export const LEGACY_BRD_CODEBASE_DOC_PROMPT_MAX_CHARS = intEnv(
  "LEGACY_BRD_CODEBASE_DOC_PROMPT_MAX_CHARS",
  120_000,
  20_000,
  250_000,
);

/** Si el doc supera este umbral tras compactar, se ejecuta inventario previo (2 pasadas). */
export const LEGACY_BRD_INVENTORY_THRESHOLD_CHARS = intEnv(
  "LEGACY_BRD_INVENTORY_THRESHOLD_CHARS",
  28_000,
  8_000,
  200_000,
);

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function countEntityTableRows(doc: string): number {
  const section = doc.match(/###\s+Entidades y modelo de datos[\s\S]*?(?=\n###\s|\n##\s|$)/i);
  if (!section?.[0]) return 0;
  let count = 0;
  for (const line of section[0].split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(t)) continue;
    if (/^\|\s*Entidad\s*\|/i.test(t)) continue;
    count++;
  }
  return count;
}

function countBusinessLogicRows(doc: string): number {
  const section = doc.match(/###\s+Lógica de negocio[\s\S]*?(?=\n###\s|\n##\s|$)/i);
  if (!section?.[0]) return 0;
  let count = 0;
  for (const line of section[0].split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*[-:]+\s*\|/.test(t)) continue;
    if (/^\|\s*Servicio\s*\|/i.test(t)) continue;
    count++;
  }
  return count;
}

export type LegacyBrdSourcePrep = {
  text: string;
  truncated: boolean;
  needsInventoryPass: boolean;
  entityCount: number;
  serviceCount: number;
};

/**
 * Prepara codebaseDoc para BRD legacy: compacta evidence_paths masivos y trunca con cabeza/cola
 * solo si aún supera el tope (prioriza secciones estructuradas al inicio del doc).
 */
export function prepareLegacyCodebaseDocForBrdPrompt(codebaseDoc: string): LegacyBrdSourcePrep {
  const sanitized = sanitizeSourceDocForBrdPrompt(codebaseDoc);
  const maxChars = LEGACY_BRD_CODEBASE_DOC_PROMPT_MAX_CHARS;
  const compacted = compactCodebaseDocForMddPrompt(sanitized, maxChars);
  const { text, truncated } = truncateSourceDocForBrdPrompt(compacted, maxChars);
  const entityCount = countEntityTableRows(sanitized);
  const serviceCount = countBusinessLogicRows(sanitized);
  const needsInventoryPass =
    truncated ||
    text.length >= LEGACY_BRD_INVENTORY_THRESHOLD_CHARS ||
    entityCount >= 18 ||
    serviceCount >= 12;

  return { text, truncated, needsInventoryPass, entityCount, serviceCount };
}

export const BRD_BUSINESS_INVENTORY_SYSTEM =
  "Eres analista de negocio senior. Extraes inventarios exhaustivos en español desde documentación técnica de sistemas legacy. " +
  "Traduce a lenguaje corporativo. Prohibido HTTP, rutas API, JSON, SQL y nombres de tablas.";

/** Prompt fase 1: inventario de negocio antes del BRD completo (sistemas grandes). */
export function buildLegacyBrdBusinessInventoryPrompt(sourceDocument: string): string {
  return (
    "Del **documento de partida** siguiente, extrae un **inventario de negocio exhaustivo** (no resumas ni agrupes en categorías vagas).\n\n" +
    "**Reglas:**\n" +
    "- Una viñeta por **entidad** listada en tablas de modelo de datos (nombre comercial, no técnico).\n" +
    "- Una viñeta por **servicio/proceso** de lógica de negocio documentado.\n" +
    "- Una viñeta por **capacidad API** inferible (descrita como proceso, no como endpoint).\n" +
    "- Si hay varios repositorios (`## Repositorio:`), consolida sin duplicar.\n" +
    "- **Prohibido** omitir ítems por brevedad; si hay 40 entidades, lista 40 capacidades relacionadas.\n\n" +
    "**Formato de salida (markdown puro, sin delimitadores):**\n\n" +
    "## Inventario de capacidades de negocio\n" +
    "(viñetas `-`)\n\n" +
    "## Entidades de negocio\n" +
    "(viñetas `-`)\n\n" +
    "## Procesos y reglas operativas\n" +
    "(viñetas `-`)\n\n" +
    "--- DOCUMENTO ---\n\n" +
    sourceDocument
  );
}
