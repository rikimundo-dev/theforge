import { indexOfMatchingJsonObjectEnd } from "./theforge-raw-evidence-markdown.js";

const MDD_EVIDENCE_JSON_KEYS = [
  "summary",
  "openapi_spec",
  "entities",
  "api_contracts",
  "business_logic",
  "infrastructure",
  "risk_report",
  "evidence_paths",
] as const;

const MDD_EVIDENCE_SECTION_TITLE: Record<(typeof MDD_EVIDENCE_JSON_KEYS)[number], string> = {
  summary: "Resumen",
  openapi_spec: "OpenAPI / especificación",
  entities: "Entidades y modelo de datos",
  api_contracts: "Contratos API",
  business_logic: "Lógica de negocio",
  infrastructure: "Infraestructura",
  risk_report: "Riesgos",
  evidence_paths: "Rutas de evidencia",
};

const LEGACY_MDD_ENVELOPE_HEAD_RE = /\{\s*"format"\s*:\s*"legacy_mdd_v1"/g;

function legacyMddEvidenceSampleLimit(envKey: string, fallback: number): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function legacyMddEvidencePathsSampleLimit(): number {
  return legacyMddEvidenceSampleLimit("LEGACY_MDD_EVIDENCE_PATHS_SAMPLE", 80);
}

function legacyMddTableRowSampleLimit(): number {
  return legacyMddEvidenceSampleLimit("LEGACY_MDD_TABLE_ROW_SAMPLE", 250);
}

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mddEvidencePayloadHasContent(o: Record<string, unknown>): boolean {
  for (const k of MDD_EVIDENCE_JSON_KEYS) {
    const v = o[k];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim().length > 0) return true;
    if (Array.isArray(v) && v.length > 0) return true;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length > 0) return true;
  }
  return false;
}

function unwrapMddEvidenceJson(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;
  const nested = root.mddDocument;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    if (mddEvidencePayloadHasContent(n)) return n;
  }
  if (mddEvidencePayloadHasContent(root)) return root;
  return null;
}

/** Extrae el primer objeto JSON de un texto MCP (ignora bloques ```cypher``` posteriores). */
export function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  const end = indexOfMatchingJsonObjectEnd(trimmed, 0);
  if (end < 0) return null;
  return trimmed.slice(0, end + 1);
}

/** Parsea envelope `legacy_mdd_v1` o JSON MDD plano desde texto de herramienta MCP. */
export function extractLegacyMddEvidencePayload(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const jsonStr = extractFirstJsonObject(trimmed) ?? trimmed;
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const root = parsed as Record<string, unknown>;
    if (root.format === "legacy_mdd_v1") {
      const fromDoc = unwrapMddEvidenceJson(root.mddDocument);
      if (fromDoc) return fromDoc;
      if (typeof root.answer === "string" && root.answer.trim()) {
        try {
          const inner = JSON.parse(root.answer.trim()) as unknown;
          const payload = unwrapMddEvidenceJson(inner);
          if (payload) return payload;
        } catch {
          /* answer no es JSON MDD */
        }
      }
    }
    return unwrapMddEvidenceJson(parsed);
  } catch {
    return null;
  }
}

function formatEntitiesTable(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const limit = legacyMddTableRowSampleLimit();
  const sample = rows.slice(0, limit);
  const lines = [
    "| Entidad | Origen | Atributos (muestra) |",
    "| --- | --- | --- |",
  ];
  for (const row of sample) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "—";
    const source = typeof o.source === "string" ? o.source : "—";
    const fields = Array.isArray(o.fields)
      ? o.fields.map((f) => String(f)).slice(0, 8).join("; ")
      : "";
    lines.push(`| ${escapeMdCell(name)} | ${escapeMdCell(source)} | ${escapeMdCell(fields || "—")} |`);
  }
  if (rows.length > limit) {
    lines.push("", `_${rows.length - limit} entidad(es) más no mostradas._`);
  }
  return lines.join("\n");
}

function formatApiContractsTable(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const limit = legacyMddTableRowSampleLimit();
  const sample = rows.slice(0, limit);
  const lines = [
    "| Ruta | Métodos | Fuente |",
    "| --- | --- | --- |",
  ];
  for (const row of sample) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const route = typeof o.route === "string" ? o.route : "—";
    const methods = Array.isArray(o.methods) ? o.methods.map((m) => String(m)).join(", ") : "—";
    const docSource = typeof o.doc_source === "string" ? o.doc_source : "—";
    lines.push(
      `| ${escapeMdCell(route)} | ${escapeMdCell(methods)} | ${escapeMdCell(docSource)} |`,
    );
  }
  if (rows.length > limit) {
    lines.push("", `_${rows.length - limit} ruta(s) más no mostradas._`);
  }
  return lines.join("\n");
}

