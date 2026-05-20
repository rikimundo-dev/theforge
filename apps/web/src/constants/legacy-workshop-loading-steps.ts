/**
 * Textos rotativos (cada ~6s) mientras corre la generación legacy en segundo plano.
 * Compartidos entre WorkshopView (panel central) y ChatContainer (columna chat).
 */
export const LEGACY_CODEBASE_DOC_STEPS = [
  "Orchestrator MDD (evidence_first) — Ariadne ingest…",
  "Agente de descubrimiento — consultando AriadneSpecs…",
  "Agente de análisis — modelos, rutas y arquitectura…",
  "Agente redactor — ensamblando documentación de partida…",
];

export const LEGACY_MDD_STEPS = [
  "Agente de contexto — consultando AriadneSpecs…",
  "Agente redactor — generando borrador del MDD…",
  "Agente revisor — revisando el documento…",
];

export const LEGACY_BRD_SUGGEST_STEPS = [
  "Leyendo documentación de partida (Ariadne)…",
  "Redactando borrador BRD…",
];

/** Greenfield: mismo ritmo de UX que legacy BRD. */
export const BRD_FROM_DBGA_STEPS = [
  "Leyendo Domain Benchmark (DBGA)…",
  "Redactando borrador BRD…",
];

export const LEGACY_DELIVERABLES_STEPS = [
  "Agente SPEC…",
  "Agente arquitectura…",
  "Agente casos de uso e historias…",
  "Agente blueprint y design system…",
  "Agente contratos API, flujos e infra…",
  "Agente tasks…",
];
