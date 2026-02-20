/**
 * Parsea un MDD en markdown (generado por la IA) a una estructura JSON mínima
 * para que el semáforo y el cost calculator puedan evaluar y estimar.
 * El semáforo espera JSON con db_entities, business_core, edge_cases, field_types.
 */

export interface ParsedMdd {
  db_entities: { name?: string }[];
  screens?: unknown[];
  /** Endpoints de API detectados en sección Contratos de API (para base 4h cada uno). */
  extra_endpoints?: number;
  business_core: string | null;
  edge_cases?: string;
  field_types?: string;
}

export function parseMarkdownMdd(md: string | null): ParsedMdd {
  const empty: ParsedMdd = {
    db_entities: [],
    business_core: null,
    edge_cases: "",
    field_types: "",
    extra_endpoints: 0,
  };
  if (!md?.trim()) return empty;

  const content = md.trim();
  const lines = content.split(/\r?\n/);

  const entities: string[] = [];
  let inDataModel = false;
  let inApi = false;
  const apiOrScreens: { path: string }[] = [];
  let hasBusinessLogic = false;
  let hasEdgeCases = false;
  let hasFieldTypes = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    const isHeaderLine = line.startsWith("#");

    if (
      isHeaderLine && (
        /modelo de datos/i.test(line) ||
        /\b3\./i.test(line) ||
        lower.includes("modelo de datos") ||
        lower.includes("data model")
      )
    ) {
      inDataModel = true;
      inApi = false;
      continue;
    }
    if (
      isHeaderLine && (
        /contratos de api/i.test(line) ||
        /\b4\./i.test(line) ||
        lower.includes("contratos de api") ||
        lower.includes("api contracts") ||
        lower.includes("endpoints")
      )
    ) {
      inDataModel = false;
      inApi = true;
      continue;
    }
    if (isHeaderLine && (/^#+\s*(\d\.)?\s*(lógica|negocio|logic)/i.test(line) || lower.includes("lógica de negocio") || lower.includes("business logic"))) {
      hasBusinessLogic = true;
    }
    if (lower.includes("edge cases") || lower.includes("casos límite") || lower.includes("manejo de errores") || lower.includes("error handling")) {
      hasEdgeCases = true;
    }
    if (inDataModel && (lower.includes("uuid") || lower.includes("string") || lower.includes("integer") || lower.includes("varchar") || /\*\*[^*]+\*\*:/.test(line) || lower.includes("primary key"))) {
      hasFieldTypes = true;
    }

    if (inDataModel) {
      // Detección de entidades: **Entity**, CREATE TABLE Entity, o Entity (
      const entityMatch = line.match(/\*\*([A-Za-z][A-Za-z0-9_]*)\*\*(?:\s*\([^)]*\))?\s*[:]?|^-\s*\*\*([A-Za-z][A-Za-z0-9_]*)\*\*|(?:\bcreate\s+table\s+)(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/i);
      if (entityMatch) {
        const name = (entityMatch[1] ?? entityMatch[2] ?? entityMatch[3])?.trim();
        if (name && !entities.includes(name)) entities.push(name);
      }
      // Detección de nodos/relaciones Cypher (para FalkorDB/Grafos)
      const graphMatch = line.match(/(?:\((?:[a-z0-9_]+)?\s*:\s*([A-Z][A-Za-z0-9_]*)\s*\))|(?:\s*:\s*([A-Z][A-Za-z0-9_]*)\b)/);
      if (graphMatch) {
        const name = (graphMatch[1] ?? graphMatch[2])?.trim();
        if (name && !entities.includes(name)) entities.push(name);
      }
    }
    if (inApi) {
      // Detección de endpoints: /api/..., /auth/..., métodos HTTP aislados en tablas, o rutas entre backticks
      const hasMethod = /\b(POST|GET|PUT|DELETE|PATCH)\b/.test(line);
      const hasPath = /(\/[\w/{}-]+)/.test(line);
      if (hasMethod && hasPath) {
        apiOrScreens.push({ path: line.trim() });
      }
    }
  }

  const hasSubstance = content.length > 400;
  const hasSections =
    /#+\s*[12]\.|contexto|arquitectura|modelo de datos|contratos de api|lógica de negocio|seguridad/i.test(content);

  let db_entities = entities.slice(0, 30).map((name) => ({ name }));
  if (db_entities.length === 0 && hasSubstance && hasSections) {
    db_entities = [{ name: "Documento" }];
  }

  const extra_endpoints = apiOrScreens.length;
  const screens =
    extra_endpoints > 0 ? [] : (db_entities.length > 0 ? Array(Math.min(db_entities.length * 2, 20)).fill({}) : []);

  const hasEntities = db_entities.length > 0;
  const business_core = hasBusinessLogic || (hasEntities && hasSubstance) ? "inferred from markdown" : null;
  const edge_cases = hasEdgeCases || (hasEntities && hasSubstance) ? "inferred" : "";
  const field_types = hasFieldTypes || (hasEntities && hasSubstance) ? "inferred" : "";

  return {
    db_entities,
    screens,
    extra_endpoints,
    business_core,
    edge_cases,
    field_types,
  };
}

