import json2md from "json2md";
import type { MddStructured } from "../state/mdd-structured.schema.js";
import { erDiagramToSql, normalizeErDiagramForMermaid, sqlToErDiagramContent } from "../utils/mdd-diagram-suggestions.js";
import { normalizeContratosTableSummary } from "../utils/mdd-sanitize.js";

/** Solo espacios ASCII (0x20). Nunca &nbsp; ni espacios Unicode en bloques de código. */
function normalizeCodeBlockToAsciiSpaces(s: string): string {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function countCreateTables(sql: string): number {
  return (sql.match(/CREATE\s+TABLE/gi) || []).length;
}

type Json2mdNode = Record<string, unknown>;

const DEFAULT_TITLE = "Master Design Document";
const PENDIENTE = "(Pendiente)";

/**
 * Convierte MddStructured a array de nodos json2md.
 * Orden canónico: 1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, 4. Contratos de API,
 * 5. Lógica y Edge Cases, 6. Seguridad, 7. Infraestructura.
 */
function structuredToJson2mdNodes(mdd: MddStructured): Json2mdNode[] {
  const nodes: Json2mdNode[] = [];
  const title = mdd.title?.trim() || DEFAULT_TITLE;
  nodes.push({ h1: title });
  nodes.push({ p: "" });

  // 1. Contexto
  nodes.push({ h2: "1. Contexto" });
  nodes.push({ p: "" });
  if (mdd.contextoAlcance?.trim()) {
    nodes.push({ p: mdd.contextoAlcance.trim() });
  } else {
    nodes.push({ p: PENDIENTE });
  }
  nodes.push({ p: "" });

  // 2. Arquitectura y Stack
  nodes.push({ h2: "2. Arquitectura y Stack" });
  nodes.push({ p: "" });
  let section2Content = mdd.arquitecturaStack?.trim() || mdd.arquitecturaFrontend?.trim();
  if (section2Content) {
    section2Content = section2Content.replace(/^##\s+4\.\s*Arquitectura\s+Frontend\b[^\n]*/gi, "### Arquitectura Frontend");
    section2Content = section2Content.replace(/^\s*####\s+4\.(\d+)(\.?)(\s|$)/gim, (_, n, dot, rest) => `### 2.${n}${dot}${rest}`);
    section2Content = section2Content.replace(/^\s*###\s+4\.(\d+)(\.?)(\s|$)/gim, (_, n, dot, rest) => `### 2.${n}${dot}${rest}`);
    section2Content = section2Content.replace(/^\s*4\.(\d+)\./gm, "2.$1.");
  }
  if (section2Content) {
    nodes.push({ p: section2Content });
  } else {
    nodes.push({ p: PENDIENTE });
  }
  nodes.push({ p: "" });

  // 3. Modelo de Datos (diagrama como fuente de verdad: si el diagrama tiene más tablas que el SQL, mostramos SQL derivado del diagrama)
  nodes.push({ h2: "3. Modelo de Datos" });
  nodes.push({ p: "" });
  const sqlRaw = mdd.modeloDatos?.sql?.trim();
  const diagramaRaw = mdd.modeloDatos?.diagramaEr?.trim();
  let diagramaNormalized = diagramaRaw
    ? normalizeErDiagramForMermaid(
        diagramaRaw.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t"),
      )
    : "";
  if (!diagramaNormalized && sqlRaw && /CREATE\s+TABLE/i.test(sqlRaw)) {
    const fromSql = sqlToErDiagramContent(sqlRaw);
    if (fromSql) diagramaNormalized = fromSql;
  }
  const sqlFromDiagram = diagramaNormalized ? erDiagramToSql(diagramaNormalized) : null;
  const useDiagramSql =
    sqlFromDiagram &&
    diagramaRaw &&
    countCreateTables(sqlFromDiagram) > countCreateTables(sqlRaw ?? "");
  const content = useDiagramSql ? sqlFromDiagram! : (sqlRaw ?? "");
  const hasSection3 = content || diagramaNormalized;
  if (hasSection3) {
    if (content) {
      nodes.push({ code: { language: "sql", content: normalizeCodeBlockToAsciiSpaces(content).split("\n") } });
      nodes.push({ p: "" });
    }
    const metaLines =
      mdd.modeloDatos?.technicalMetadata?.length ? mdd.modeloDatos.technicalMetadata : ["[high_security]"];
    nodes.push({ code: { language: "TechnicalMetadata", content: metaLines } });
    nodes.push({ p: "" });
    if (diagramaNormalized) {
      nodes.push({ h3: "Diagrama entidad-relación" });
      nodes.push({ p: "" });
      nodes.push({ code: { language: "mermaid", content: normalizeCodeBlockToAsciiSpaces(diagramaNormalized).split("\n") } });
      nodes.push({ p: "" });
    }
  } else {
    nodes.push({ p: PENDIENTE });
    nodes.push({ p: "" });
  }

  // 4. Contratos de API
  nodes.push({ h2: "4. Contratos de API" });
  nodes.push({ p: "" });
  if (mdd.contratosApi?.summary?.trim()) {
    const summary = normalizeContratosTableSummary(mdd.contratosApi.summary.trim());
    nodes.push({ p: summary });
    nodes.push({ p: "" });
  }
  if (mdd.contratosApi?.endpoints?.length) {
    for (const ep of mdd.contratosApi.endpoints) {
      nodes.push({ h3: `${ep.method} ${ep.path}` });
      nodes.push({ p: "" });
      if (ep.description?.trim()) nodes.push({ p: ep.description.trim() });
      if (ep.requestBody?.trim()) {
        nodes.push({ p: "**Request body:**" });
        nodes.push({ code: { language: "json", content: normalizeCodeBlockToAsciiSpaces(ep.requestBody.trim()).split("\n") } });
        nodes.push({ p: "" });
      }
      if (ep.responses && Object.keys(ep.responses).length) {
        for (const [code, body] of Object.entries(ep.responses)) {
          nodes.push({ p: `**Response ${code}:**` });
          nodes.push({ code: { language: "json", content: normalizeCodeBlockToAsciiSpaces(body).split("\n") } });
          nodes.push({ p: "" });
        }
      }
    }
  } else if (!mdd.contratosApi?.summary?.trim()) {
    nodes.push({ p: PENDIENTE });
    nodes.push({ p: "" });
  }

  // 5. Lógica y Edge Cases
  nodes.push({ h2: "5. Lógica y Edge Cases" });
  nodes.push({ p: "" });
  if (mdd.logicaEdgeCases?.trim()) {
    nodes.push({ p: mdd.logicaEdgeCases.trim() });
  } else {
    nodes.push({ p: PENDIENTE });
  }
  nodes.push({ p: "" });

  // 6. Seguridad
  nodes.push({ h2: "6. Seguridad" });
  nodes.push({ p: "" });
  if (mdd.seguridad?.length) {
    for (const item of mdd.seguridad) {
      nodes.push({ h3: item.title });
      nodes.push({ p: "" });
      if (item.content?.length) {
        nodes.push({ ul: item.content });
        nodes.push({ p: "" });
      }
    }
  } else {
    nodes.push({ p: PENDIENTE });
    nodes.push({ p: "" });
  }

  // 7. Infraestructura
  nodes.push({ h2: "7. Infraestructura" });
  nodes.push({ p: "" });
  if (mdd.integracion) {
    const subsections =
      Array.isArray(mdd.integracion)
        ? mdd.integracion
        : mdd.integracion.subsections ?? [];
    const lastSubHasManifest =
      subsections.length > 0 &&
      /Manifest/i.test(String(subsections[subsections.length - 1]?.title ?? ""));
    if (subsections.length) {
      for (const sub of subsections) {
        nodes.push({ h3: sub.title });
        nodes.push({ p: "" });
        if (Array.isArray(sub.content) && sub.content.length) {
          nodes.push({ ul: sub.content });
        }
        nodes.push({ p: "" });
      }
    }
    if (!Array.isArray(mdd.integracion) && mdd.integracion.manifest) {
      if (!lastSubHasManifest) {
        nodes.push({ h3: "Manifest de Infraestructura" });
        nodes.push({ p: "" });
      }
      nodes.push({
        code: {
          language: "json",
          content: JSON.stringify(mdd.integracion.manifest, null, 2).split("\n"),
        },
      });
      nodes.push({ p: "" });
    }
  } else {
    nodes.push({ p: PENDIENTE });
    nodes.push({ p: "" });
  }

  // Custom sections
  if (mdd.customSections?.length) {
    for (const sec of mdd.customSections) {
      nodes.push({ h2: sec.heading });
      nodes.push({ p: "" });
      nodes.push({ p: sec.body.trim() });
      nodes.push({ p: "" });
    }
  }

  return nodes;
}

/**
 * Genera markdown a partir del documento MDD estructurado.
 * Única fuente de markdown desde el objeto; usada por Formatter y puntos de salida.
 */
export function mddStructuredToMarkdown(mdd: MddStructured): string {
  if (!mdd || typeof mdd !== "object") {
    return `${DEFAULT_TITLE}\n\n${PENDIENTE}\n`;
  }
  const nodes = structuredToJson2mdNodes(mdd);
  const raw = json2md(nodes);
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
