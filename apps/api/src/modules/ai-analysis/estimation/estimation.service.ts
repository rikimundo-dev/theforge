import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { pickPrimaryStage } from "../../projects/stage-helpers.js";
import type {
  AuditorGaps,
  EstimationComplexity,
  LiveMetricsResult,
  MDDContext,
  PlanningDocumentFields,
  PrecisionBreakdown,
  SemaphoreStatusLive,
} from "./estimation.types.js";
import {
  MARKET_HOUR_RATE,
  PRECISION_GREEN_MIN,
  PRECISION_RED_MAX,
  RISK_FACTOR_LOW_PRECISION,
  RISK_PRECISION_THRESHOLD,
  INTERNAL_HOUR_RATE,
  AI_TOKENS_PER_ENTITY,
  AI_TOKENS_PER_SCREEN,
  AI_TOKENS_PER_ENDPOINT,
  AI_BASE_OVERHEAD_TOKENS,
  AI_COST_PER_TOKEN_USD,
  MXN_PER_USD,
  COMPLETENESS_WEIGHT,
  CROSS_CONSISTENCY_WEIGHT,
  MDD_QUALITY_WEIGHT,
} from "./estimation.types.js";
import {
  allocateDeliveryRoleHours,
  buildDeliveryTeamStructure,
} from "@theforge/business-rules";
import { extractTechnicalMetadataTags } from "../../engine/mdd-markdown-parser.js";
import { computeDocumentCompleteness } from "./completeness.util.js";
import { computeCrossDocumentConsistency } from "./consistency.util.js";

/** Horas base por unidad (entidades, pantallas, endpoints) para derivar total. */
const HOURS_PER_ENTITY = 12;
const HOURS_PER_SCREEN = 16;
const HOURS_PER_ENDPOINT = 4;

/** Lookahead: siguiente ## (nivel 2) o fin del string. $(?!\n) evita que en modo "m" $ coincida con fin de línea. */
const SECTION_BOUNDARY = /(?=\n##\s|$(?!\n))/;

/** Extrae el cuerpo de la primera sección cuyo título coincide con pattern (hasta el siguiente ##). */
function extractSection(md: string, pattern: RegExp): string {
  const content = (md || "").trim();
  const m = content.match(pattern);
  if (!m) return "";
  const start = m.index ?? 0;
  const afterTitle = start + (m[0]?.length ?? 0);
  const rest = content.slice(afterTitle);
  const nextH2 = rest.match(/\n##\s/m);
  const end = nextH2 ? nextH2.index! + 1 : rest.length;
  return rest.slice(0, end).trim();
}

/** Normalize to snake_case for comparison. */
function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "")
    .replace(/-/g, "_");
}

/** Extract column names from SQL (CREATE TABLE ... ( col TYPE, ... )). */
function extractSqlColumnNames(sqlBlock: string): Set<string> {
  const set = new Set<string>();
  const createMatch = sqlBlock.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?\s*\(([\s\S]*?)\)\s*;/gi);
  for (const m of createMatch) {
    const body = m[2] ?? "";
    const tokens = body.split(/[\s,]+/);
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t && /^[a-z_][a-z0-9_]*$/i.test(t) && !/^(primary|key|references|constraint|unique|check|default|not|null|uuid|integer|varchar|text|boolean|timestamptz|timestamp|int|bigint|real|serial|on|delete|cascade|set|true|false|in|between|and|or|as|from|where|having|group|order|by|asc|desc|like|is|exists|any|all|some|off|a|pgp_sym_encrypt|jsonb|inet|jwt|bcrypt|nivel|cifrado|cost|soft)$/i.test(t)) {
        set.add(t.toLowerCase());
      }
    }
  }
  return set;
}

/** Extract top-level keys from ```json blocks in text. */
function extractJsonKeysFromSection(text: string): Set<string> {
  const set = new Set<string>();
  const jsonBlocks = text.matchAll(/```json\s*([\s\S]*?)```/gi);
  for (const m of jsonBlocks) {
    try {
      const parsed = JSON.parse(m[1]?.trim() ?? "{}") as Record<string, unknown>;
      for (const k of Object.keys(parsed)) set.add(toSnakeCase(k));
    } catch {
      // skip malformed JSON
    }
  }
  return set;
}

/** Extract entity and attribute names from ```mermaid erDiagram block. */
function extractMermaidEntityAndAttrNames(md: string): { entities: Set<string>; attributes: Set<string> } {
  const entities = new Set<string>();
  const attributes = new Set<string>();
  const m = md.match(/```mermaid\s*([\s\S]*?)```/i);
  const inner = m?.[1]?.trim() ?? "";
  if (!/erDiagram/i.test(inner)) return { entities, attributes };
  const lines = inner.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const entityMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\{\s*$/);
    if (entityMatch) {
      entities.add(entityMatch[1].toLowerCase());
      i++;
      while (i < lines.length && !/^\s*\}\s*$/.test(lines[i]!)) {
        const attrMatch = lines[i]!.match(/\s*(\w+)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        if (attrMatch && !/^(uuid|default|pk|fk|index|unique|key|null|not|set|check|primary|references)$/i.test(attrMatch[2])) attributes.add(attrMatch[2].toLowerCase());
        i++;
      }
      continue;
    }
  }
  return { entities, attributes };
}

/** Section keys used in sectionStatus (matriz de trazabilidad). */
const TRACEABILITY_SECTION_KEYS = [
  "contexto",
  "modeloDatos",
  "apiContracts",
  "seguridad",
] as const;