/**
 * Normaliza mddContent: si es JSON válido lo parsea; si no, parsea desde markdown.
 * Devuelve un objeto listo para semaphore + cost calculator.
 */
export function normalizeMddContent(mddContent: string | null): ParsedMdd & { screens?: unknown[] } {
  if (!mddContent?.trim()) {
    return {
      db_entities: [],
      business_core: null,
      edge_cases: "",
      field_types: "",
      extra_endpoints: 0,
    };
  }
  try {
    const json = JSON.parse(mddContent) as unknown;
    const parsed = json as Record<string, unknown>;
    const screens = Array.isArray(parsed.screens)
      ? parsed.screens
      : Array.isArray((parsed as { pantallas?: unknown[] }).pantallas)
        ? (parsed as { pantallas: unknown[] }).pantallas
        : [];
    return {
      db_entities: Array.isArray(parsed.db_entities) ? parsed.db_entities : [],
      screens,
      extra_endpoints: typeof parsed.extra_endpoints === "number" ? parsed.extra_endpoints : 0,
      business_core: parsed.business_core != null ? String(parsed.business_core) : null,
      edge_cases: parsed.edge_cases != null ? String(parsed.edge_cases) : "",
      field_types: parsed.field_types != null ? String(parsed.field_types) : "",
    };
  } catch {
    return parseMarkdownMdd(mddContent);
  }
}

/** Etiquetas conocidas del bloque TechnicalMetadata en el MDD (master-prompt). */
const KNOWN_METADATA_TAGS = [
  "high_security",
  "external_api",
  "multi_tenant",
  "real_time",
  "cicd_pipeline",
  "advanced_monitoring",
] as const;

/**
 * Extrae etiquetas [tag] del bloque TechnicalMetadata en el MDD (markdown).
 * Busca bloque ```TechnicalMetadata o ### TechnicalMetadata y tags entre corchetes.
 */
export function extractTechnicalMetadataTags(mddContent: string | null): string[] {
  if (!mddContent?.trim()) return [];
  const content = mddContent.trim();
  const blockMatch = content.match(
    /(?:```\s*TechnicalMetadata|###\s*TechnicalMetadata|TechnicalMetadata\s*:?\s*)\s*([\s\S]*?)(?:```|$)/i,
  );
  const search = blockMatch ? blockMatch[1] : content;
  const tags: string[] = [];
  const tagRegex = /\[\s*([a-z0-9_]+)\s*]/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRegex.exec(search)) !== null) {
    const tag = m[1].toLowerCase();
    if (KNOWN_METADATA_TAGS.includes(tag as (typeof KNOWN_METADATA_TAGS)[number]) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}
