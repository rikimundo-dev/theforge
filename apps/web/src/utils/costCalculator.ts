/**
 * Orquestación de estimación para el Workshop: parseo de MDD + delegación a `@theforge/business-rules`.
 */

import {
  computeCostEstimation,
  getDefaultTeamStructure,
  KNOWN_METADATA_TAGS,
  parseInfraFixedHours,
  RATES_MXN_PER_ROLE,
  type Status,
  type TeamStructure,
} from "@theforge/business-rules";

export type { Status, TeamStructure };

/** Alias histórico: tarifas por rol (referencia / vista de equipo). */
export const RATES_MXN: Record<string, number> = { ...RATES_MXN_PER_ROLE };

export interface CostResult {
  totalHours: number;
  /** Nómina ponderada por rol (post-buffer en `computeCostEstimation`). */
  totalMxn: number;
  /** Referencia venta horas × tarifa única (sin desglose por rol). */
  referenceSaleMxn: number;
  teamStructure: TeamStructure;
  rolesHours: Record<string, number>;
}

export type SemaphoreStatus = Status;

function extractTechnicalMetadataTags(mddContent: string | null): string[] {
  if (!mddContent?.trim()) return [];
  const content = mddContent.trim();
  const blockMatch = content.match(
    /(?:```\s*TechnicalMetadata|###\s*TechnicalMetadata|TechnicalMetadata\s*:?\s*)\s*([\s\S]*?)(?:```|$)/i,
  );
  const search = (blockMatch?.[1] ?? content) as string;
  const tags: string[] = [];
  const tagRegex = /\[\s*([a-z0-9_]+)\s*]/gi;
  const known = new Set<string>(KNOWN_METADATA_TAGS);
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(search)) !== null) {
    const tag = (m[1] ?? "").toLowerCase();
    if (known.has(tag) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Parsea mddContent (JSON o markdown) para extraer entidades, pantallas y endpoints extra.
 */
export function parseMddCounts(mddContent: string | null): {
  entityCount: number;
  screenCount: number;
  extraEndpointCount: number;
} {
  if (!mddContent?.trim()) return { entityCount: 0, screenCount: 0, extraEndpointCount: 0 };
  try {
    const json = JSON.parse(mddContent) as {
      db_entities?: unknown[];
      screens?: unknown[];
      pantallas?: unknown[];
      extra_endpoints?: number;
    };
    const entityCount = json.db_entities?.length ?? 0;
    const screenCount = json.screens?.length ?? json.pantallas?.length ?? 0;
    const extraEndpointCount = typeof json.extra_endpoints === "number" ? json.extra_endpoints : 0;
    return { entityCount, screenCount, extraEndpointCount };
  } catch {
    return parseMarkdownMddCounts(mddContent);
  }
}

function parseMarkdownMddCounts(md: string): {
  entityCount: number;
  screenCount: number;
  extraEndpointCount: number;
} {
  const lines = md.split(/\r?\n/);
  const entities = new Set<string>();
  let extraEndpointCount = 0;
  let inDataModel = false;
  let inApi = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^#+\s*(\d\.)?\s*modelo de datos/i.test(line) || /^#+\s*3\./i.test(line) || lower.includes("modelo de datos")) {
      inDataModel = true;
      inApi = false;
      continue;
    }
    if (/^#+\s*(\d\.)?\s*contratos de api/i.test(line) || /^#+\s*4\./i.test(line) || lower.includes("contratos de api") || lower.includes("endpoints")) {
      inDataModel = false;
      inApi = true;
      continue;
    }
    if (inDataModel) {
      const m = line.match(/\*\*([A-Za-z][A-Za-z0-9_]*)\*\*\s*[:(]|^-\s*\*\*([A-Za-z][A-Za-z0-9_]*)\*\*|^([A-Za-z][A-Za-z0-9_]*)\s*\(/);
      if (m) {
        const name = (m[1] ?? m[2] ?? m[3])?.trim();
        if (name) entities.add(name);
      }
    }
    if (inApi && (/\/api\/|\/auth\//.test(line) || /\b(POST|GET|PUT|DELETE|PATCH)\b/.test(line))) {
      extraEndpointCount += 1;
    }
  }

  const entityCount = entities.size;
  const inferredScreensFromApi =
    extraEndpointCount > 0 ? Math.min(28, Math.max(4, Math.ceil(extraEndpointCount * 0.55))) : 0;
  const screenCount =
    extraEndpointCount > 0
      ? inferredScreensFromApi
      : entityCount > 0
        ? Math.min(entityCount * 2, 20)
        : 0;
  return { entityCount, screenCount, extraEndpointCount };
}

/**
 * Calcula la estimación final a partir del MDD (y opcionalmente infra y semáforo).
 */
export function calculateCostFromMdd(
  mddContent: string | null,
  options?: { status?: SemaphoreStatus; infraContent?: string | null },
): CostResult {
  const { entityCount, screenCount, extraEndpointCount } = parseMddCounts(mddContent);
  const metadataTags = extractTechnicalMetadataTags(mddContent);
  const infraFixedHours = parseInfraFixedHours(options?.infraContent ?? null);
  const status = options?.status ?? "ROJO";

  const { totalHours, totalMxn, referenceSaleMxn, teamStructure, rolesHours } = computeCostEstimation({
    entityCount,
    screenCount,
    extraEndpointCount,
    metadataTags,
    infraFixedHours,
    status,
  });

  return {
    totalHours,
    totalMxn,
    referenceSaleMxn,
    teamStructure,
    rolesHours,
  };
}

export { getDefaultTeamStructure };
