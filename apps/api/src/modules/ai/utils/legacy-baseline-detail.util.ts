/**
 * Etapa 1 legacy (AS-IS): entregables y prompts con MDD/contexto completos — sin resúmenes ni omisiones.
 */

/** Apéndice inyectado en user/system prompts cuando `legacyBaselineStage === true`. */
export const LEGACY_BASELINE_DETAIL_PROMPT_APPENDIX =
  "\n\n**Modo etapa 1 AS-IS (documentación exhaustiva del sistema existente):**\n" +
  "- **PROHIBIDO** resumir u omitir con «N adicionales», «etc.», «véase MDD», «otros servicios…» o listas por comas.\n" +
  "- Cada entidad (§3), endpoint (§4) y servicio/flujo (§5) del MDD debe reflejarse **nominalmente** en el entregable cuando aplique.\n" +
  "- Documenta el inventario **completo** del sistema tal como existe hoy; no es un delta de cambio ni un MVP pendiente.\n" +
  "- Prefiere tablas, listas y subsecciones explícitas antes que prosa condensada.\n";

export function isLegacyBaselineFullDetailEnabled(): boolean {
  const v = process.env.LEGACY_BASELINE_FULL_DETAIL?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  return !["0", "false", "off", "no"].includes(v);
}

/** Presupuesto MDD para entregables en etapa 1. `0`/`full`/`unlimited` = sin truncar. */
export function readLegacyBaselineMddDeliverableBudget(): number {
  if (!isLegacyBaselineFullDetailEnabled()) {
    return 50_000;
  }
  const raw = process.env.LEGACY_BASELINE_MDD_DELIVERABLE_BUDGET?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "full" || raw === "unlimited") {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/** Tope texto auxiliar (blueprint/spec/…) en etapa 1; default sin recorte práctico. */
export function readLegacyBaselineAuxTextCap(standardCap: number): number {
  if (!isLegacyBaselineFullDetailEnabled()) return standardCap;
  const raw = process.env.LEGACY_BASELINE_AUX_TEXT_MAX_CHARS?.trim();
  if (!raw || raw === "0" || raw === "full") return Number.MAX_SAFE_INTEGER;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > standardCap ? n : Number.MAX_SAFE_INTEGER;
}

export function capTextForLegacyBaseline(
  text: string,
  standardCap: number,
  legacyBaselineStage?: boolean,
): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";
  if (!legacyBaselineStage || !isLegacyBaselineFullDetailEnabled()) {
    return trimmed.slice(0, standardCap);
  }
  return trimmed.slice(0, readLegacyBaselineAuxTextCap(standardCap));
}

export function appendLegacyBaselineDetailPrompt(
  prompt: string,
  legacyBaselineStage?: boolean,
): string {
  if (!legacyBaselineStage || !isLegacyBaselineFullDetailEnabled()) return prompt;
  return prompt + LEGACY_BASELINE_DETAIL_PROMPT_APPENDIX;
}

/** Tope codebaseDoc en cascada reverse-engineering (solo `codebaseDoc`, sin MDD). */
export function readLegacyBaselineReverseEngineeringMaxChars(standardCap: number): number {
  if (!isLegacyBaselineFullDetailEnabled()) return standardCap;
  const raw = process.env.LEGACY_BASELINE_REVERSE_ENGINEERING_MAX_CHARS?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "full" || raw === "unlimited") {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

/** Apéndice BRD etapa 1: inventario de negocio sin agrupaciones vagas. */
export const LEGACY_BASELINE_BRD_DETAIL_APPENDIX =
  "\n\n**Modo etapa 1 AS-IS — BRD de negocio exhaustivo:**\n" +
  "- Cada **entidad** y **servicio/proceso** del documento fuente → al menos una viñeta o subsección ### en §3 Capacidades o §5 Reglas/UAT.\n" +
  "- **PROHIBIDO** resumir dominios en párrafos genéricos («gestión comercial», «otros módulos», «N capacidades adicionales»).\n" +
  "- Si hay inventario previo, el BRD debe cubrir **todos** sus ítems (checklist obligatorio).\n" +
  "- Traduce a lenguaje corporativo; **no** copies endpoints, tablas SQL ni rutas `/api`.\n";

/** Tope `codebaseDoc` en prompt BRD legacy etapa 1 (`full` = sin truncar head/tail). */
export function readLegacyBaselineBrdCodebaseDocMaxChars(standardCap: number): number {
  if (!isLegacyBaselineFullDetailEnabled()) return standardCap;
  const raw = process.env.LEGACY_BASELINE_BRD_CODEBASE_DOC_MAX_CHARS?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "full" || raw === "unlimited") {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > standardCap ? n : Number.MAX_SAFE_INTEGER;
}

/** Filas máx. en `### Rutas de evidencia` al compactar doc para BRD etapa 1. */
export function readLegacyBaselineBrdEvidencePathCap(standardCap: number): number {
  if (!isLegacyBaselineFullDetailEnabled()) return standardCap;
  const raw = process.env.LEGACY_BASELINE_BRD_EVIDENCE_PATHS?.trim();
  if (!raw || raw === "0" || raw === "full") return Number.MAX_SAFE_INTEGER;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > standardCap ? n : standardCap;
}

/** Tras inventario previo: cuánto del doc de partida se re-inyecta al prompt BRD. */
export function readLegacyBaselineBrdInventoryRefMaxChars(standardCap: number): number {
  if (!isLegacyBaselineFullDetailEnabled()) return standardCap;
  const raw = process.env.LEGACY_BASELINE_BRD_INVENTORY_REF_MAX_CHARS?.trim().toLowerCase();
  if (!raw || raw === "0" || raw === "full" || raw === "unlimited") {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > standardCap ? n : Number.MAX_SAFE_INTEGER;
}

export function appendLegacyBaselineBrdDetailPrompt(
  prompt: string,
  legacyBaselineStage?: boolean,
): string {
  if (!legacyBaselineStage || !isLegacyBaselineFullDetailEnabled()) return prompt;
  return prompt + LEGACY_BASELINE_DETAIL_PROMPT_APPENDIX + LEGACY_BASELINE_BRD_DETAIL_APPENDIX;
}