function formatBusinessLogicTable(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const limit = legacyMddTableRowSampleLimit();
  const sample = rows.slice(0, limit);
  const lines = [
    "| Servicio | Dependencias (paths) |",
    "| --- | --- |",
  ];
  for (const row of sample) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const service = typeof o.service === "string" ? o.service : "—";
    const deps = Array.isArray(o.dependencies)
      ? o.dependencies.map((d) => String(d)).slice(0, 4).join(", ")
      : "—";
    lines.push(`| ${escapeMdCell(service)} | ${escapeMdCell(deps)} |`);
  }
  if (rows.length > limit) {
    lines.push("", `_${rows.length - limit} servicio(s) más no mostrados._`);
  }
  return lines.join("\n");
}

function formatEvidencePathsList(paths: unknown): string {
  if (!Array.isArray(paths) || paths.length === 0) return "";
  const limit = legacyMddEvidencePathsSampleLimit();
  const sample = paths.slice(0, limit);
  const bullets = sample
    .map((x) => {
      const s = String(x).trim();
      return s ? `- \`${s.replace(/`/g, "\\`")}\`` : "";
    })
    .filter(Boolean)
    .join("\n");
  if (paths.length > limit) {
    return `${bullets}\n\n_${paths.length - limit} ruta(s) de evidencia adicional(es) omitida(s) (total: ${paths.length})._`;
  }
  return bullets;
}

function emptySectionPlaceholder(key: (typeof MDD_EVIDENCE_JSON_KEYS)[number]): string {
  if (key === "entities") {
    return "_Sin entidades en grafo (Model / StrapiContentType / frontend Models). Ejecuta sync + reindex del repo y regenera doc. partida._";
  }
  if (key === "api_contracts") {
    return "_Sin contratos API indexados (OpenApiOperation / StrapiRoute / apiDirection frontend / NestController). Revisa sync Strapi o export OpenAPI._";
  }
  if (key === "business_logic") {
    return "_Sin servicios Nest/Strapi/frontend (src/api) indexados en grafo para este alcance._";
  }
  return "";
}

function formatOpenApiSpecSection(v: unknown): string {
  if (v === undefined || v === null || typeof v !== "object" || Array.isArray(v)) {
    return emptySectionPlaceholder("openapi_spec");
  }
  const o = v as Record<string, unknown>;
  const metadata: Record<string, unknown> = { ...o };
  delete metadata.supplementary_docs;

  const parts: string[] = ["```json", JSON.stringify(metadata, null, 2), "```"];

  const docs = o.supplementary_docs;
  if (Array.isArray(docs) && docs.length > 0) {
    parts.push("", "#### Documentación complementaria", "");
    for (const doc of docs) {
      if (!doc || typeof doc !== "object") continue;
      const d = doc as Record<string, unknown>;
      const path = typeof d.path === "string" ? d.path : "—";
      parts.push(`##### \`${path.replace(/`/g, "\\`")}\``, "");
      if (d.truncated === true && typeof d.total_chars === "number") {
        parts.push(
          `_Extracto del archivo indexado (${d.total_chars} caracteres; muestra recortada en MDD)._`,
          "",
        );
      }
      const excerpt = typeof d.excerpt === "string" ? d.excerpt.trim() : "";
      parts.push(excerpt || "_Sin contenido legible en índice para esta ruta._", "");
    }
  } else if (Array.isArray(o.supplementary_doc_paths) && o.supplementary_doc_paths.length > 0) {
    parts.push(
      "",
      "#### Documentación complementaria",
      "",
      "_Rutas detectadas sin extracto en este MDD — regenera doc. partida con Ariadne actualizado:_",
      "",
    );
    for (const p of o.supplementary_doc_paths) {
      parts.push(`- \`${String(p).replace(/`/g, "\\`")}\``);
    }
  }

  return parts.join("\n");
}

