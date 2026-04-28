import type { TeamStructure } from "@theforge/shared-types";

/**
 * Esfuerzo relativo por FTE y rol (se normaliza a `totalHours` en {@link allocateDeliveryRoleHours}).
 * Refleja reparto típico SDD: PM/Tech lead arquitectónico, implementación, calidad, plataforma.
 */
const EFFORT_WEIGHT: Readonly<Record<string, number>> = {
  architect: 0.11,
  techLead: 0.08,
  pm: 0.1,
  security: 0.07,
  back: 0.26,
  front: 0.2,
  ux: 0.09,
  qa: 0.07,
  devops: 0.07,
};

/** Etiquetas cortas para UI (Workshop). */
export const ROLE_LABELS_ES: Readonly<Record<string, string>> = {
  architect: "Arquitectura",
  techLead: "Tech lead",
  pm: "Producto / PM",
  security: "AppSec",
  back: "Backend",
  front: "Frontend",
  ux: "UX/UI",
  qa: "QA",
  devops: "DevOps",
};

function n(v: number): number {
  return Math.max(0, Math.floor(v));
}

/**
 * Headcount sugerido por alcance MDD (entidades, pantallas, endpoints) y tags de TechnicalMetadata.
 * No sustituye planificación real; orienta coste y staffing en el Workshop.
 */
export function buildDeliveryTeamStructure(
  entityCount: number,
  screenCount: number,
  extraEndpointCount: number,
  metadataTags: readonly string[] = [],
): TeamStructure {
  const tags = new Set(metadataTags.map((t) => String(t).toLowerCase()));
  const ec = Math.max(0, entityCount);
  const sc = Math.max(0, screenCount);
  const ep = Math.max(0, extraEndpointCount);
  const work = ec + sc + ep;

  const empty: TeamStructure = {
    architect: 0,
    techLead: 0,
    pm: 0,
    security: 0,
    back: 0,
    front: 0,
    ux: 0,
    qa: 0,
    devops: 0,
  };
  if (work === 0) return empty;

  const architect = ec >= 16 ? 2 : 1;
  const back = Math.max(1, 1 + n(ec / 8) + (ep >= 28 ? 1 : 0));
  const front = Math.max(1, 1 + n(sc / 10) + (sc === 0 && ec > 0 ? 1 : 0));
  const ux = sc <= 0 ? 0 : sc >= 22 ? 2 : 1;

  const pm = work >= 8 ? 1 : 0;
  const techLead = work >= 14 || ec >= 12 ? 1 : 0;
  const qa = Math.max(1, 1 + n((sc + ep) / 18));
  const devops =
    tags.has("cicd_pipeline") || tags.has("advanced_monitoring")
      ? Math.max(1, 1 + n(ep / 26))
      : ep > 22
        ? 1
        : 0;
  const security =
    tags.has("high_security") || tags.has("multi_tenant") ? 1 : ec >= 10 ? 1 : ec >= 6 ? 1 : 0;

  return { architect, techLead, pm, security, back, front, ux, qa, devops };
}

/**
 * Reparte `totalHours` entre roles según headcount y peso de esfuerzo.
 */
export function allocateDeliveryRoleHours(totalHours: number, team: TeamStructure): Record<string, number> {
  if (totalHours <= 0) return {};

  const t = team as Record<string, number | undefined>;
  let weighted = 0;
  for (const k of Object.keys(EFFORT_WEIGHT)) {
    const c = Number(t[k] ?? 0) || 0;
    if (c > 0) weighted += EFFORT_WEIGHT[k]! * c;
  }
  if (weighted <= 0) return {};

  const out: Record<string, number> = {};
  for (const k of Object.keys(EFFORT_WEIGHT)) {
    const c = Number(t[k] ?? 0) || 0;
    if (c > 0) {
      out[k] = Math.round((10000 * totalHours * (EFFORT_WEIGHT[k]! * c)) / weighted) / 10000;
    }
  }
  return out;
}

/** Nómina interna (MXN) = Σ horas_rol × tarifa_rol. */
export function payrollMxnFromRoleHours(
  roleHours: Record<string, number>,
  rates: Readonly<Record<string, number>>,
): number {
  let s = 0;
  for (const [role, h] of Object.entries(roleHours)) {
    const rate = rates[role] ?? 0;
    s += h * rate;
  }
  return Math.round(s * 100) / 100;
}
