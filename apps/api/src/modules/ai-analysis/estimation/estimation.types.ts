/**
 * Interfaz de referencia para evaluar completitud del MDD (Semáforo).
 * El EstimationService compara el documento contra estas secciones.
 */
export interface MDDReference {
  /** Modelo de datos / entidades */
  db?: boolean;
  /** Contratos de API / endpoints */
  endpoints?: boolean;
  /** Seguridad */
  security?: boolean;
  /** Integración / Infraestructura */
  infra?: boolean;
}

/** Contexto parcial del MDD (markdown o secciones detectadas) para cálculo en vivo. */
export type MDDContext = string | { mddContent?: string; infraContent?: string };

/**
 * Gaps críticos generados por el Auditor (LLM). Textos en español.
 * Sustituye al reporte por regex cuando el Auditor ya ha evaluado el MDD.
 */
export interface AuditorCriticalGap {
  /** Secciones afectadas (ej. "Sección 3", "Sección 6"). */
  sections: string[];
  /** Descripción del problema en español. */
  issue: string;
  /** Acción concreta para corregir (ej. "Añadir tabla mfa_methods con user_id y secret_key"). */
  fix: string;
}

export interface AuditorGaps {
  /** Puntuación 0-100 (coherente con auditorScore). */
  score: number;
  /** APROBADO si score >= 85 y sin gaps críticos bloqueantes; RECHAZADO en caso contrario. */
  status: "APROBADO" | "RECHAZADO";
  /** Gaps críticos de consistencia/trazabilidad (secciones, problema, corrección). */
  critical_gaps: AuditorCriticalGap[];
  /** Errores de sintaxis o formato (ej. Mermaid, JSON). */
  syntax_errors: string[];
  /** true si §7 Infraestructura refleja el stack de §2 (Docker/Node, etc.). */
  infrastructure_ready: boolean;
}

/** Contrato mínimo para que el Manager muestre la misma precisión que el semáforo. */
export interface LivePrecisionCalculator {
  calculateLiveMetrics(
    ctx: MDDContext,
    options?: {
      auditorGaps?: AuditorGaps;
      /** Si no viene, se usa caché por `projectId`+`stageId` cuando existan. */
      complexity?: EstimationComplexity;
      projectId?: string;
      stageId?: string | null;
    },
  ): LiveMetricsResult;
  /** Opcional: reporte de gaps en lenguaje natural. Si se pasan auditorGaps, se usan en lugar de regex. */
  getGapsReport?(md: string, auditorGaps?: AuditorGaps): string[];
}

export type SemaphoreStatusLive = "red" | "yellow" | "green";

/** Alineado con `Project.complexity` (Prisma). Goberna relajación del desglose en vivo y prompts MDD. */
export type EstimationComplexity = "LOW" | "MEDIUM" | "HIGH";

/** Estado por sección: inconsistente cuando la entidad no recorre las 7 secciones (matriz de trazabilidad). */
export type SectionStatus = "ok" | "inconsistente";

/** Calificación por sección/agente (0–100) para mostrar en la tabla del chat tras auditar. */
export interface PrecisionBreakdown {
  contexto: number;
  modeloDatos: number;
  apiContracts: number;
  frontend: number;
  seguridad: number;
  integracion: number;
  /** Si una sección está en "Estado Inconsistente" por trazabilidad, aparece aquí. */
  sectionStatus?: Partial<Record<"contexto" | "modeloDatos" | "apiContracts" | "seguridad" | "integracion", SectionStatus>>;
  /** Motivo de la calificación por sección (por qué se obtuvo ese %). */
  sectionReasons?: Partial<Record<"contexto" | "modeloDatos" | "apiContracts" | "frontend" | "seguridad" | "integracion", string>>;
}

/** Salida exacta para la UI: Semáforo + Estimación (nómina interna y precio mercado). */
export interface LiveMetricsResult {
  precision: number;
  /** Nómina interna ponderada (Σ horas rol × tarifa rol × riskFactor). */
  totalMXN: number;
  /** Referencia mercado (horas × tarifa mercado × riskFactor). */
  totalMXNMarket: number;
  totalHours: number;
  /** Personas por rol (conteo). */
  roles: Record<string, number>;
  /** Horas por rol (reparto delivery). */
  rolesHours: Record<string, number>;
  status: SemaphoreStatusLive;
  /** Pistas breves para preparar documentos y mejorar efectividad con IA (OpenRouter / cascadas). */
  readinessHints: string[];
}

/** Tasa interna (Costo Empresa 2026): $21k netos × 1.4 carga social ÷ 160 h/mes ≈ $29,400/mes → $185 MXN/hr. */
export const BASE_SALARY_NET_MONTH = 21_000;
export const SOCIAL_LOAD_FACTOR = 1.4;
export const HOURS_PER_MONTH = 160;
export const INTERNAL_HOUR_RATE = 185;

/** Tarifa hora a precio de mercado (consultoría / venta), MXN/hr. */
export const MARKET_HOUR_RATE = 1_050;

/**
 * Umbrales de precisión del semáforo:
 * - Rojo: < 50% — Solo ideas generales. El costo es una "suposición".
 * - Amarillo: 50%–94% — Arquitectura definida pero faltan contratos de API o Docker.
 * - Verde: 95%+ — Solo si además hay DB/entidades, Endpoints con payloads y Seguridad con decisiones documentadas (agnóstico de dominio).
 */
export const PRECISION_RED_MAX = 50;
export const PRECISION_GREEN_MIN = 95;

/** Factor de riesgo dinámico: < 70% → 1.25; ≥ 95% → 1.0. */
export const RISK_FACTOR_LOW_PRECISION = 1.25;
export const RISK_PRECISION_THRESHOLD = 70;
