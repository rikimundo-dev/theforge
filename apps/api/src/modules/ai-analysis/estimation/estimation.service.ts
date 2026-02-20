import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service.js";
import type {
  AuditorGaps,
  LiveMetricsResult,
  MDDContext,
  PrecisionBreakdown,
  SemaphoreStatusLive,
} from "./estimation.types.js";
import {
  INTERNAL_HOUR_RATE,
  MARKET_HOUR_RATE,
  PRECISION_GREEN_MIN,
  PRECISION_RED_MAX,
  RATIO_ARCHITECT,
  RATIO_BACK,
  RATIO_FRONT,
  RISK_FACTOR_LOW_PRECISION,
  RISK_PRECISION_THRESHOLD,
} from "./estimation.types.js";

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
      if (t && /^[a-z_][a-z0-9_]*$/i.test(t) && !/^(primary|key|references|constraint|unique|check|default|not|null|uuid|integer|varchar|text|boolean|timestamptz|timestamp|int|bigint|real|serial)$/i.test(t)) {
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
        if (attrMatch) attributes.add(attrMatch[2].toLowerCase());
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

  const skipApiKeys = /^(id|created_at|updated_at|password|confirm_password|token|refresh_token|redirect_uri|scope|code|totp_code)$/i;
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

  if (/\b(bloqueo\s+de\s+cuenta|lock\s+account|intentos\s+fallidos|failed\s+attempts|máximo\s+de\s+intentos)\b/i.test(logicBlock)) {
    if (!/\d+\s*(intentos?|attempts?)|intentos?\s*:\s*\d+|máximo\s+\d+/i.test(securityBlock)) {
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

/**
 * Desglose de precisión por sección/agente (0–100) para la tabla del chat.
 * Usa las mismas secciones y gaps que el semáforo; cada dimensión se penaliza según gaps que la afectan.
 * Si una sección está en traceabilityGaps.inconsistentSections, se capa a PRECISION_CAP_INCONSISTENTE.
 */
function computePrecisionBreakdown(md: string): PrecisionBreakdown {
  const sections = detectReferenceSections(md);
  const gaps = computeConsistencyGaps(md);
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
  const content = (md || "").trim().toLowerCase();
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
    (/\bpayload\b|\brequest\s*body\b|\bresponse\s*body\b|json\s*:\s*\{/i.test(content) ||
      /(?:post|put|patch).*\{[\s\S]*\}/i.test(content));

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
  const lines = md.split(/\r?\n/);
  const entities = new Set<string>();
  let extraEndpointCount = 0;
  let inDataModel = false;
  let inApi = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeaderLine = line.startsWith("#");

    if (isHeaderLine && (/modelo de datos/i.test(line) || /\b3\./i.test(line) || lower.includes("modelo de datos") || lower.includes("data model"))) {
      inDataModel = true;
      inApi = false;
      continue;
    }
    if (isHeaderLine && (/contratos de api/i.test(line) || /\b4\./i.test(line) || lower.includes("contratos de api") || lower.includes("api contracts") || lower.includes("endpoints"))) {
      inDataModel = false;
      inApi = true;
      continue;
    }

    if (inDataModel) {
      // Entity markers: **Name**, CREATE TABLE Name, (id:Name)
      const m = line.match(/\*\*([A-Za-z][A-Za-z0-9_]*)\*\*(?:\s*\([^)]*\))?\s*[:]?|^-\s*\*\*([A-Za-z][A-Za-z0-9_]*)\*\*|(?:\bcreate\s+table\s+)(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/i);
      if (m) {
        const name = (m[1] ?? m[2] ?? m[3])?.trim();
        if (name) entities.add(name.toLowerCase());
      }
      const graphMatch = line.match(/(?:\((?:[a-z0-9_]+)?\s*:\s*([A-Z][A-Za-z0-9_]*)\s*\))|(?:\s*:\s*([A-Z][A-Za-z0-9_]*)\b)/);
      if (graphMatch) {
        const name = (graphMatch[1] ?? graphMatch[2])?.trim();
        if (name) entities.add(name.toLowerCase());
      }
    }

    if (inApi) {
      const hasMethod = /\b(POST|GET|PUT|DELETE|PATCH)\b/.test(line);
      const hasPath = /(\/[\w/{}-]+)/.test(line);
      if (hasMethod && hasPath) {
        extraEndpointCount += 1;
      }
    }
  }

  // Global capture for safety
  const createTableGlobal = md.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/gi);
  for (const m of createTableGlobal) entities.add(m[1].toLowerCase());

  const entityCount = entities.size;
  const screenCount =
    extraEndpointCount > 0 ? 0 : entityCount > 0 ? Math.min(entityCount * 2, 20) : 0;
  return { entityCount, screenCount, extraEndpointCount };
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

  constructor(private readonly prisma: PrismaService) { }

  setLiveDraft(projectId: string, mddDraft: string): void {
    if (!projectId?.trim()) return;
    this.liveDraftByProject.set(projectId.trim(), mddDraft ?? "");
  }

  /** Almacena gaps estructurados del Auditor (LLM) para usar en métricas cuando el draft no ha cambiado. */
  setAuditorGaps(projectId: string, gaps: AuditorGaps | undefined): void {
    if (!projectId?.trim()) return;
    if (gaps == null) this.auditorGapsByProject.delete(projectId.trim());
    else this.auditorGapsByProject.set(projectId.trim(), gaps);
  }

  clearLiveDraft(projectId: string): void {
    if (projectId?.trim()) this.liveDraftByProject.delete(projectId.trim());
  }

  async getMddContentForProject(projectId: string): Promise<string | null> {
    const live = this.liveDraftByProject.get(projectId?.trim() ?? "");
    if (live != null && live.trim().length > 0) return live;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId?.trim() },
      select: { mddContent: true },
    });
    return project?.mddContent ?? null;
  }

  /**
   * Métricas para un proyecto. Si se pasa mddContent, se usa ese; sino liveDraft o DB.
   * Cuando no hay override y hay gaps del Auditor guardados para el proyecto, se usan para precisión/semáforo.
   */
  async getLiveMetricsForProject(projectId: string, mddContentOverride?: string): Promise<LiveMetricsResult> {
    const content =
      mddContentOverride != null && mddContentOverride.length > 0
        ? mddContentOverride
        : (await this.getMddContentForProject(projectId)) ?? "";
    const useStoredGaps = !mddContentOverride && this.auditorGapsByProject.has(projectId?.trim() ?? "");
    const auditorGaps = useStoredGaps ? this.auditorGapsByProject.get(projectId!.trim()) : undefined;
    return this.calculateLiveMetrics(content, { auditorGaps });
  }

  /** Desglose por sección/agente (0–100) para mostrar en la tabla del chat tras auditar. */
  getPrecisionBreakdown(md: string): PrecisionBreakdown {
    return computePrecisionBreakdown((md ?? "").trim());
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

    const breakdown = computePrecisionBreakdown(trimmed);
    const messages: string[] = [];

    if (breakdown.sectionReasons) {
      for (const key of Object.keys(breakdown.sectionReasons)) {
        const reason = breakdown.sectionReasons[key as keyof typeof breakdown.sectionReasons];
        if (reason) {
          // Si hay múltiples oraciones unidas por espacio o punto, las separamos para que se vean como items individuales
          const parts = reason.split(/\.\s+/);
          for (const p of parts) {
            const clean = p.trim();
            if (clean) {
              messages.push(clean.endsWith(".") ? clean : clean + ".");
            }
          }
        }
      }
    }

    return [...new Set(messages)];
  }

  /**
   * Calcula métricas en vivo a partir del MDD. Si options.auditorGaps está presente (evaluación del Auditor LLM),
   * se usan score e infrastructure_ready para precisión y semáforo; si no, se usa lógica por regex.
   */
  calculateLiveMetrics(mddContext: MDDContext, options?: { auditorGaps?: AuditorGaps }): LiveMetricsResult {
    const raw =
      typeof mddContext === "string"
        ? mddContext
        : (mddContext as { mddContent?: string })?.mddContent ?? "";
    const md = raw?.trim() ?? "";

    let precision: number;
    let status: SemaphoreStatusLive;

    if (options?.auditorGaps) {
      const g = options.auditorGaps;
      precision = Math.min(100, Math.max(0, g.score));
      const hasGreenCriteria =
        precision >= PRECISION_GREEN_MIN && g.infrastructure_ready && g.critical_gaps.length === 0;
      status = hasGreenCriteria ? "green" : precision >= PRECISION_RED_MAX ? "yellow" : "red";
    } else {
      const sections = detectReferenceSections(md);
      const gaps = computeConsistencyGaps(md);
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
        sections.db > 0 &&
        sections.endpointsWithPayloads &&
        sections.securitySubstantive &&
        gaps.contradictionGap === 0;
      status =
        precision >= PRECISION_GREEN_MIN && hasGreenCriteria
          ? "green"
          : precision >= PRECISION_RED_MAX
            ? "yellow"
            : "red";
    }

    const { entityCount, screenCount, extraEndpointCount } = parseCountsFromMarkdown(md);
    const baseTotalHours =
      entityCount * HOURS_PER_ENTITY +
      screenCount * HOURS_PER_SCREEN +
      extraEndpointCount * HOURS_PER_ENDPOINT;

    const riskFactor =
      precision < RISK_PRECISION_THRESHOLD ? RISK_FACTOR_LOW_PRECISION : 1.0;
    const totalHours = baseTotalHours;
    const totalMXN = Math.round(totalHours * INTERNAL_HOUR_RATE * riskFactor);
    const totalMXNMarket = Math.round(totalHours * MARKET_HOUR_RATE * riskFactor);

    const roles = {
      architect: baseTotalHours > 0 ? 1 : 0,
      back: baseTotalHours > 0 ? 1 : 0,
      front: baseTotalHours > 0 ? 1 : 0,
    };
    const rolesHours = {
      architect: Math.round(baseTotalHours * RATIO_ARCHITECT * 100) / 100,
      back: Math.round(baseTotalHours * RATIO_BACK * 100) / 100,
      front: Math.round(baseTotalHours * RATIO_FRONT * 100) / 100,
    };

    return {
      precision,
      totalMXN,
      totalMXNMarket,
      totalHours: Math.round(totalHours * 100) / 100,
      roles,
      rolesHours,
      status,
    };
  }

}
