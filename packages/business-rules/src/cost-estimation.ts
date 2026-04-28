import type { Status, TeamStructure } from "@theforge/shared-types";
import {
  allocateDeliveryRoleHours,
  buildDeliveryTeamStructure,
  payrollMxnFromRoleHours,
} from "./team-delivery.js";

/** Horas base por entidad de dominio (MDD §3). */
export const HOURS_PER_ENTITY = 12;
/** Horas base por pantalla. */
export const HOURS_PER_SCREEN = 16;
/** Horas por endpoint fuera del conteo estándar. */
export const HOURS_PER_ENDPOINT = 4;
/** Tarifa única aplicada a las horas totales del estimador Workshop (MXN/h). */
export const RATE_MXN_PER_HOUR = 1050;
/** Buffer de incertidumbre si el semáforo no es VERDE. */
export const BUFFER_FACTOR_WHEN_NOT_VERDE = 1.25;

/** Multiplicadores por etiqueta TechnicalMetadata (producto). */
export const METADATA_MULTIPLIERS: Readonly<Record<string, number>> = {
  high_security: 1.25,
  external_api: 1.2,
  multi_tenant: 1.3,
  real_time: 1.15,
};

/** Horas fijas por etiqueta TechnicalMetadata (suma). */
export const METADATA_FIXED_HOURS: Readonly<Record<string, number>> = {
  cicd_pipeline: 8,
  advanced_monitoring: 10,
};

/** Tags reconocidos en MDD / TechnicalMetadata (para parsers de UI). */
export const KNOWN_METADATA_TAGS = [
  "high_security",
  "external_api",
  "multi_tenant",
  "real_time",
  "cicd_pipeline",
  "advanced_monitoring",
] as const;

export type KnownMetadataTag = (typeof KNOWN_METADATA_TAGS)[number];

/**
 * Tarifas hora por rol (referencia mercado / desglose; el total del estimador principal usa {@link RATE_MXN_PER_HOUR}).
 */
export const RATES_MXN_PER_ROLE: Readonly<Record<string, number>> = {
  architect: 1500,
  techLead: 1400,
  pm: 920,
  security: 1280,
  back: 950,
  front: 850,
  ux: 780,
  qa: 680,
  devops: 1120,
};

export interface CostEstimationInput {
  entityCount: number;
  screenCount: number;
  extraEndpointCount: number;
  metadataTags: string[];
  infraFixedHours: number;
  status: Status;
}

export interface CostEstimationResult {
  totalHours: number;
  /** Nómina interna ponderada (Σ horas rol × tarifa rol), post-buffer si aplica. */
  totalMxn: number;
  /** Referencia venta simplificada: horas × {@link RATE_MXN_PER_HOUR} (misma base que “precio mercado” del Workshop). */
  referenceSaleMxn: number;
  teamStructure: TeamStructure;
  /** Horas asignadas por rol (suma ≈ totalHours). */
  rolesHours: Record<string, number>;
}

export function getDefaultTeamStructure(
  entityCount: number,
  screenCount: number,
  extraEndpointCount = 0,
  metadataTags: readonly string[] = [],
): TeamStructure {
  return buildDeliveryTeamStructure(entityCount, screenCount, extraEndpointCount, metadataTags);
}

/**
 * Estimación final (sin IA):
 * Base = Entidades×12 + Pantallas×16 + Endpoints extra×4.
 * Horas = Base × multiplicadores(TechnicalMetadata) + horas fijas(metadata) + infraFixedHours.
 * Si semáforo ≠ VERDE: Horas × buffer.
 * Nómina interna = Σ (horas_rol × tarifa_rol) con reparto {@link allocateDeliveryRoleHours}.
 * `referenceSaleMxn` = horas × {@link RATE_MXN_PER_HOUR} (referencia mercado / tarifa única).
 */
export function computeCostEstimation(input: CostEstimationInput): CostEstimationResult {
  const {
    entityCount,
    screenCount,
    extraEndpointCount,
    metadataTags,
    infraFixedHours,
    status,
  } = input;

  const baseHours =
    entityCount * HOURS_PER_ENTITY +
    screenCount * HOURS_PER_SCREEN +
    extraEndpointCount * HOURS_PER_ENDPOINT;

  let multiplier = 1;
  for (const tag of metadataTags) {
    const m = METADATA_MULTIPLIERS[tag];
    if (m != null) multiplier *= m;
  }

  let fixedHours = infraFixedHours;
  for (const tag of metadataTags) {
    const h = METADATA_FIXED_HOURS[tag];
    if (h != null) fixedHours += h;
  }

  let totalHours = baseHours * multiplier + fixedHours;
  if (status !== "VERDE") {
    totalHours *= BUFFER_FACTOR_WHEN_NOT_VERDE;
  }

  const referenceSaleMxn = Math.round(totalHours * RATE_MXN_PER_HOUR * 100) / 100;
  const teamStructure = getDefaultTeamStructure(
    entityCount,
    screenCount,
    extraEndpointCount,
    metadataTags,
  );
  const rolesHours = allocateDeliveryRoleHours(totalHours, teamStructure);
  const payrollRaw = payrollMxnFromRoleHours(rolesHours, RATES_MXN_PER_ROLE);
  const totalMxn = Math.round(payrollRaw * 100) / 100;

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalMxn,
    referenceSaleMxn,
    teamStructure,
    rolesHours,
  };
}