/** Trazabilidad: solo marca inconsistente cuando Contexto menciona un concepto que exige cadena §3→§4→§6 y el documento no tiene ninguno de los tres. No es obligatorio que todo lo mencionado recorra las 7 secciones. */
function computeTraceabilityGaps(md: string): {
  inconsistentSections: ReadonlyArray<(typeof TRACEABILITY_SECTION_KEYS)[number]>;
} {
  const inconsistentSections: Array<(typeof TRACEABILITY_SECTION_KEYS)[number]> = [];
  const contextBlock = extractSection(md, /^#+\s*(?:1\.\s*)?(?:contexto\s+y\s+alcance|contexto\b)/im).toLowerCase();
  const dataModelBlock = extractSection(md, /^#+\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im).toLowerCase();
  const apiBlock = extractSection(md, /^#+\s*(?:4\.\s*)?(?:contratos\s+de\s+api|api\s+contracts|endpoints)/im).toLowerCase();
  const securityBlock = extractSection(md, /^##\s+(?:\d+\.\s*)?(?:seguridad|security)/im).toLowerCase();
  const sqlBlock = (md.match(/```sql\s*([\s\S]*?)```/i)?.[1] ?? "") + dataModelBlock;

  const hasMfaInContext = /\b(mfa|totp|2fa|two[- ]?factor|segundo factor|google\s+authenticator)\b/i.test(contextBlock);
  if (hasMfaInContext) {
    const hasSecretTables =
      /\bmfa_secrets\b|\btotp_secret\b|\bmfa_secret\b|\botp_secret\b|create\s+table\s+\w*secret/i.test(sqlBlock);
    const hasVerifyEndpoint = /\/verify|\/totp|\/mfa|verify.*totp/i.test(apiBlock);
    const hasTotpInSecurity = /\b(totp|rfc\s*6238|algoritmo\s+totp|time-based)\b/i.test(securityBlock);
    const hasAnySupport = hasSecretTables || hasVerifyEndpoint || hasTotpInSecurity;
    if (!hasAnySupport) {
      inconsistentSections.push("contexto", "modeloDatos", "apiContracts", "seguridad");
    }
  }

  return {
    inconsistentSections: [...new Set(inconsistentSections)],
  };
}

/**
 * Contract gaps (fallback cuando no hay auditorGaps del LLM).
 * Alineado con Protocolo de auditoría: §2↔§7 (Infra), §3↔Mermaid (paridad), §4↔§3 (API), Lógica↔Seguridad.
 */
function computeContractGaps(md: string): {
  apiSchemaGap: number;
  mermaidParityGap: number;
  infraStackGap: number;
  securityEdgeCaseGap: number;
} {
  let apiSchemaGap = 0;
  let mermaidParityGap = 0;
  let infraStackGap = 0;
  let securityEdgeCaseGap = 0;

  const dataModelBlock = extractSection(md, /^#+\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im);
  const apiBlock = extractSection(md, /^#+\s*(?:4\.\s*)?(?:contratos\s+de\s+api|api\s+contracts|endpoints)/im);
  const archBlock = extractSection(md, /^#+\s*(?:2\.\s*)?(?:arquitectura\s+y\s+stack|arquitectura\b)/im).toLowerCase();
  const logicBlock = extractSection(md, /^#+\s*(?:5\.\s*)?(?:lógica\s+y\s+edge\s+cases|lógica\b|edge\s+cases)/im).toLowerCase();
  const securityBlock = extractSection(md, /^##\s+(?:\d+\.\s*)?(?:seguridad|security)/im).toLowerCase();
  const infraBlock = extractSection(md, /^#+\s*(?:7\.\s*)?(?:infraestructura|infra|integraci[oó]n)/im).toLowerCase();

  const sqlBlock = (md.match(/```sql\s*([\s\S]*?)```/i)?.[1] ?? "") + dataModelBlock;
  const sqlColumns = extractSqlColumnNames(sqlBlock);
  const sqlTableNames = new Set(
    [...md.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/gi)].map((x) => x[1].toLowerCase()),
  );

  const skipApiKeys = /^(id|created_at|updated_at|password|confirm_password|token|refresh_token|redirect_uri|scope|code|totp_code|payment|professional|client|user|data|meta|gateway|video_room)$/i;
  if (sqlColumns.size > 0 && apiBlock.length > 100) {
    const apiKeys = extractJsonKeysFromSection(apiBlock);
    for (const k of apiKeys) {
      if (k && !skipApiKeys.test(k) && !sqlColumns.has(k)) {
        const fromCamel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        const backToSnake = fromCamel.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (!sqlColumns.has(backToSnake)) {
          apiSchemaGap = 1;
          break;
        }
      }
    }
  }

  if (sqlTableNames.size > 0 && /```mermaid[\s\S]*?erDiagram/i.test(md)) {
    const { entities, attributes } = extractMermaidEntityAndAttrNames(md);
    for (const e of entities) {
      if (!sqlTableNames.has(e)) {
        mermaidParityGap = 1;
        break;
      }
    }
    if (mermaidParityGap === 0) {
      for (const a of attributes) {
        if (!sqlColumns.has(a)) {
          mermaidParityGap = 1;
          break;
        }
      }
    }
  }

  // Solo marcar gap si §2 tiene backend Node/NestJS y §7 no menciona Docker ni Node (evitar falsos positivos cuando ya se describió stack).
  if (/\b(nestjs|node\.?js|node\s)/i.test(archBlock) && archBlock.length > 50) {
    const infraReflectsNode =
      /\b(dockerfile|from\s+node|npm\s|pnpm\s|node\s|nodejs|docker\b|contenedor|imagen\s+node|backend\s+node)/i.test(infraBlock);
    if (!infraReflectsNode) infraStackGap = 1;
  }

  if (/\b(bloqueo\s+de\s+cuenta|lock\s+account|intentos\s+fallidos|failed\s+attempts|máximo\s+de\s+intentos|fallos?\b)/i.test(logicBlock)) {
    if (!/\d+\s*(intentos?|attempts?|fallos?)|intentos?\s*:\s*\d+|máximo\s+\d+|fallos?\s*:\s*\d+/i.test(securityBlock)) {
      securityEdgeCaseGap = 1;
    }
  }

  return { apiSchemaGap, mermaidParityGap, infraStackGap, securityEdgeCaseGap };
}

/**
 * Gaps de consistencia y completitud (agnóstico de dominio).
 * Alineado con "MDD Universal Audit Rules":
 * - Rule 1 Feature-Infrastructure: scopeDataGap (alcance → modelo/API).
 * - Rule 2 Data Integrity: dataIntegrityGap (UUID PKs, created_at/updated_at TIMESTAMPTZ). No se exige ON DELETE (borrado puede ser lógico).
 * - Rule 3 API-Schema: no auto-check 1:1 (defer to agents); opcional apiErrorCodes en sección API.
 * - Rule 4 Inheritance: missingManifest + TechnicalMetadata/base template en proyectos derivados.
 * - Rule 5 Architectural: patrones y diagramas = SQL/API no se validan aquí (defer to agents/review).
 * - Contract gaps: apiSchemaGap, mermaidParityGap, infraStackGap, securityEdgeCaseGap.
 */
function computeConsistencyGaps(md: string): {
  scopeDataGap: number;
  contradictionGap: number;
  securityCompletenessGap: number;
  missingManifest: number;
  dataIntegrityGap: number;
  apiSchemaGap: number;
  mermaidParityGap: number;
  infraStackGap: number;
  securityEdgeCaseGap: number;
} {
  const lower = (md || "").trim().toLowerCase();
  // Estructura canónica MDD: 1 Contexto, 2 Arquitectura y Stack, 3 Modelo de Datos, 4 Contratos de API, 5 Lógica y Edge Cases, 6 Seguridad, 7 Infraestructura
  const contextBlock = extractSection(
    md,
    /^#+\s*(?:1\.\s*)?(?:contexto\s+y\s+alcance|contexto\b)/im,
  ).toLowerCase();
  const dataModelBlock = extractSection(
    md,
    /^#+\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im,
  ).toLowerCase();
  const integrationBlock = extractSection(
    md,
    /^#+\s*(?:7\.\s*)?(?:infraestructura|infra|integraci[oó]n)/im,
  ).toLowerCase();
  const securityBlock = extractSection(
    md,
    /^##\s+(?:\d+\.\s*)?(?:seguridad|security)/im,
  ).toLowerCase();

  const apiBlock = extractSection(
    md,
    /^#+\s*(?:4\.\s*)?(?:contratos\s+de\s+api|api\s+contracts|endpoints)/im,
  ).toLowerCase();
  const sqlBlock =
    (md.match(/```sql\s*([\s\S]*?)```/i)?.[1] ?? "") +
    (dataModelBlock || lower);
  const tablesAndColumns = sqlBlock;

  const contractGaps = computeContractGaps(md);

  // --- Rule 1: Document–Model congruence (domain-agnostic) ---
  // Cualquier concepto que el documento describa y que exija persistencia debe tener reflejo en tablas/columnas.
  // Pares (documento menciona X → esquema debe contener Y). Cubren múltiples dominios (auth, catálogo, pedidos, etc.).
  const scopeText = [contextBlock, securityBlock, apiBlock].join(" ");
  const persistenceConceptPairs: Array<{ doc: RegExp; schema: RegExp }> = [
    { doc: /\b(credencial|password|contraseña|hash|login|autenticaci[oó]n|almacenamiento de credencial)\b/i, schema: /\b(password_hash|credential|hash|external_store|almac[eé]n|referencia)\b/i },
    { doc: /\b(mfa|totp|2fa|two[- ]?factor|segundo factor|secretos?|google\s+authenticator)\b/i, schema: /\bmfa_secrets\b|\btotp_secret\b|\bmfa_secret\b|\botp_secret\b|create\s+table\s+\w*secret/i },
    { doc: /\b(sesi[oó]n|session)s?\b/i, schema: /\b(session|sesion|sessions)\b/i },
    { doc: /\b(audit|auditoría|historial|history|log|registro)\b/i, schema: /\b(audit|history|log|created_at|updated_at)\b/i },
    { doc: /\b(roles?|rbac|permisos?|permiso)\b/i, schema: /\b(role|permission|rol|permiso)\b/i },
    { doc: /\b(pedido|order)s?\b/i, schema: /\b(order|pedido)\b/i },
    { doc: /\b(producto|product)s?\b/i, schema: /\b(product|producto)\b/i },
    { doc: /\b(catálogo|catalog)\b/i, schema: /\b(catalog|catálogo|category|product)\b/i },
    { doc: /\b(inventario|inventory|stock)\b/i, schema: /\b(inventory|inventario|stock)\b/i },
    { doc: /\b(pago|payment)\b/i, schema: /\b(payment|pago|transaction)\b/i },
    { doc: /\b(notificaci[oó]n|notification)\b/i, schema: /\b(notification|notificaci|alert)\b/i },
  ];
  let scopeDataGap = 0;
  for (const { doc: docRe, schema: schemaRe } of persistenceConceptPairs) {
    if (docRe.test(scopeText) && !schemaRe.test(tablesAndColumns)) {
      scopeDataGap = 1;
      break;
    }
  }

  let contradictionGap = 0;
  const negations = [
    { no: /no\s+(se\s+)?implementa(rá|rán|)\s+(oauth|oidc|saml|openid)/i, yes: /\b(oauth|oidc|saml|openid\s+connect)\b/i },
    { no: /no\s+habr[áa]\s+(oauth|oidc|saml)/i, yes: /\b(oauth|oidc|saml)\b/i },
    { no: /no\s+se\s+usar[áa]\s+(oauth|oidc|saml)/i, yes: /\b(oauth|oidc|saml)\b/i },
  ];
  for (const { no: noRe, yes: yesRe } of negations) {
    if (noRe.test(contextBlock) && yesRe.test(integrationBlock)) contradictionGap = 1;
  }

  let securityCompletenessGap = 0;
  const highSecurity = /\b(high_security|alta seguridad|seguridad crítica)\b/i.test(lower);
  const hasCredentials = /\b(credencial|password|contraseña|autenticaci[oó]n)\b/i.test(contextBlock) || /\b(credencial|password|autenticaci[oó]n)\b/i.test(securityBlock);
  // Solo exigir columnas de auditoría (ip/user_agent) cuando el doc marca alta seguridad explícita
  if (highSecurity) {
    const needsAudit = /\b(ip_address|user_agent|ip\b|user_agent)\b/i.test(tablesAndColumns);
    if (!needsAudit) securityCompletenessGap += 0.5;
  }
  if (hasCredentials) {
    const hasCredStorage = /\b(password_hash|credential|external_store|almac[eé]n\b|referencia)\b/i.test(tablesAndColumns);
    if (!hasCredStorage) securityCompletenessGap += 0.5;
  }
  securityCompletenessGap = Math.min(1, securityCompletenessGap);

  // --- Rule 2: Data Integrity & Scalability (UUID PKs, timestamps). No se penaliza ON DELETE: no todos los proyectos usan delete físico. ---
  let dataIntegrityGap = 0;
  const hasTables = /\bcreate\s+table\b/i.test(sqlBlock);
  if (hasTables) {
    const hasUuidPk =
      /(?:gen_random_uuid|uuid_generate_v4|default\s+gen_random_uuid)/i.test(sqlBlock) ||
      /\buuid\s+primary\s+key\b/i.test(sqlBlock) ||
      (/\buuid\b/i.test(sqlBlock) && /\bprimary\s+key\b/i.test(sqlBlock));
    const hasTimestamps = /(?:created_at|updated_at)/i.test(sqlBlock) && /timestamptz/i.test(sqlBlock);
    if (!hasUuidPk) dataIntegrityGap += 0.5;
    if (!hasTimestamps) dataIntegrityGap += 0.5;
  }
  dataIntegrityGap = Math.min(1, dataIntegrityGap);

  // --- Rule 4: Inheritance (Manifest / TechnicalMetadata / Base Template) ---
  let missingManifest = 0;
  const hasInfraSection = /\b(infraestructura|infra|despliegue|integraci[oó]n)\b/i.test(md) && (integrationBlock.length > 80 || /##\s*(?:7\.\s*)?(?:infra|integraci[oó]n)/i.test(md));
  const hasManifestJson = /```json\s*[\s\S]*?(?:manifest|infra|services|stack)[\s\S]*?```/i.test(md);
  const hasTechnicalMetadata = /technicalmetadata|technical\s+metadata|base\s+template|plantilla\s+base/i.test(lower);
  const isDerivedOrMicro = /\b(microservice|microservicio|derived|hereda|plantilla\s+base)\b/i.test(lower);
  if (hasInfraSection && !hasManifestJson && !hasTechnicalMetadata) {
    missingManifest = isDerivedOrMicro ? 0.5 : 0.25;
  }

  return {
    scopeDataGap,
    contradictionGap,
    securityCompletenessGap,
    missingManifest,
    dataIntegrityGap,
    ...contractGaps,
  };
}

/** Calificación máxima cuando la sección está en Estado Inconsistente (matriz de trazabilidad). */
const PRECISION_CAP_INCONSISTENTE = 40;

function isRelaxedComplexity(c: EstimationComplexity): boolean {
  return c === "LOW" || c === "MEDIUM";
}

/**
 * LOW/MEDIUM: no exigir en semáforo/desglose los mismos rigores que HIGH (credenciales/SQL, Dockerfile vs §2, edge security, manifest §7).
 * La matriz de entregables ya es más liviana; el auditor LLM sigue pudiendo marcar gaps narrativos.
 */
function adjustGapsForEstimationComplexity(
  gaps: ReturnType<typeof computeConsistencyGaps>,
  complexity: EstimationComplexity,
): ReturnType<typeof computeConsistencyGaps> {
  if (complexity === "HIGH") return gaps;
  const g = { ...gaps };
  if (isRelaxedComplexity(complexity)) {
    g.securityCompletenessGap = 0;
    g.infraStackGap = 0;
    g.securityEdgeCaseGap = 0;
  }
  if (complexity === "LOW") {
    g.missingManifest = 0;
  }
  return g;
}

/**
 * Desglose de precisión por sección/agente (0–100) para la tabla del chat.
 * Usa las mismas secciones y gaps que el semáforo; cada dimensión se penaliza según gaps que la afectan.
 * Si una sección está en traceabilityGaps.inconsistentSections, se capa a PRECISION_CAP_INCONSISTENTE.
 */
function computePrecisionBreakdown(md: string, complexity: EstimationComplexity = "HIGH"): PrecisionBreakdown {
  const sections = detectReferenceSections(md);
  const gaps = adjustGapsForEstimationComplexity(computeConsistencyGaps(md), complexity);
  const traceability = computeTraceabilityGaps(md);
  const inconsistentSet = new Set(traceability.inconsistentSections);
  const contextBlock = extractSection(md, /^#+\s*(?:1\.\s*)?(?:contexto\s+y\s+alcance|contexto\b)/im);
  // Frontend está dentro de §2 Arquitectura y Stack (subsección ### Frontend)
  const frontendBlock = extractSection(md, /^#+\s*(?:2\.\s*)?(?:arquitectura\s+y\s+stack|arquitectura\s+frontend|frontend)/im);

  const sectionStatus: PrecisionBreakdown["sectionStatus"] = {};
  if (inconsistentSet.size > 0) {
    for (const key of TRACEABILITY_SECTION_KEYS) {
      if (inconsistentSet.has(key)) sectionStatus[key] = "inconsistente";
    }
  }

  let contexto = Math.round(
    Math.max(0, Math.min(100, 100 - (gaps.contradictionGap ? 40 : 0) - (contextBlock.length < 80 ? 30 : 0))),
  );
  if (inconsistentSet.has("contexto")) contexto = Math.min(contexto, PRECISION_CAP_INCONSISTENTE);

  let modeloDatos = Math.round(
    Math.max(
      0,
      Math.min(100, sections.db * 100 - gaps.mermaidParityGap * 25),
    ),
  );
  if (inconsistentSet.has("modeloDatos")) modeloDatos = Math.min(modeloDatos, PRECISION_CAP_INCONSISTENTE);

  let apiContracts = Math.round(
    Math.max(
      0,
      Math.min(100, sections.endpoints * 100 - (sections.endpointsWithPayloads ? 0 : 25)),
    ),
  );
  if (inconsistentSet.has("apiContracts")) apiContracts = Math.min(apiContracts, PRECISION_CAP_INCONSISTENTE);

  const frontend = Math.round(
    Math.max(0, Math.min(100, frontendBlock.length >= 80 ? 100 : frontendBlock.length >= 40 ? 50 : 0)),
  );
  let seguridad = Math.round(
    Math.max(
      0,
      Math.min(100, sections.security * 100 - gaps.securityCompletenessGap * 30 - gaps.securityEdgeCaseGap * 30),
    ),
  );
  if (inconsistentSet.has("seguridad")) seguridad = Math.min(seguridad, PRECISION_CAP_INCONSISTENTE);

  const integracion = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        sections.infra * 100 - gaps.missingManifest * 40 - gaps.contradictionGap * 30 - gaps.infraStackGap * 30,
      ),
    ),
  );

  const sectionReasons: PrecisionBreakdown["sectionReasons"] = {};
  const trazaMsg =
    "Trazabilidad: concepto en Contexto sin ningún soporte en Modelo, API ni Seguridad (añade al menos uno o quítalo del contexto).";
  if (contextBlock.length < 80) sectionReasons.contexto = "Sección §1 Contexto muy breve.";
  if (gaps.contradictionGap) sectionReasons.contexto = (sectionReasons.contexto ? sectionReasons.contexto + " " : "") + "Contradicción entre contexto e integración.";
  if (inconsistentSet.has("contexto")) sectionReasons.contexto = (sectionReasons.contexto ? sectionReasons.contexto + " " : "") + trazaMsg;

  const modeloReasons: string[] = [];
  if (gaps.mermaidParityGap) modeloReasons.push("Diagrama Mermaid no coincide con tablas SQL.");
  if (inconsistentSet.has("modeloDatos")) modeloReasons.push(trazaMsg);
  if (modeloReasons.length) sectionReasons.modeloDatos = modeloReasons.join(" ");

  const apiReasons: string[] = [];
  if (!sections.endpointsWithPayloads && sections.endpoints > 0) apiReasons.push("Faltan payloads (request/response) en endpoints.");
  if (inconsistentSet.has("apiContracts")) apiReasons.push(trazaMsg);
  if (apiReasons.length) sectionReasons.apiContracts = apiReasons.join(" ");

  if (frontend < 100 && frontendBlock.length < 80) sectionReasons.frontend = "Sección Frontend en §2 muy breve o ausente.";

  const segReasons: string[] = [];
  if (gaps.securityCompletenessGap) segReasons.push("Falta almacén de credenciales o columnas de auditoría (según doc).");
  if (gaps.securityEdgeCaseGap) segReasons.push("Lógica de bloqueo sin número de intentos definido en §6 Seguridad.");
  if (inconsistentSet.has("seguridad")) segReasons.push(trazaMsg);
  if (segReasons.length) sectionReasons.seguridad = segReasons.join(" ");

  const intReasons: string[] = [];
  if (gaps.missingManifest) intReasons.push("Falta manifest JSON o Technical Metadata en §7.");
  if (gaps.contradictionGap) intReasons.push("Contradicción contexto ↔ integración.");
  if (gaps.infraStackGap) intReasons.push("Stack (NestJS/Node) no reflejado en Infra (Dockerfile Node).");
  if (intReasons.length) sectionReasons.integracion = intReasons.join(" ");

  return {
    contexto,
    modeloDatos,
    apiContracts,
    frontend,
    seguridad,
    integracion,
    ...(Object.keys(sectionStatus).length > 0 ? { sectionStatus } : {}),
    ...(Object.keys(sectionReasons).length > 0 ? { sectionReasons } : {}),
  };
}

function looksLikeMddEvidenceJson(o: Record<string, unknown>): boolean {
  return (
    ("summary" in o || "openapi_spec" in o || "evidence_paths" in o) &&
    ("entities" in o || "api_contracts" in o || "db_entities" in o || "evidence_paths" in o || "business_logic" in o)
  );
}

/** JSON plano o embebido tras título tipo `# MDD de partida …` + bloque (legacy ingest). */
function extractMddEvidenceJsonObject(md: string): Record<string, unknown> | null {
  const t = md.trim();
  const candidates: string[] = [];
  if (t.startsWith("{")) candidates.push(t);
  const fence = /```(?:json)?\s*(\{[\s\S]*?)\s*```/i.exec(t);
  if (fence?.[1]?.trim().startsWith("{")) candidates.push(fence[1].trim());
  const nl = t.indexOf("\n{");
  if (nl !== -1) {
    const rest = t.slice(nl + 1).trim();
    if (rest.startsWith("{")) candidates.push(rest);
  }
  for (const c of candidates) {
    try {
      const o = JSON.parse(c) as Record<string, unknown>;
      if (looksLikeMddEvidenceJson(o)) return o;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

/**
 * Semáforo sobre JSON devuelto por ingest `evidence_first` (pocas claves rellenas pero muchas rutas de evidencia).
 */
function detectReferenceSectionsFromIngestJson(parsed: Record<string, unknown>, rawLen: number): {
  db: number;
  endpoints: number;
  endpointsWithPayloads: boolean;
  security: number;
  securitySubstantive: boolean;
  infra: number;
} {
  const ent = (parsed.db_entities ?? parsed.entities) as unknown;
  const entityN = Array.isArray(ent) ? ent.length : 0;
  const apiC = parsed.api_contracts;
  const apiN = Array.isArray(apiC) ? apiC.length : 0;
  const ev = parsed.evidence_paths;
  const evN = Array.isArray(ev) ? ev.length : 0;
  const spec = parsed.openapi_spec as { found?: unknown } | undefined;
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const blob = JSON.stringify(parsed);

  const hasIndexedMass = evN >= 12 || entityN > 0 || apiN > 0 || rawLen > 4000;
  const db = entityN > 0 ? 1 : hasIndexedMass ? 1 : evN >= 6 ? 0.5 : 0;
  const endpoints = apiN > 0 || (spec && spec.found === true) ? 1 : hasIndexedMass && evN >= 8 ? 1 : 0;
  const endpointsWithPayloads =
    apiN > 0 ||
    (spec && spec.found === true) ||
    /\b(payload|requestbody|responsebody)\b/i.test(blob) ||
    /\b(POST|GET|PUT|PATCH|DELETE)\s+[/`"']/i.test(blob + summary);

  const risk = parsed.risk_report as Record<string, unknown> | undefined;
  const infraObj = parsed.infrastructure as Record<string, unknown> | undefined;
  const security = risk != null && Object.keys(risk).length > 0 ? 0.5 : 0;
  const securitySubstantive =
    security > 0 &&
    (/anti_patterns|complexity/i.test(blob) ||
      (typeof risk?.complexity === "number" && risk.complexity > 0));
  const infra =
    infraObj != null && (Object.keys(infraObj).length > 0 || (Array.isArray(infraObj.env_vars) && infraObj.env_vars.length > 0))
      ? 0.5
      : 0;

  return { db, endpoints, endpointsWithPayloads, security, securitySubstantive, infra };
}

function tryParseJsonMddCounts(md: string): { entityCount: number; screenCount: number; extraEndpointCount: number } | null {
  const j = extractMddEvidenceJsonObject(md);
  if (!j) return null;
  try {
    const ent = j.db_entities ?? j.entities;
    let entityCount = Array.isArray(ent) ? ent.length : 0;
    const scr = j.screens ?? j.pantallas;
    let screenCount = Array.isArray(scr) ? scr.length : 0;
    let extraEndpointCount =
      typeof j.extra_endpoints === "number" && Number.isFinite(j.extra_endpoints) ? Math.max(0, j.extra_endpoints) : 0;
    const apiC = j.api_contracts;
    if (Array.isArray(apiC)) extraEndpointCount += apiC.length;

    const ev = j.evidence_paths;
    const evN = Array.isArray(ev) ? ev.length : 0;
    if (entityCount === 0 && screenCount === 0 && extraEndpointCount === 0 && evN >= 10) {
      extraEndpointCount = Math.min(72, Math.max(10, Math.ceil(evN / 11)));
    }
    if (entityCount === 0 && evN >= 40) {
      entityCount = Math.min(18, Math.max(4, Math.ceil(evN / 45)));
    }

    const inferredScreensFromApi =
      extraEndpointCount > 0 ? Math.min(28, Math.max(4, Math.ceil(extraEndpointCount * 0.55))) : 0;
    const finalScreenCount =
      extraEndpointCount > 0
        ? Math.max(screenCount, inferredScreensFromApi)
        : screenCount > 0
          ? screenCount
          : entityCount > 0
            ? Math.min(entityCount * 2, 20)
            : 0;
    return { entityCount, screenCount: finalScreenCount, extraEndpointCount };
  } catch {
    return null;
  }
}

/**
 * Detecta secciones de referencia del MDD en markdown (agnóstico de dominio).
 * Verde requiere: DB/entidades, Endpoints con payloads, Seguridad con contenido sustancial (decisiones documentadas).
 * Integración cuenta como infra (MDD estándar del proyecto incluye ## Integración).
 */
function detectReferenceSections(md: string): {
  db: number;
  endpoints: number;
  endpointsWithPayloads: boolean;
  security: number;
  securitySubstantive: boolean;
  infra: number;
} {
  const trimmed = (md || "").trim();
  const jsonObj = extractMddEvidenceJsonObject(trimmed);
  if (jsonObj) {
    return detectReferenceSectionsFromIngestJson(jsonObj, trimmed.length);
  }

  const content = trimmed.toLowerCase();
  const scores = {
    db: 0,
    endpoints: 0,
    endpointsWithPayloads: false,
    security: 0,
    securitySubstantive: false,
    infra: 0,
  };

  const hasSection = (patterns: RegExp[], minLength = 80) => {
    for (const p of patterns) {
      const m = content.match(p);
      if (m) {
        const block = (m[1] ?? m[0] ?? "").trim();
        return block.length >= minLength ? 1 : 0.5;
      }
    }
    return 0;
  };

  // §3 Modelo de Datos
  scores.db = hasSection(
    [new RegExp("(?:#+\\s*)?(?:modelo\\s+de\\s+datos|datos\\s*\\/\\s*entidades|db_entities)[\\s\\S]*?" + SECTION_BOUNDARY.source, "i")],
    60,
  );
  // §4 Contratos de API (no confundir con §7 Infraestructura)
  scores.endpoints = hasSection(
    [new RegExp("(?:#+\\s*)?(?:contratos\\s+de\\s+api|endpoints|api\\s+contracts)[\\s\\S]*?" + SECTION_BOUNDARY.source, "i")],
    60,
  );
  scores.endpointsWithPayloads =
    scores.endpoints > 0 &&
    (/\bpayload\b|\brequest\s*body\b|\bresponse\s*body\b|json\s*:\s*\{|```json\s*\{/i.test(content) ||
      /(?:post|put|patch)[\s\S]*?\{[\s\S]*\}/i.test(content));

  const securityBlock =
    content.match(
      new RegExp("^##\\s+(?:\\d+\\.\\s*)?(?:seguridad|security)[\\s\\S]*?" + SECTION_BOUNDARY.source, "im"),
    )?.[0] ?? "";
  scores.security = securityBlock.length >= 40 ? 1 : securityBlock.length > 0 ? 0.5 : 0;
  scores.securitySubstantive =
    scores.security > 0 &&
    (/autenticación|autorización|permisos|cifrado|token|sesión|hash|rbac|roles|mfa|argon2|2fa|two\-factor/i.test(securityBlock) ||
      securityBlock.length >= 120);

  scores.infra = hasSection(
    [
      new RegExp("(?:#+\\s*)?(?:infraestructura|infra|despliegue|integración)[\\s\\S]*?" + SECTION_BOUNDARY.source, "i"),
    ],
    40,
  );

  return scores;
}

/**
 * Parsea entidades, pantallas y endpoints desde markdown para asignar horas base.
 * Estructura canónica MDD: §3 Modelo de Datos, §4 Contratos de API.
 */
function parseCountsFromMarkdown(md: string): {
  entityCount: number;
  screenCount: number;
  extraEndpointCount: number;
} {
  const jsonCounts = tryParseJsonMddCounts(md);
  if (jsonCounts && (jsonCounts.entityCount > 0 || jsonCounts.screenCount > 0 || jsonCounts.extraEndpointCount > 0)) {
    return jsonCounts;
  }

  const lines = md.split(/\r?\n/);
  const entities = new Set<string>();
  let extraEndpointCount = 0;
  let inDataModel = false;
  let inApi = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^#+\s*(?:\d\.\s*)?.*modelo de datos/i.test(line) || (lower.includes("modelo de datos") && /^#+\s*/.test(line))) {
      inDataModel = true;
      inApi = false;
      continue;
    }
    if (/^#+\s*(?:\d\.\s*)?.*contratos de api|^#+\s*4\.|endpoints/i.test(line) || (lower.includes("contratos de api") && /^#+\s*/.test(line))) {
      inDataModel = false;
      inApi = true;
      continue;
    }
    if (inDataModel) {
      const m = line.match(/\*\*([A-Za-z][A-Za-z0-9_]*)\*\*|^-\s*\*\*([A-Za-z][A-Za-z0-9_]*)\*\*|^([A-Za-z][A-Za-z0-9_]*)\s*\(/);
      if (m) {
        const name = (m[1] ?? m[2] ?? m[3])?.trim();
        if (name) entities.add(name);
      }
      const createTable = line.match(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/i);
      if (createTable) entities.add(createTable[1].toLowerCase());
    }
    if (inApi && (/\/api\/|\/auth\//.test(line) || /\b(POST|GET|PUT|DELETE|PATCH)\s+(\/|https?)/i.test(line))) {
      extraEndpointCount += 1;
    }
  }

  const createTableGlobal = md.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/gi);
  for (const m of createTableGlobal) entities.add(m[1].toLowerCase());

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

function buildReadinessHints(
  md: string,
  precision: number,
  sections: ReturnType<typeof detectReferenceSections>,
  gaps: ReturnType<typeof computeConsistencyGaps>,
  cx: EstimationComplexity,
): string[] {
  const out: string[] = [];
  if (precision < 70) {
    out.push(
      "Prioriza §3 (modelo de datos) y §4 (API con payloads y códigos HTTP) antes de cascadas largas con IA.",
    );
  } else if (precision < 95) {
    out.push("Refuerza trazabilidad §2↔§7 y paridad Mermaid/SQL para subir efectividad en conformance y generación asistida.");
  }
  if (!sections.endpointsWithPayloads) {
    out.push("Contratos API: añade cuerpos JSON de request/response en los endpoints críticos.");
  }
  if (!sections.securitySubstantive) {
    out.push("Seguridad: documenta authN/Z, datos sensibles y amenazas; mejora la verificación con IA (checkbox conformance).");
  }
  if (gaps.contradictionGap > 0) {
    out.push("Elimina contradicciones entre secciones (reduce falsos positivos y retrabajo en OpenRouter).");
  }
  if (gaps.mermaidParityGap > 0) {
    out.push("Alinea diagrama ER con tablas SQL para desbloquear Blueprint ↔ §3 y Contratos API.");
  }
  if (cx === "HIGH" && sections.db > 0 && !sections.endpointsWithPayloads) {
    out.push("Alcance HIGH: sin payloads en API el semáforo suele quedar en amarillo aunque el MDD sea largo.");
  }
  if (md.length > 8000 && precision < 90) {
    out.push("MDD extenso: revisa señales duplicadas o tablas huérfanas que confunden al modelo.");
  }
  return out.slice(0, 6);
}

/**
 * Servicio de estimación en vivo, independiente del flujo LangChain.
 * Tasa interna 2026: $21k netos × 1.4 carga social ÷ 160 h/mes = $185 MXN/hr.
 * Llamable por GET /ai-analysis/estimation?projectId= o cuando el documento cambie en el front.
 */
@Injectable()
export class EstimationService {
  private readonly liveDraftByProject = new Map<string, string>();
  private readonly auditorGapsByProject = new Map<string, AuditorGaps>();
  /** `projectId` o `projectId::stageId` → complejidad para semáforo/desglose (alineado con Workshop). */
  private readonly estimationComplexityByKey = new Map<string, EstimationComplexity>();

  constructor(private readonly prisma: PrismaService) { }

  /** Inicio de stream MDD o tras cargar proyecto: fija complejidad para `calculateLiveMetrics` sin pasarla en cada llamada. */
  cacheProjectComplexity(projectId: string, stageId: string | null | undefined, complexity: EstimationComplexity): void {
    const p = projectId?.trim();
    if (!p) return;
    this.estimationComplexityByKey.set(this.draftKey(p, stageId), complexity);
  }

  private resolveEstimationComplexity(options?: {
    complexity?: EstimationComplexity;
    projectId?: string;
    stageId?: string | null;
  }): EstimationComplexity {
    if (options?.complexity) return options.complexity;
    const pid = options?.projectId?.trim();
    if (!pid) return "HIGH";
    return this.estimationComplexityByKey.get(this.draftKey(pid, options?.stageId)) ?? "HIGH";
  }

  /** Clave de borrador/gaps: `projectId` o `projectId::stageId` si hay etapa explícita. */
  private draftKey(projectId: string, stageId?: string | null): string {
    const p = projectId?.trim() ?? "";
    const s = stageId?.trim();
    return s ? `${p}::${s}` : p;
  }

  setLiveDraft(projectId: string, mddDraft: string, stageId?: string | null): void {
    if (!projectId?.trim()) return;
    this.liveDraftByProject.set(this.draftKey(projectId, stageId), mddDraft ?? "");
  }

  /** Almacena gaps estructurados del Auditor (LLM) para usar en métricas cuando el draft no ha cambiado. */
  setAuditorGaps(projectId: string, gaps: AuditorGaps | undefined, stageId?: string | null): void {
    if (!projectId?.trim()) return;
    const key = this.draftKey(projectId, stageId);
    if (gaps == null) this.auditorGapsByProject.delete(key);
    else this.auditorGapsByProject.set(key, gaps);
  }

  clearLiveDraft(projectId: string, stageId?: string | null): void {
    if (!projectId?.trim()) return;
    this.liveDraftByProject.delete(this.draftKey(projectId, stageId));
  }

  async getMddContentForProject(projectId: string, stageId?: string | null): Promise<string | null> {
    const key = this.draftKey(projectId, stageId);
    const live = this.liveDraftByProject.get(key);
    if (live != null && live.trim().length > 0) return live;
    const legacyOnly = projectId?.trim() ?? "";
    if (stageId?.trim()) {
      const legacy = this.liveDraftByProject.get(legacyOnly);
      if (legacy != null && legacy.trim().length > 0) return legacy;
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId?.trim() },
      include: { stages: { orderBy: { ordinal: "asc" } } },
    });
    const stages = project?.stages ?? [];
    if (stageId?.trim()) {
      const st = stages.find((s) => s.id === stageId.trim());
      return st?.mddContent ?? null;
    }
    const stage = pickPrimaryStage(stages);
    return stage?.mddContent ?? null;
  }

  /**
   * Métricas para un proyecto. Si se pasa mddContent, se usa ese; sino liveDraft o DB.
   * Cuando no hay override y hay gaps del Auditor guardados para el proyecto, se usan para precisión/semáforo.
   */
  async getLiveMetricsForProject(
    projectId: string,
    mddContentOverride?: string,
    stageId?: string | null,
  ): Promise<LiveMetricsResult> {
    const content =
      mddContentOverride != null && mddContentOverride.length > 0
        ? mddContentOverride
        : (await this.getMddContentForProject(projectId, stageId)) ?? "";
    const key = this.draftKey(projectId, stageId);
    const useStoredGaps = !mddContentOverride && this.auditorGapsByProject.has(key);
    const useLegacyGaps =
      !mddContentOverride &&
      !useStoredGaps &&
      this.auditorGapsByProject.has(projectId?.trim() ?? "");
    const auditorGaps = useStoredGaps
      ? this.auditorGapsByProject.get(key)
      : useLegacyGaps
        ? this.auditorGapsByProject.get(projectId!.trim())
        : undefined;
    const proj = await this.prisma.project.findUnique({
      where: { id: projectId.trim() },
      select: { complexity: true },
    });
    const cx = (proj?.complexity as EstimationComplexity) ?? "HIGH";
    this.cacheProjectComplexity(projectId, stageId, cx);

    // Cargar documentos de etapa + proyecto para métrica integral
    let documents: PlanningDocumentFields = {};
    const sid = stageId?.trim();
    if (sid) {
      const stage = await this.prisma.stage.findUnique({
        where: { id: sid },
        select: {
          brdContent: true,
        },
      });
      if (stage) {
        documents = {
          brdContent: stage.brdContent ?? undefined,
        };
      }
    }
    try {
      const projectRec = await this.prisma.project.findUnique({
        where: { id: projectId.trim() },
        select: {
          specContent: true,
          architectureContent: true,
          useCasesContent: true,
          userStoriesContent: true,
          blueprintContent: true,
          apiContractsContent: true,
          logicFlowsContent: true,
          infraContent: true,
          tasksContent: true,
        },
      });
      if (projectRec) {
        // Merge project-level docs (don't override stage-level)
        documents = {
          ...documents,
          specContent: (projectRec as any).specContent ?? documents.specContent,
          architectureContent: (projectRec as any).architectureContent ?? documents.architectureContent,
          useCasesContent: (projectRec as any).useCasesContent ?? documents.useCasesContent,
          userStoriesContent: (projectRec as any).userStoriesContent ?? documents.userStoriesContent,
          blueprintContent: (projectRec as any).blueprintContent ?? documents.blueprintContent,
          apiContractsContent: (projectRec as any).apiContractsContent ?? documents.apiContractsContent,
          logicFlowsContent: (projectRec as any).logicFlowsContent ?? documents.logicFlowsContent,
          infraContent: (projectRec as any).infraContent ?? documents.infraContent,
          tasksContent: (projectRec as any).tasksContent ?? documents.tasksContent,
        };
      }
    } catch {
      // no-op
    }

    return this.calculateLiveMetrics(content, {
      auditorGaps,
      complexity: cx,
      projectId: projectId.trim(),
      stageId: stageId ?? null,
      documents,
    });
  }

  /** Desglose por sección/agente (0–100) para mostrar en la tabla del chat tras auditar. */
  getPrecisionBreakdown(
    md: string,
    options?: { complexity?: EstimationComplexity; projectId?: string; stageId?: string | null },
  ): PrecisionBreakdown {
    const cx = this.resolveEstimationComplexity(options);
    return computePrecisionBreakdown((md ?? "").trim(), cx);
  }

  /**
   * Reporte de gaps en lenguaje natural. Si se pasan auditorGaps (del Auditor LLM), se usan; si no, fallback a regex.
   */
  getGapsReport(md: string, auditorGaps?: AuditorGaps): string[] {
    if (auditorGaps) {
      const messages: string[] = [];
      for (const g of auditorGaps.critical_gaps) {
        messages.push(`[${g.sections.join(", ")}] ${g.issue} Corrección: ${g.fix}`);
      }
      for (const e of auditorGaps.syntax_errors) messages.push(e);
      return messages;
    }
    const trimmed = (md ?? "").trim();
    if (!trimmed) return [];
    const traceability = computeTraceabilityGaps(trimmed);
    const contract = computeContractGaps(trimmed);
    const messages: string[] = [];
    if (traceability.inconsistentSections.length > 0) {
      messages.push("Trazabilidad MFA: Contexto menciona MFA pero falta tablas de secretos en Modelo de Datos, endpoint /verify o /totp en Contratos de API, o algoritmo TOTP en Seguridad.");
    }
    if (contract.mermaidParityGap) {
      messages.push("El diagrama Mermaid (erDiagram) tiene entidades o atributos que no existen en el SQL; no se permiten abreviaturas.");
    }
    if (contract.infraStackGap) {
      messages.push("El stack (NestJS/Node) en Arquitectura debe reflejarse en Infraestructura (Dockerfile compatible con Node.js).");
    }
    if (contract.securityEdgeCaseGap) {
      messages.push("Lógica menciona bloqueo de cuenta pero Seguridad debe definir el número de intentos.");
    }
    return messages;
  }

  /**
   * Calcula métricas en vivo a partir del MDD. Si options.auditorGaps está presente (evaluación del Auditor LLM),
   * se usan score e infrastructure_ready para precisión y semáforo; si no, se usa lógica por regex.
   */
  calculateLiveMetrics(
    mddContext: MDDContext,
    options?: {
      auditorGaps?: AuditorGaps;
      complexity?: EstimationComplexity;
      projectId?: string;
      stageId?: string | null;
      documents?: PlanningDocumentFields;
    },
  ): LiveMetricsResult {
    const raw =
      typeof mddContext === "string"
        ? mddContext
        : (mddContext as { mddContent?: string })?.mddContent ?? "";
    const md = raw?.trim() ?? "";

    const cx = this.resolveEstimationComplexity(options);
    const docs = options?.documents;
    const hasDocs = docs && Object.values(docs).some(v => String(v ?? "").trim().length > 0);

    let precision: number;
    let status: SemaphoreStatusLive;
    let readinessHints: string[];

    if (hasDocs) {
      // ── Métrica integral ──────────────────────────────────
      // 1. Calidad MDD (path existente: auditor o regex)
      let mddQuality: number;
      if (options?.auditorGaps) {
        mddQuality = Math.min(100, Math.max(0, options.auditorGaps.score));
      } else {
        const sections = detectReferenceSections(md);
        const gaps = adjustGapsForEstimationComplexity(computeConsistencyGaps(md), cx);
        const traceability = computeTraceabilityGaps(md);
        const traceabilityPenalty = traceability.inconsistentSections.length > 0 ? 15 : 0;
        const basePrecisionRaw = (sections.db + sections.endpoints + sections.security + sections.infra) * 25;
        const gapPenalty =
          gaps.contradictionGap * 22 +
          gaps.securityCompletenessGap * 12 +
          gaps.missingManifest * 16 +
          gaps.mermaidParityGap * 8 +
          gaps.infraStackGap * 10 +
          gaps.securityEdgeCaseGap * 8 +
          traceabilityPenalty;
        mddQuality = Math.min(100, Math.round(Math.max(0, basePrecisionRaw - gapPenalty)));
      }

      // 2. Completitud (todos los documentos)
      const completeness = computeDocumentCompleteness(docs!);
      const completenessScore = completeness.overall;

      // 3. Consistencia transversal
      const consistency = computeCrossDocumentConsistency(docs!);
      const consistencyScore = consistency.score;

      // 4. Fórmula ponderada
      precision = Math.round(
        completenessScore * COMPLETENESS_WEIGHT +
        consistencyScore * CROSS_CONSISTENCY_WEIGHT +
        mddQuality * MDD_QUALITY_WEIGHT
      );

      // 5. Semáforo
      const gapCount = consistency.gaps.length;
      const hasGreenCriteria = precision >= PRECISION_GREEN_MIN && gapCount === 0;
      status = hasGreenCriteria ? "green" : precision >= PRECISION_RED_MAX ? "yellow" : "red";

      // 6. Hints incluyen gaps de consistencia
      readinessHints = [];
      if (consistency.gaps.length > 0) {
        readinessHints.push(
          ...consistency.gaps.slice(0, 3).map(
            (g) => `[${g.from}→${g.to}] ${g.concept}: ${g.severity === "missing" ? "no cubierto" : "parcial"}`
          )
        );
      }
      // Añadir MDD hints si no hay suficientes hints de consistencia
      if (readinessHints.length < 3) {
        try {
          const dummySections = { db: 0, endpoints: 0, endpointsWithPayloads: false, security: 0, securitySubstantive: false, infra: 0 };
          const dummyGaps = { scopeDataGap: 0, contradictionGap: 0, securityCompletenessGap: 0, missingManifest: 0, dataIntegrityGap: 0, apiSchemaGap: 0, mermaidParityGap: 0, infraStackGap: 0, securityEdgeCaseGap: 0 };
          const mddHints = buildReadinessHints(md, mddQuality, dummySections, dummyGaps, cx);
          readinessHints.push(...mddHints.slice(0, 3 - readinessHints.length));
        } catch { /* no-op */ }
      }

    } else if (options?.auditorGaps) {
      const g = options.auditorGaps;
      precision = Math.min(100, Math.max(0, g.score));
      const strictInfra = cx === "HIGH";
      const hasGreenCriteria = strictInfra
        ? precision >= PRECISION_GREEN_MIN && g.infrastructure_ready && g.critical_gaps.length === 0
        : precision >= PRECISION_GREEN_MIN && g.critical_gaps.length === 0;
      status = hasGreenCriteria ? "green" : precision >= PRECISION_RED_MAX ? "yellow" : "red";
      readinessHints =
        g.critical_gaps.length > 0
          ? g.critical_gaps
              .slice(0, 5)
              .map((x) => `[${(x.sections ?? []).join(" · ")}] ${x.issue}`)
          : (g.syntax_errors?.length ?? 0) > 0
            ? (g.syntax_errors ?? []).slice(0, 4)
            : [
                g.infrastructure_ready
                  ? "Auditoría sin gaps críticos estructurados: activa conformance con IA para cruzar entregables con el MDD."
                  : "Alinea §7 Infra con el stack de §2 (p. ej. Docker/Node) para marcar infra lista y subir confianza en cascadas.",
              ];
    } else {
      const sections = detectReferenceSections(md);
      const gaps = adjustGapsForEstimationComplexity(computeConsistencyGaps(md), cx);
      const traceability = computeTraceabilityGaps(md);
      const traceabilityPenalty = traceability.inconsistentSections.length > 0 ? 15 : 0;
      const basePrecisionRaw =
        (sections.db + sections.endpoints + sections.security + sections.infra) * 25;
      const gapPenalty =
        gaps.contradictionGap * 22 +
        gaps.securityCompletenessGap * 12 +
        gaps.missingManifest * 16 +
        gaps.mermaidParityGap * 8 +
        gaps.infraStackGap * 10 +
        gaps.securityEdgeCaseGap * 8 +
        traceabilityPenalty;
      precision = Math.min(100, Math.round(Math.max(0, basePrecisionRaw - gapPenalty)));
      const hasGreenCriteria =
        cx === "HIGH"
          ? sections.db > 0 && sections.endpointsWithPayloads && gaps.contradictionGap === 0
          : cx === "MEDIUM"
            ? sections.db > 0 && sections.endpointsWithPayloads && gaps.contradictionGap === 0
            : sections.db > 0 && gaps.contradictionGap === 0;
      status =
        precision >= PRECISION_GREEN_MIN && hasGreenCriteria
          ? "green"
          : precision >= PRECISION_RED_MAX
            ? "yellow"
            : "red";
      readinessHints = buildReadinessHints(md, precision, sections, gaps, cx);
    }

    const { entityCount, screenCount, extraEndpointCount } = parseCountsFromMarkdown(md);
    const metaTags = extractTechnicalMetadataTags(md);
    const baseTotalHours =
      entityCount * HOURS_PER_ENTITY +
      screenCount * HOURS_PER_SCREEN +
      extraEndpointCount * HOURS_PER_ENDPOINT;

    const riskFactor =
      precision < RISK_PRECISION_THRESHOLD ? RISK_FACTOR_LOW_PRECISION : 1.0;
    const totalHours = baseTotalHours;
    const roles =
      baseTotalHours > 0
        ? (buildDeliveryTeamStructure(
            entityCount,
            screenCount,
            extraEndpointCount,
            metaTags,
          ) as Record<string, number>)
        : {};
    const rolesHours =
      baseTotalHours > 0 ? allocateDeliveryRoleHours(totalHours, roles) : {};
    // Nómina interna: todas las roles a tarifa fija ($185/hr)
    const internalPayroll = baseTotalHours > 0 ? totalHours * INTERNAL_HOUR_RATE : 0;
    const totalMXN = Math.round(internalPayroll * riskFactor * 100) / 100;
    // Mercado: referencia a tarifa de mercado
    const totalMXNMarket = Math.round(totalHours * MARKET_HOUR_RATE * riskFactor * 100) / 100;
    // Costo IA: tokens de salida estimados a $1/M tokens, convertido a MXN
    const totalAITokens =
      AI_BASE_OVERHEAD_TOKENS +
      entityCount * AI_TOKENS_PER_ENTITY +
      screenCount * AI_TOKENS_PER_SCREEN +
      extraEndpointCount * AI_TOKENS_PER_ENDPOINT;
    const totalMXNIA = Math.round(totalAITokens * AI_COST_PER_TOKEN_USD * MXN_PER_USD * 100) / 100;

    return {
      precision,
      totalMXN,
      totalMXNMarket,
      totalMXNIA,
      totalHours: Math.round(totalHours * 100) / 100,
      roles,
      rolesHours,
      status,
      readinessHints,
    };
  }

}