function formatMddEvidenceSectionValue(key: (typeof MDD_EVIDENCE_JSON_KEYS)[number], v: unknown): string {
  if (v === undefined || v === null) return emptySectionPlaceholder(key);
  if (typeof v === "string") return v.trim() || emptySectionPlaceholder(key);
  if (key === "openapi_spec") return formatOpenApiSpecSection(v);
  if (key === "entities") {
    if (Array.isArray(v) && v.length === 0) return emptySectionPlaceholder(key);
    return formatEntitiesTable(v);
  }
  if (key === "api_contracts") {
    if (Array.isArray(v) && v.length === 0) return emptySectionPlaceholder(key);
    return formatApiContractsTable(v);
  }
  if (key === "business_logic") {
    if (Array.isArray(v) && v.length === 0) return emptySectionPlaceholder(key);
    return formatBusinessLogicTable(v);
  }
  if (key === "evidence_paths") return formatEvidencePathsList(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return emptySectionPlaceholder(key);
    return v.map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n");
  }
  return "```json\n" + JSON.stringify(v, null, 2).slice(0, 16000) + "\n```";
}

/** Convierte payload MDD (7 claves) a markdown legible para Legacy Analyzer / prompts. */
export function formatLegacyMddEvidenceToMarkdown(payload: Record<string, unknown>): string {
  const parts: string[] = ["## Evidencia (MDD estructurado — ingest)\n"];
  for (const key of MDD_EVIDENCE_JSON_KEYS) {
    const body = formatMddEvidenceSectionValue(key, payload[key]);
    parts.push(`### ${MDD_EVIDENCE_SECTION_TITLE[key]}\n\n${body}`);
  }
  return parts.join("\n\n").trim();
}

/** Normaliza texto MCP (envelope o JSON plano) a markdown MDD; si no reconoce, devuelve el original. */
export function normalizeLegacyMddToolText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const payload = extractLegacyMddEvidencePayload(trimmed);
  if (payload) return formatLegacyMddEvidenceToMarkdown(payload);
  return trimmed;
}

/**
 * Reemplaza bloques JSON `{ "format": "legacy_mdd_v1", ... }` embebidos en markdown
 * (p. ej. multi-repo sin normalizar) por markdown legible. Idempotente si ya está formateado.
 */
export function normalizeLegacyMddV1JsonBlocksInMarkdown(md: string): string {
  if (!md.includes("legacy_mdd_v1")) return md;
  const re = new RegExp(LEGACY_MDD_ENVELOPE_HEAD_RE.source, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const start = m.index;
    const end = indexOfMatchingJsonObjectEnd(md, start);
    if (end < 0) {
      out += md.slice(last);
      last = md.length;
      break;
    }
    out += md.slice(last, start);
    const slice = md.slice(start, end + 1);
    const normalized = normalizeLegacyMddToolText(slice);
    out += normalized.startsWith("## Evidencia") ? normalized : slice;
    last = end + 1;
    re.lastIndex = last;
  }
  out += md.slice(last);
  return out;
}

function legacyMddCodebaseDocPromptMaxChars(): number {
  const raw = process.env.LEGACY_MDD_CODEBASE_DOC_PROMPT_MAX_CHARS?.trim();
  if (!raw) return 120_000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}

function legacyMddCodebaseDocPromptPathCap(): number {
  const raw = process.env.LEGACY_MDD_CODEBASE_DOC_PROMPT_PATHS?.trim();
  if (!raw) return 150;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 150;
}

/**
 * Compacta `codebaseDoc` para prompts LLM: preserva secciones estructuradas (entidades, API, resumen)
 * y recorta solo el volcado masivo de `### Rutas de evidencia`.
 */
export function compactCodebaseDocForMddPrompt(md: string, maxChars?: number): string {
  const limit = maxChars ?? legacyMddCodebaseDocPromptMaxChars();
  const pathCap = legacyMddCodebaseDocPromptPathCap();
  const sectionRe =
    /(### Rutas de evidencia\n\n)([\s\S]*?)(?=\n### |\n---\n|\n## Repositorio:|$)/g;
  let compact = md.replace(sectionRe, (_match, head: string, body: string) => {
    const lines = body.split("\n").filter((l: string) => l.startsWith("- "));
    if (lines.length <= pathCap) return head + body;
    const kept = lines.slice(0, pathCap).join("\n");
    const omitted = lines.length - pathCap;
    const note = omitted > 0 ? `\n\n_${omitted} rutas omitidas en prompt (total sección: ${lines.length})._` : "";
    return `${head}${kept}${note}`;
  });
  if (compact.length <= limit) return compact;
  return (
    compact.slice(0, limit) +
    "\n\n> *[codebaseDoc truncado para prompt; secciones estructuradas priorizadas. Regenera doc. partida si faltan entidades/API.]*"
  );
}
