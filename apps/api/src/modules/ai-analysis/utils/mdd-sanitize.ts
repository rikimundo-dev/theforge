import type { MddStructured } from "../state/mdd-structured.schema.js";

/** Convierte objeto con subsections (array de {title, description: string[]}) a markdown legible. */
function subsectionsToMarkdown(val: unknown): string | null {
  if (!val || typeof val !== "object" || Array.isArray(val)) return null;
  const rec = val as Record<string, unknown>;
  const subsections = rec.subsections;
  if (!Array.isArray(subsections)) return null;
  const out: string[] = [];
  for (const sub of subsections) {
    if (!sub || typeof sub !== "object") continue;
    const s = sub as Record<string, unknown>;
    const title = s.title;
    if (title != null) out.push(`### ${String(title)}`, "");
    const desc = s.description;
    if (Array.isArray(desc)) {
      for (const d of desc) out.push(typeof d === "string" ? `- ${d}` : `- ${JSON.stringify(d)}`);
      out.push("");
    } else if (typeof desc === "string") {
      out.push(`- ${desc}`, "");
    }
  }
  return out.length ? out.join("\n").trim() : null;
}

/** Convierte un item (string u objeto con title/description o subsections) a línea(s) markdown. */
function contentItemToMarkdown(item: unknown): string[] {
  if (typeof item === "string") return [item.trim()].filter(Boolean);
  if (typeof item !== "object" || item === null) return [String(item)];
  const subMd = subsectionsToMarkdown(item);
  if (subMd) return [subMd];
  const rec = item as Record<string, unknown>;
  if (rec.title != null && rec.description != null) {
    const lines: string[] = [`### ${String(rec.title)}`, ""];
    const desc = rec.description;
    if (Array.isArray(desc)) for (const d of desc) lines.push(typeof d === "string" ? `- ${d}` : `- ${JSON.stringify(d)}`);
    else if (typeof desc === "string") lines.push(desc);
    return [lines.join("\n")];
  }
  return [JSON.stringify(item, null, 2)];
}

/**
 * Si el contenido de una sección (Seguridad/Integración) es un objeto JSON con claves como títulos
 * y valores como arrays de strings u objetos (subsections), lo convierte a markdown legible.
 */
export function jsonSectionToMarkdown(sectionContent: string, sectionTitle: string): string {
  const trimmed = (sectionContent || "").trim();
  if (!trimmed || !trimmed.startsWith("{") || !trimmed.includes('"')) return sectionContent;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj !== "object" || Array.isArray(obj)) return sectionContent;
    const keys = Object.keys(obj);
    const isTitleContentShape =
      keys.length >= 2 &&
      keys.some((k) => k.toLowerCase() === "title") &&
      keys.some((k) => k.toLowerCase() === "content");
    const lines: string[] = [`## ${sectionTitle}`, ""];
    for (const [key, val] of Object.entries(obj)) {
      if (key.toLowerCase() === "title") continue;
      if (key.toLowerCase() === "content" && isTitleContentShape && Array.isArray(val)) {
        for (const item of val) {
          const parts = contentItemToMarkdown(item);
          for (const p of parts) lines.push(p.includes("\n") ? p : `- ${p}`);
        }
        lines.push("");
        continue;
      }
      const heading = key.trim().startsWith("###") ? key.trim() : `### ${key}`;
      lines.push(heading, "");
      if (Array.isArray(val)) {
        for (const item of val) {
          const parts = contentItemToMarkdown(item);
          for (const p of parts) lines.push(p.includes("\n") ? p : `- ${p}`);
        }
      } else if (typeof val === "string") {
        lines.push(val);
      } else if (typeof val === "object" && val !== null) {
        const subMd = subsectionsToMarkdown(val);
        lines.push(subMd ?? JSON.stringify(val, null, 2));
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  } catch {
    return sectionContent;
  }
}

/** Encuentra el índice del cierre de llave que equilibra la llave abierta en start. */
function findBalancedBrace(str: string, start: number): number {
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Como findBalancedBrace pero ignora { } que estén dentro de strings con comillas dobles (para JSON con erDiagram). */
function findBalancedBraceRespectingStrings(str: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Patrones para detectar en el documento qué infra/orquestación/despliegue está identificada (genérico). */
const INFRA_TERM_PATTERNS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /docker\s+compose|docker-compose/i, key: "docker-compose" },
  { pattern: /\bdocker\b/i, key: "docker" },
  { pattern: /\bdokploy\b/i, key: "dokploy" },
  { pattern: /\bkubernetes\b|k8s\b/i, key: "kubernetes" },
  { pattern: /\baws\b|api\s+gateway|amazon\s+cognito|rds\b|cloudwatch|cloudtrail/i, key: "aws" },
  { pattern: /\bgcp\b|google\s+cloud|cloud\s+run/i, key: "gcp" },
  { pattern: /\bterraform\b/i, key: "terraform" },
  { pattern: /\becs\b|eks\b|ec2\b/i, key: "aws" },
];

/**
 * Extrae del texto del documento (contexto, borrador, respuestas del usuario) los términos de
 * infraestructura/orquestación/despliegue que están identificados (Docker, Dokploy, K8s, AWS, GCP, etc.).
 * Sirve para que el manifest refleje solo lo que el documento menciona.
 */
export function extractIdentifiedInfraFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const found = new Set<string>();
  for (const { pattern, key } of INFRA_TERM_PATTERNS) {
    if (pattern.test(text)) found.add(key);
  }
  return [...found];
}

/**
 * Patrones indicativos (agnósticos de dominio) para detectar temas ya documentados.
 * Cubren ámbitos frecuentes en MDDs (auth, datos, infra, etc.); el Clarificador debe usar
 * además el borrador completo como fuente de verdad: cualquier tema ya redactado, sea cual sea
 * el dominio, no debe generar pregunta.
 */
const ALREADY_DOCUMENTED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(transacciones\s+ACID|ACID\b|integridad\s+transaccional|consistencia\s+(fuerte|eventual|ACID))\b/i, label: "transacciones/consistencia" },
  { pattern: /\b(MFA|TOTP|2FA|autenticaci[oó]n\s+multifactor|segundo\s+factor)\b/i, label: "MFA/segundo factor" },
  { pattern: /\b(JWT|tokens?\s+JSON|json\s+web\s+token)\b/i, label: "JWT/tokens" },
  { pattern: /\b(password_hash|hash\s+de\s+contraseña|bcrypt|argon2)\b/i, label: "almacenamiento de credenciales" },
  { pattern: /\b(sesiones?|sessions?)\b/i, label: "sesiones" },
  { pattern: /\b(RBAC|roles?\s+y\s+permisos|control\s+de\s+acceso)\b/i, label: "roles/permisos" },
  { pattern: /\b(auditoría|audit|created_at|registro\s+de\s+actividades)\b/i, label: "auditoría" },
  { pattern: /\b(docker|kubernetes|dokploy|docker-compose)\b/i, label: "infraestructura/despliegue" },
  { pattern: /\b(manifest|stack|orquestaci[oó]n)\b/i, label: "manifest de infra" },
  { pattern: /\b(pago|payment|stripe|mercadopago|pasarela)\b/i, label: "pagos" },
  { pattern: /\b(inventario|stock|catálogo|catalog)\b/i, label: "inventario/catálogo" },
  { pattern: /\b(pedido|order)\b/i, label: "pedidos" },
  { pattern: /\b(notificaci[oó]n|notification|email\s+push)\b/i, label: "notificaciones" },
  { pattern: /\b(integridad\s+referencial|foreign\s+key|REFERENCES)\b/i, label: "integridad referencial" },
];

/**
 * Extrae temas indicativos que ya aparecen en el borrador (cualquier dominio) para que el
 * Clarificador no repita preguntas. La lista es orientativa; el LLM debe revisar el borrador
 * completo y no preguntar sobre ningún tema ya cubierto en el texto.
 */
export function extractAlreadyDocumentedTopics(draft: string): string[] {
  if (!draft || typeof draft !== "string") return [];
  const found = new Set<string>();
  for (const { pattern, label } of ALREADY_DOCUMENTED_PATTERNS) {
    if (pattern.test(draft)) found.add(label);
  }
  return [...found];
}

/**
 * Construye un manifest JSON mínimo a partir de términos de infra identificados en el documento.
 * Si no hay ninguno, devuelve un manifest con pending para que se pregunte al usuario.
 */
export function buildManifestFromIdentifiedInfra(identifiedTerms: string[]): string {
  const normalized = [...new Set(identifiedTerms.map((t) => t.toLowerCase()))];
  if (normalized.length === 0) {
    return JSON.stringify(
      {
        manifest: "infra-v1",
        stack: [],
        pending: "Definir con el usuario: orquestación (Docker Compose, K8s, etc.) y despliegue (Dokploy, AWS ECS, GCP, etc.)",
      },
      null,
      2,
    );
  }
  const hasAws = normalized.some((t) => t === "aws");
  const hasDocker = normalized.some((t) => t === "docker" || t === "docker-compose");
  const hasDokploy = normalized.some((t) => t === "dokploy");
  const hasK8s = normalized.some((t) => t === "kubernetes");
  if (hasDocker || hasDokploy) {
    return JSON.stringify(
      {
        manifest: "infra-v1",
        orchestration: hasDocker ? "docker-compose" : undefined,
        deployment: hasDokploy ? "dokploy" : undefined,
        stack: [...new Set([...(hasDocker ? ["docker", "docker-compose"] : []), ...(hasDokploy ? ["dokploy"] : [])])],
        services: ["api", "db", "frontend"],
      },
      null,
      2,
    );
  }
  if (hasK8s) {
    return JSON.stringify(
      { manifest: "infra-v1", orchestration: "kubernetes", stack: ["kubernetes"], services: ["api", "db", "frontend"] },
      null,
      2,
    );
  }
  if (hasAws) {
    return JSON.stringify(
      { manifest: "infra-v1", provider: "aws", stack: normalized, services: ["api", "db", "frontend"] },
      null,
      2,
    );
  }
  return JSON.stringify(
    { manifest: "infra-v1", stack: normalized, services: ["api", "db", "frontend"] },
    null,
    2,
  );
}

/**
 * Construye un manifest en el formato exclusivo (project_id, stack, deployment, integration_metadata)
 * a partir de términos identificados en el documento. Usado cuando el LLM no devuelve JSON válido
 * y el fallback no tiene bloque ```json (evita salida "Manifest: Docker, Dokploy").
 */
export function buildNewFormatManifestFromIdentifiedTerms(identifiedTerms: string[]): Record<string, unknown> {
  const normalized = [...new Set(identifiedTerms.map((t) => t.toLowerCase()))];
  const hasDokploy = normalized.includes("dokploy");
  const hasK8s = normalized.includes("kubernetes") || normalized.includes("k8s");
  const hasDocker = normalized.includes("docker") || normalized.includes("docker-compose");
  const orchestrator = hasK8s ? "Kubernetes" : hasDocker ? "Docker Compose" : "TBD";
  const deploymentManager = hasDokploy ? "Dokploy" : "TBD";
  return {
    project_id: "mdd-project",
    stack: {
      backend: {
        framework: "NestJS",
        version: "10.x",
        language: "TypeScript",
        orm: "TypeORM",
        container: { base_image: "node:20-alpine", exposed_port: 3000 },
      },
      database: { engine: "PostgreSQL", version: "16", extensions: ["uuid-ossp", "pgcrypto"] },
      security: {
        protocol: "HTTPS",
        token_management: "JWT",
        mfa_strategy: "TOTP",
        hashing_algorithm: "bcrypt",
        hashing_rounds: 12,
      },
    },
    deployment: {
      orchestrator,
      provider: "Self-hosted / Cloud",
      tooling: { deployment_manager: deploymentManager, ci_cd: "Bitbucket Pipelines" },
      resources: { min_replicas: 1, max_replicas: 5, cpu_threshold: "70%" },
    },
    integration_metadata: { api_prefix: "/api/v1", jwks_enabled: false, multi_tenant_support: false },
  };
}

/**
 * Si el documento identificó una infra concreta (identifiedTerms) y el bloque manifest de la sección
 * incluye proveedores/servicios NO mencionados (ej. AWS cuando solo se mencionó Docker/Dokploy),
 * reemplaza el bloque por un manifest coherente con lo identificado.
 * Si identifiedTerms está vacío, reemplaza manifest con placeholder para definir con el usuario.
 */
export function sanitizeManifestToMatchIdentifiedInfra(sectionBody: string, identifiedTerms: string[]): string {
  if (!sectionBody) return sectionBody;
  const jsonBlockRe = /```json\s*\n[\s\S]*?```/g;
  const normalized = [...new Set(identifiedTerms.map((t) => t.toLowerCase()))];
  const hasAwsInDoc = normalized.includes("aws");
  const hasDockerDokployInDoc = ["docker", "docker-compose", "dokploy"].some((k) => normalized.includes(k));

  return sectionBody.replace(jsonBlockRe, (block) => {
    if (normalized.length === 0) {
      if (/^\s*\{\s*"manifest"/m.test(block) && !/"pending"/.test(block)) {
        return "```json\n" + buildManifestFromIdentifiedInfra([]) + "\n```";
      }
      return block;
    }
    const blockHasAws = /api_gateway|Cognito|RDS|CloudWatch|CloudTrail|AWS\s+API/i.test(block);
    if (hasDockerDokployInDoc && !hasAwsInDoc && blockHasAws) {
      return "```json\n" + buildManifestFromIdentifiedInfra(identifiedTerms) + "\n```";
    }
    if (hasAwsInDoc && !blockHasAws && block.length < 200) {
      return "```json\n" + buildManifestFromIdentifiedInfra(identifiedTerms) + "\n```";
    }
    return block;
  });
}

/**
 * Si la infra identificada en el documento NO es AWS (ej. solo Docker/Dokploy), reemplaza en las secciones
 * Seguridad e Integración las menciones a AWS Cognito, AWS RDS, etc. por equivalentes genéricos para evitar
 * contradicción con un alcance self-hosted.
 */
export function replaceAwsProseWithGenericWhenInfraNotAws(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  const identified = extractIdentifiedInfraFromText(draft);
  const normalized = [...new Set(identified.map((t) => t.toLowerCase()))];
  if (normalized.includes("aws")) return draft;

  const replacements: Array<[RegExp, string]> = [
    [/AWS\s+Cognito|Amazon\s+Cognito/gi, "servicio de autenticación (self-hosted)"],
    [/AWS\s+RDS|Amazon\s+RDS/gi, "base de datos PostgreSQL"],
    [/AWS\s+API\s+Gateway|API\s+Gateway\s+\(AWS\)/gi, "API / gateway de la aplicación"],
    [/AWS\s+CloudWatch|CloudWatch/gi, "monitoreo"],
    [/AWS\s+CloudTrail|CloudTrail/gi, "registro de auditoría"],
  ];

  for (const heading of ["## Seguridad", "## Integración"]) {
    const idx = draft.indexOf(heading);
    if (idx === -1) continue;
    const sectionStart = idx + heading.length;
    const rest = draft.slice(sectionStart);
    const nextH2 = rest.search(/\n##\s+/);
    const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
    let newBody = body;
    for (const [re, replacement] of replacements) {
      newBody = newBody.replace(re, replacement);
    }
    if (newBody === body) continue;
    const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
    draft = draft.slice(0, sectionStart) + newBody + afterSection;
  }
  return draft;
}

/**
 * Parche por concepto (no por dominio): cuando el documento describe autenticación con credenciales
 * (login/password) o con secretos (MFA/TOTP), asegura que el SQL tenga almacén para credencial y/o
 * secreto si falta. Nombres usados son convención estándar (password_hash, tabla de secretos);
 * aplica a cualquier documento que describa esos conceptos, no solo a un dominio concreto.
 */
export function ensureSection2HasAuthAndMfa(section2Content: string, scopeText: string): string {
  if (!section2Content || typeof section2Content !== "string") return section2Content;
  const scope = (scopeText || "").trim().toLowerCase();
  const hasCredentialAuth = /\b(login|password|credencial|autenticaci[oó]n|usuario\s+y\s+contraseña|hash\s+de\s+contraseña)\b/i.test(scope);
  const hasSecretAuth = /\b(mfa|totp|2fa|google\s+authenticator|segundo\s+factor|secreto\s+(de\s+)?(mfa|totp))\b/i.test(scope);
  if (!hasCredentialAuth && !hasSecretAuth) return section2Content;

  const sqlBlockMatch = section2Content.match(/```sql\s*([\s\S]*?)```/);
  if (!sqlBlockMatch) return section2Content;
  let sql = sqlBlockMatch[1];
  const beforeSql = section2Content.slice(0, sqlBlockMatch.index);
  const afterSql = section2Content.slice((sqlBlockMatch.index ?? 0) + sqlBlockMatch[0].length);
  let changed = false;

  if (hasCredentialAuth && !/\b(password_hash|credential_hash|password_hash)\b/i.test(sql)) {
    const usersMatch = sql.match(/CREATE\s+TABLE\s+users\s*\([\s\S]*?\)\s*;/i);
    if (usersMatch) {
      const block = usersMatch[0];
      if (!/\bpassword_hash\b/i.test(block)) {
        const withHash = block.replace(
          /(\n\s*created_at\s+TIMESTAMPTZ[^\n]*)/i,
          "  password_hash VARCHAR(255) NOT NULL,\n$1",
        );
        if (withHash === block) {
          sql = sql.replace(block, block.replace(/(\)\s*;)\s*$/, "  password_hash VARCHAR(255) NOT NULL,\n$1"));
        } else {
          sql = sql.replace(block, withHash);
        }
        changed = true;
      }
    }
  }
  if (hasSecretAuth && !/\b(mfa_secrets|totp_secret|mfa_secret|otp_secret)\b/i.test(sql)) {
    const userTable = /CREATE\s+TABLE\s+(users|usuarios|user)\s*\(/i.exec(sql)?.[1] ?? "users";
    const mfaTable =
      `\n\nCREATE TABLE mfa_secrets (\n  user_id UUID NOT NULL REFERENCES ${userTable}(id) ON DELETE CASCADE,\n  totp_secret VARCHAR(255) NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  PRIMARY KEY (user_id)\n);`;
    sql = sql.trimEnd() + mfaTable;
    changed = true;
  }
  if (!changed) return section2Content;
  return beforeSql + "```sql\n" + sql + "\n```" + afterSql;
}

/**
 * Formatea el contenido de un bloque ```sql al formato canónico:
 * - Una columna por renglón.
 * - 2 espacios antes del nombre de cada columna.
 * - Sin líneas en blanco entre columna y columna.
 * - Cierre ); en línea propia.
 */
export function formatSqlBlockWithNewlines(sqlContent: string): string {
  if (!sqlContent || typeof sqlContent !== "string") return sqlContent;
  let out = sqlContent.trim();
  // Separar tablas: ); CREATE TABLE → ); \n\n CREATE TABLE
  out = out.replace(/\)\s*;\s*CREATE\s+TABLE/gi, ");\n\nCREATE TABLE");
  out = out.replace(/\)\s*;\s*\n\s*(?=CREATE\s+TABLE)/gi, "\n);\n\n");
  out = out.replace(/\s*\)\s*;\s*$/, "\n);\n");

  // Apertura: CREATE TABLE name ( → CREATE TABLE name (\n  (para que la primera columna quede en su línea)
  out = out.replace(
    /(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-zA-Z_][a-zA-Z0-9_]*\s*)\(\s*/gi,
    "$1(\n  "
  );

  // Partir columnas que están en la misma línea: coma seguida de nombre de columna (identifier) → nueva línea + 2 espacios
  // Así no partimos tipos como decimal(10, 2) ni REFERENCES table(id).
  out = out.replace(/,\s*(?=[a-zA-Z_][a-zA-Z0-9_]*\s)/g, ",\n  ");

  // Quitar líneas en blanco entre columnas: ",\n\n" o ",\n  \n" → ",\n  "
  out = out.replace(/,\s*\n\s*\n+\s*/g, ",\n  ");

  // Asegurar 2 espacios antes de la primera columna tras (
  out = out.replace(/(\(\n)\s*([a-zA-Z_][a-zA-Z0-9_]*\s+)/g, "$1  $2");

  // Por línea: quitar líneas en blanco y normalizar columnas a "  " + contenido
  const lines = out.split("\n");
  const normalized: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === "") continue;
    if (t === ");" || /^CREATE\s+TABLE\s+/i.test(t)) {
      normalized.push(t);
    } else if (/^[a-zA-Z_][a-zA-Z0-9_]*\s+/.test(t)) {
      normalized.push("  " + t);
    } else {
      normalized.push(line);
    }
  }
  out = normalized.join("\n");

  // Cierre: ); en línea propia
  out = out.replace(/\s*\)\s*;/g, "\n);");
  return out;
}

/**
 * Corrige en la sección 2: (1) SQL no cerrado con ``` antes de ### Diagrama o ```mermaid;
 * (2) encabezado pegado "### Diagrama entidad-relaciónmermaid" → cierre sql + título + apertura ```mermaid.
 */
function fixSection2UnclosedSqlAndGluedMermaid(draft: string): string {
  const modeloHeading = "## 3. Modelo de Datos";
  const modeloIdx = draft.indexOf(modeloHeading);
  if (modeloIdx === -1) return draft;
  const sectionStart = modeloIdx + modeloHeading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  let newBody = body
    .replace(/\);\s*###\s*Diagrama entidad-relaciónmermaid/gi, ");\n```\n\n### Diagrama entidad-relación\n\n```mermaid")
    .replace(/\);\s*###\s*Diagrama\b/gi, ");\n```\n\n### Diagrama")
    .replace(/\);\s*```mermaid/gi, ");\n```\n\n```mermaid")
    .replace(/###\s*Diagrama entidad-relaciónmermaid/gi, "### Diagrama entidad-relación\n\n```mermaid");
  if (newBody === body) return draft;
  const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
  return draft.slice(0, sectionStart) + newBody + afterSection;
}

/**
 * Asegura que el bloque ```sql de la sección 2 esté cerrado con ``` antes de ```mermaid, ```TechnicalMetadata o ###.
 * Así formatSqlBlockWithNewlines puede encontrar el bloque y formatear columnas por línea.
 */
function ensureSection2SqlBlockClosed(draft: string): string {
  const modeloHeading = "## 3. Modelo de Datos";
  const modeloIdx = draft.indexOf(modeloHeading);
  if (modeloIdx === -1) return draft;
  const sectionStart = modeloIdx + modeloHeading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  const sqlMatch = body.match(/```sql\s*/i);
  if (!sqlMatch || sqlMatch.index == null) return draft;
  const sqlOpen = sqlMatch.index + sqlMatch[0].length;
  const afterSql = body.slice(sqlOpen);
  const nextFence = afterSql.search(/```/);
  if (nextFence === -1) {
    const beforeDiagram = afterSql.search(/\n###\s*Diagrama|\n```(?:mermaid|TechnicalMetadata)/i);
    if (beforeDiagram === -1) return draft;
    const insertPos = sqlOpen + beforeDiagram;
    const newBody = body.slice(0, insertPos) + "\n```\n\n" + body.slice(insertPos);
    const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
    return draft.slice(0, sectionStart) + newBody + afterSection;
  }
  const fencePosInBody = sqlOpen + nextFence;
  const afterBackticks = body.slice(fencePosInBody + 3, fencePosInBody + 20);
  const isClosingFence = /^\s*\n|^\s*$/.test(afterBackticks) || afterBackticks === "";
  if (isClosingFence) return draft;
  const isOpenOfOther = /^\s*mermaid|^\s*TechnicalMetadata|^\s*sql\s/i.test(afterBackticks);
  if (!isOpenOfOther) return draft;
  const newBody = body.slice(0, fencePosInBody) + "\n```\n\n" + body.slice(fencePosInBody);
  const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
  return draft.slice(0, sectionStart) + newBody + afterSection;
}

/**
 * Asegura que en la sección 2 el bloque ```sql tenga saltos de línea (cada CREATE TABLE y cada columna).
 * Si el bloque no está cerrado con ```, lo cierra antes de ### Diagrama o ```mermaid/TechnicalMetadata y luego formatea.
 */
function ensureSection2SqlFormattedInSection(draft: string): string {
  let sqlBlockMatch = draft.match(/```sql\s*([\s\S]*?)```/);
  let sqlStart = 0;
  let inner = "";
  let sqlEnd = 0;

  if (sqlBlockMatch && sqlBlockMatch.index != null) {
    sqlStart = sqlBlockMatch.index;
    inner = sqlBlockMatch[1];
    sqlEnd = sqlBlockMatch.index + sqlBlockMatch[0].length;
  } else {
    const openMatch = draft.match(/```sql\s*/i);
    if (!openMatch || openMatch.index == null) return draft;
    const afterOpen = draft.slice(openMatch.index + openMatch[0].length);
    const endMatch = afterOpen.match(/\n(```(?:mermaid|TechnicalMetadata)|\s*###\s*Diagrama)/i);
    const endPos = endMatch ? endMatch.index! : afterOpen.length;
    inner = afterOpen.slice(0, endPos).trimEnd();
    if (!inner || !/CREATE\s+TABLE/i.test(inner)) return draft;
    sqlStart = openMatch.index;
    sqlEnd = openMatch.index + openMatch[0].length + endPos;
  }

  const formatted = formatSqlBlockWithNewlines(inner);
  const before = draft.slice(0, sqlStart + "```sql\n".length);
  const after = draft.slice(sqlEnd);
  return before + formatted + "\n```\n\n" + after;
}

/**
 * Corrige formato de sección Integración cuando el LLM devolvió cada línea como viñeta (ej. "- ### 6.1" -> "### 6.1").
 */
export function fixIntegrationSectionBullets(sectionBody: string): string {
  if (!sectionBody || typeof sectionBody !== "string") return sectionBody;
  return sectionBody
    .replace(/^-\s*(###\s)/gm, "$1")
    .replace(/^-\s*(\*\*[^*]+\*\*:)/gm, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convierte cuerpo de §6 que es JSON con viñetas (ej. "- \"## Seguridad\": { - \"Key\": \"value\" - }")
 * a markdown legible (### Key, - value). Devuelve null si no aplica o el parse falla.
 */
function fixSection6BulletedJsonToMarkdown(sectionBody: string): string | null {
  if (!sectionBody || typeof sectionBody !== "string") return null;
  let trimmed = sectionBody
    .replace(/^\s*\{:?\s*\n?/, "")
    .replace(/(\n\s*-\s*)+$/, "")
    .replace(/\n\s*---\s*$/, "")
    .trim();
  trimmed = trimmed
    .replace(/\n\s*-\s*}\s*\n\s*-\s*}\s*$/, "\n}\n}")
    .replace(/\n\s*-\s*}\s*$/, "\n}")
    .replace(/\n\s*-\s*}\s*(?=\n)/g, "\n}\n")
    .trim();
  const candidate = unbulletAndJoinForJson(trimmed);
  const firstBrace = candidate.indexOf("{");
  if (firstBrace === -1) return null;
  const braceEnd = findBalancedBraceRespectingStrings(candidate, firstBrace);
  if (braceEnd === -1) return null;
  try {
    const jsonStr = candidate.slice(firstBrace, braceEnd + 1);
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const inner = obj["## Seguridad"] ?? obj["6. Seguridad"] ?? obj["6.Seguridad"];
    const toConvert =
      inner !== null && typeof inner === "object" && !Array.isArray(inner)
        ? (inner as Record<string, unknown>)
        : obj;
    const md = nestedSectionKeysToMarkdown(toConvert);
    return md || null;
  } catch {
    return null;
  }
}

/**
 * Corrige formato de sección 6 Seguridad cuando el LLM devolvió subsecciones como viñetas (ej. "- 6.1 X" -> "### 6.1 X").
 */
function fixSecuritySectionBullets(sectionBody: string): string {
  if (!sectionBody || typeof sectionBody !== "string") return sectionBody;
  return sectionBody
    .replace(/^-\s*##\s*6\.\s*Seguridad\s*$/gim, "")
    .replace(/^-\s*(6\.\d+\s+[^\n]*)$/gm, "### $1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Si el cuerpo de la sección Integración tiene un manifest JSON con stack no vacío y sin "pending",
 * reemplaza encabezados "### Nota/Pendiente", "### Nota", "### Pendiente" por "### Manifest de Infraestructura".
 * Así no se etiqueta como pendiente cuando el manifest ya está definido.
 */
export function stripNotaPendienteHeadingInIntegrationSection(sectionBody: string): string {
  if (!sectionBody || typeof sectionBody !== "string") return sectionBody;
  const jsonMatch = sectionBody.match(/```json\s*\n([\s\S]*?)```/);
  if (!jsonMatch?.[1]) return sectionBody;
  try {
    const obj = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    const stack = obj.stack;
    const pending = obj.pending;
    const hasStack = Array.isArray(stack) && stack.length > 0;
    const hasNoPending = pending == null || (typeof pending === "string" && !pending.trim());
    if (!hasStack || !hasNoPending) return sectionBody;
  } catch {
    return sectionBody;
  }
  return sectionBody
    .replace(/###\s*Nota\s*\/\s*Pendiente\s*$/gim, "### Manifest de Infraestructura")
    .replace(/###\s*Nota\s*\/?\s*Pendiente\s*$/gim, "### Manifest de Infraestructura")
    .replace(/###\s*Pendiente\s*$/gim, "### Manifest de Infraestructura")
    .replace(/###\s*Nota\s*$/gim, "### Manifest de Infraestructura");
}

/**
 * Si la sección 7 (Infraestructura) tiene ###/#### Manifest seguido de "stack"/"pending" sin ```json
 * (o como lista - "stack": [] / - "pending": "..."), lo envuelve en ```json válido.
 */
export function ensureManifestInJsonBlock(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  const infrHeading = draft.search(/\n##\s+(?:7\.\s+)?(?:Infraestructura|Integración)\b/i);
  if (infrHeading === -1) return draft;
  const sectionStart = draft.indexOf("\n", infrHeading) + 1;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  const manifestMatch = body.match(/\n(#{3,4})\s+Manifest\s*\n+/i);
  if (!manifestMatch || manifestMatch.index == null) return draft;
  const manifestH3 = manifestMatch.index;
  const afterManifest = body.slice(manifestH3 + manifestMatch[0].length).trim();
  if (/```json\s/i.test(afterManifest.slice(0, 100))) return draft;
  // Si el contenido es JSON crudo (empieza con {), envolver en ```json
  if (afterManifest.startsWith("{")) {
    const braceEnd = findBalancedBrace(afterManifest, 0);
    if (braceEnd !== -1) {
      try {
        const obj = JSON.parse(afterManifest.slice(0, braceEnd + 1)) as Record<string, unknown>;
        const jsonBlock = "```json\n" + JSON.stringify(obj, null, 2) + "\n```";
        const restAfter = afterManifest.slice(braceEnd + 1).trim();
        const beforeManifest = body.slice(0, manifestH3) + "\n### Manifest\n\n";
        const newBody = beforeManifest + jsonBlock + (restAfter ? "\n\n" + restAfter : "");
        return draft.slice(0, sectionStart) + newBody + draft.slice(sectionStart + body.length);
      } catch {
        /* fall through to stack/pending extraction */
      }
    }
  }
  // Contenido en líneas sueltas o lista: "stack": [] / "pending": "..."
  const raw = afterManifest.replace(/^-\s*/gm, "").replace(/\n-\s*/g, "\n");
  const stackMatch = raw.match(/"stack"\s*:\s*(\[[\s\S]*?\])/);
  const pendingMatch = raw.match(/"pending"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!stackMatch && !pendingMatch) return draft;
  let stack: unknown[] = [];
  if (stackMatch) {
    try {
      stack = JSON.parse(stackMatch[1].replace(/\s+/g, " "));
    } catch {
      stack = [];
    }
  }
  const pending = pendingMatch ? pendingMatch[1].replace(/\\"/g, '"') : "Definir con el usuario: orquestación y despliegue";
  const jsonBlock = "```json\n" + JSON.stringify({ stack, pending }, null, 2) + "\n```";
  const beforeManifest = body.slice(0, manifestH3) + "\n### Manifest\n\n";
  const afterManifestEnd = afterManifest.search(/\n#{3,4}\s+|\n##\s+|$/);
  const restAfter = afterManifestEnd !== -1 ? afterManifest.slice(afterManifestEnd) : "";
  const newBody = beforeManifest + jsonBlock + (restAfter ? "\n\n" + restAfter.trim() : "");
  const bodyEnd = sectionStart + body.length;
  return draft.slice(0, sectionStart) + newBody + draft.slice(bodyEnd);
}

/**
 * Aplica stripNotaPendienteHeadingInIntegrationSection al cuerpo de ## 7. Infraestructura / ## Integración.
 */
export function stripNotaPendienteHeadingWhenManifestComplete(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  const match = draft.match(/\n(##\s+(?:7\.\s+)?(?:Infraestructura|Integración)\b[^\n]*)/i);
  if (!match || match.index == null) return draft;
  const sectionStart = match.index + match[0].length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  const newBody = stripNotaPendienteHeadingInIntegrationSection(body);
  if (newBody === body) return draft;
  const sectionEnd = nextH2 !== -1 ? sectionStart + nextH2 : draft.length;
  return draft.slice(0, sectionStart) + newBody + draft.slice(sectionEnd);
}

/** Busca una clave en obj de forma case-insensitive. */
function getKeyIgnoreCase(obj: Record<string, unknown>, key: string): string | undefined {
  const lower = key.toLowerCase();
  const found = Object.keys(obj).find((k) => k.toLowerCase() === lower);
  return found;
}

/**
 * Convierte un objeto JSON a título + viñetas: acepta { section|heading + details } o { title + content }.
 * Lectura de claves case-insensitive (Title, Content, etc.).
 */
function jsonBlockToMarkdownLines(obj: Record<string, unknown>): { title: string; items: string[] } | null {
  const titleKey = getKeyIgnoreCase(obj, "title") ?? getKeyIgnoreCase(obj, "section") ?? getKeyIgnoreCase(obj, "heading");
  const title = titleKey != null && typeof obj[titleKey] === "string" ? String(obj[titleKey]).trim() : null;
  const contentKey = getKeyIgnoreCase(obj, "content") ?? getKeyIgnoreCase(obj, "details");
  const arr = contentKey != null && Array.isArray(obj[contentKey]) ? obj[contentKey] : null;
  if (!title || !arr) return null;
  const items = arr.map((d) => (typeof d === "string" ? d : String(d)).trim()).filter(Boolean);
  return { title, items };
}

/**
 * Convierte bloques JSON con forma { "section"|"heading"|"title": "...", "details"|"content": ["..."] } a markdown (### título, - ítem).
 * También acepta un único objeto { "sections": [ { title, content }, ... ] }.
 * Usado cuando el LLM devuelve Seguridad como varios objetos JSON en lugar de markdown.
 */
function convertSectionDetailsJsonToMarkdown(body: string): string {
  const trimmedBody = body.replace(/^\s*###\s*sections\s*\n+/i, "").trim();

  // Formato: único objeto con clave "sections" (array de { title, content })
  const firstBrace = trimmedBody.indexOf("{");
  if (firstBrace !== -1) {
    const braceEnd = findBalancedBrace(trimmedBody, firstBrace);
    if (braceEnd !== -1) {
      try {
        const singleJson = trimmedBody.slice(firstBrace, braceEnd + 1);
        const obj = JSON.parse(singleJson) as Record<string, unknown>;
        const sectionsKey = getKeyIgnoreCase(obj, "sections");
        const sections = sectionsKey != null && Array.isArray(obj[sectionsKey]) ? obj[sectionsKey] : null;
        if (sections && sections.length > 0) {
          const sectionLines: string[] = [];
          for (const item of sections) {
            if (!item || typeof item !== "object" || Array.isArray(item)) continue;
            const parsed = jsonBlockToMarkdownLines(item as Record<string, unknown>);
            if (parsed) {
              sectionLines.push("", `### ${parsed.title}`, "");
              for (const i of parsed.items) sectionLines.push(`- ${i}`);
            }
          }
          if (sectionLines.length > 0) return sectionLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        }
      } catch {
        // fall through to per-object parsing
      }
    }
  }

  const result: string[] = [];
  const jsonStart = /\{\s*"(?:section|heading|title)"\s*:/i;
  let remaining = trimmedBody;
  let braceStart = remaining.search(jsonStart);
  while (braceStart !== -1) {
    const before = remaining.slice(0, braceStart).trim();
    if (before) result.push(before);
    const braceEnd = findBalancedBrace(remaining, braceStart);
    if (braceEnd === -1) break;
    try {
      const jsonStr = remaining.slice(braceStart, braceEnd + 1);
      const obj = JSON.parse(jsonStr) as Record<string, unknown>;
      const parsed = jsonBlockToMarkdownLines(obj);
      if (parsed) {
        result.push("", `### ${parsed.title}`, "");
        for (const item of parsed.items) result.push(`- ${item}`);
      }
      remaining = remaining.slice(braceEnd + 1).replace(/^\s*\n+/, "\n");
    } catch {
      remaining = remaining.slice(braceStart + 1);
    }
    braceStart = remaining.search(jsonStart);
  }
  if (remaining.trim()) result.push(remaining.trim());
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Convierte un body que es (o empieza con) un objeto JSON cuyas claves son headings markdown ("### Flujo de integración", etc.)
 * a markdown legible: cada clave → ### Título (sin duplicar ###), valor como párrafo o lista/objeto legible.
 */
function convertIntegrationHeadingKeysObjectToMarkdown(body: string): string {
  let trimmed = body.replace(/^\s*###\s*##\s*Integración\s*\n+/i, "").trim();
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1 || !trimmed.includes('"')) return body;
  const braceEnd = findBalancedBrace(trimmed, firstBrace);
  if (braceEnd === -1) return body;
  try {
    const jsonStr = trimmed.slice(firstBrace, braceEnd + 1);
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const keys = Object.keys(obj);
    const hasHeadingKeys = keys.some((k) => k.includes("###"));
    if (!hasHeadingKeys) return body;
    const lines: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      const heading = key.trim().startsWith("###") ? key.trim() : `### ${key}`;
      lines.push("", heading, "");
      if (typeof val === "string") {
        lines.push(val.trim());
      } else if (Array.isArray(val)) {
        for (const item of val) lines.push(typeof item === "string" ? `- ${item}` : `- ${JSON.stringify(item)}`);
      } else if (val !== null && typeof val === "object") {
        const rec = val as Record<string, unknown>;
        if (rec.stack !== undefined || rec.pending !== undefined) {
          if (Array.isArray(rec.stack)) lines.push("- **stack:** " + (rec.stack.length ? rec.stack.join(", ") : "[]"));
          if (typeof rec.pending === "string" && rec.pending.trim()) lines.push("- **pending:** " + rec.pending.trim());
        } else {
          lines.push("```json\n" + JSON.stringify(val, null, 2) + "\n```");
        }
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return body;
  }
}

/**
 * Detecta si el body está "contaminado": lista de viñetas donde cada línea es un fragmento de JSON
 * (ej. " - {", " - \"title\": \"## Seguridad\",", " - \"content\": [") en vez de un bloque JSON parseable.
 */
function isBulletListAsJsonLines(body: string): boolean {
  const trimmed = body.replace(/^\s*\n+/, "").trim();
  const lines = trimmed.split(/\n/);
  const bulletLines = lines.filter((line) => /^\s*-\s+/.test(line));
  if (bulletLines.length < 3) return false;
  const rest = bulletLines.map((l) => l.replace(/^\s*-\s*/, "").trim()).join(" ");
  const hasTitleOrHeading = /"title"\s*:/i.test(rest) || /"heading"\s*:/i.test(rest);
  const hasContentOrDetails = /"content"\s*:\s*\[/i.test(rest) || /"details"\s*:\s*\[/i.test(rest);
  const hasNestedSectionKeys = /"\s*6\.\s*Seguridad"\s*:\s*\{/i.test(rest) || /"\s*6\.\d+\s+/.test(rest);
  const hasDescriptionMeasures =
    /"description"\s*:/i.test(rest) || /"measures"\s*:\s*\[/i.test(rest) || /"considerations"\s*:\s*\[/i.test(rest);
  return (hasTitleOrHeading && hasContentOrDetails) || hasNestedSectionKeys || (rest.includes("{") && hasDescriptionMeasures);
}

/**
 * Quita el prefijo de viñeta de cada línea y opcionalmente inserta comas para obtener JSON válido
 * (entre } y { o ] y { que suelen faltar cuando el JSON fue volcado línea a línea).
 */
export function unbulletAndJoinForJson(body: string): string {
  const lines = body.split(/\n/);
  const unbulleted = lines.map((line) => line.replace(/^\s*-\s*/, "").trim());
  let joined = unbulleted.join("\n");
  // Insert comma between } or ] and newline and { (array/object elements)
  joined = joined.replace(/\}\s*\n\s*\{/g, "},\n{");
  joined = joined.replace(/\]\s*\n\s*\{/g, "],\n{");
  // Comma between ] or } and newline and " (next key in object)
  joined = joined.replace(/\]\s*\n\s*"/g, "],\n\"");
  joined = joined.replace(/\}\s*\n\s*"/g, "},\n\"");
  return joined;
}

/**
 * Convierte un objeto raíz con "content" como array de objetos { heading/title, details/content }
 * a markdown (### título + viñetas). Usado cuando el JSON contaminado tiene esa forma.
 */
function objectWithContentArrayToMarkdown(obj: Record<string, unknown>): string | null {
  const contentKey = getKeyIgnoreCase(obj, "content");
  const content = contentKey != null ? obj[contentKey] : undefined;
  if (!Array.isArray(content) || content.length === 0) return null;
  const first = content[0];
  const isArrayOfObjects =
    typeof first === "object" && first !== null && !Array.isArray(first);
  if (!isArrayOfObjects) return null;
  const sectionLines: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const parsed = jsonBlockToMarkdownLines(rec);
    if (parsed) {
      const heading = parsed.title.replace(/^#+\s*/, "").trim();
      sectionLines.push("", `### ${heading}`, "");
      for (const i of parsed.items) sectionLines.push(`- ${i}`);
    }
  }
  if (sectionLines.length === 0) return null;
  return sectionLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Convierte objeto con claves tipo "6. Seguridad": { "6.1 X": { "A": "texto" }, "6.2 Y": {...} } a markdown (### 6.1 X, - **A**: texto). */
function nestedSectionKeysToMarkdown(obj: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const heading = key.trim().startsWith("###") ? key.trim() : `### ${key}`;
    lines.push("", heading, "");
    if (Array.isArray(val)) {
      for (const item of val) lines.push(typeof item === "string" ? `- ${item}` : `- ${JSON.stringify(item)}`);
    } else if (typeof val === "string" && val.trim()) {
      lines.push(`- ${val.trim()}`);
    } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const rec = val as Record<string, unknown>;
      const allStrings = Object.values(rec).every((v) => typeof v === "string");
      if (allStrings && Object.keys(rec).length > 0) {
        for (const [k, v] of Object.entries(rec))
          if (typeof v === "string" && v.trim()) lines.push(`- **${k}**: ${v.trim()}`);
      } else {
        const nested = nestedSectionKeysToMarkdown(rec);
        if (nested) lines.push(nested);
      }
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Convierte objeto con description (string), measures y considerations (array de { name, details }) a markdown.
 * Formato típico del nodo Security cuando devuelve JSON en viñetas.
 */
function descriptionMeasuresConsiderationsToMarkdown(obj: Record<string, unknown>): string | null {
  const lines: string[] = [];
  const desc = obj.description;
  if (typeof desc === "string" && desc.trim()) {
    lines.push(desc.trim(), "");
  }
  const measures = Array.isArray(obj.measures) ? obj.measures : [];
  for (const m of measures) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const rec = m as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "Medida";
    const details = typeof rec.details === "string" ? rec.details : String(rec.details ?? "").trim();
    lines.push("### " + name, "", details ? `- ${details}` : "", "");
  }
  const considerations = Array.isArray(obj.considerations) ? obj.considerations : [];
  for (const c of considerations) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const rec = c as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "Consideración";
    const details = typeof rec.details === "string" ? rec.details : String(rec.details ?? "").trim();
    lines.push("### " + name, "", details ? `- ${details}` : "", "");
  }
  if (lines.length === 0) return null;
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Descontamina un body que es "bullet list as JSON lines": quita prefijo de viñeta, reconstruye JSON,
 * parsea y convierte a markdown. Devuelve null si no aplica o el parse falla.
 */
function unbulletAndParseSectionJson(body: string): string | null {
  const trimmed = body.replace(/^\s*###\s*sections\s*\n+/i, "").trim().replace(/^\s*###\s*Seguridad\s*\n+/i, "").trim();
  const candidate = unbulletAndJoinForJson(trimmed);
  try {
    const firstBrace = candidate.indexOf("{");
    if (firstBrace === -1) return null;
    const braceEnd = findBalancedBraceRespectingStrings(candidate, firstBrace);
    if (braceEnd === -1) return null;
    const jsonStr = candidate.slice(firstBrace, braceEnd + 1);
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const descMeasures = descriptionMeasuresConsiderationsToMarkdown(obj);
    if (descMeasures) return descMeasures;
    const withContentArray = objectWithContentArrayToMarkdown(obj);
    if (withContentArray) return withContentArray;
    const sectionsKey = getKeyIgnoreCase(obj, "sections");
    const sections = sectionsKey != null && Array.isArray(obj[sectionsKey]) ? obj[sectionsKey] : null;
    if (sections && sections.length > 0) {
      const sectionLines: string[] = [];
      for (const item of sections) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const parsed = jsonBlockToMarkdownLines(item as Record<string, unknown>);
        if (parsed) {
          sectionLines.push("", `### ${parsed.title}`, "");
          for (const i of parsed.items) sectionLines.push(`- ${i}`);
        }
      }
      if (sectionLines.length > 0) return sectionLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    const singleBlock = jsonBlockToMarkdownLines(obj);
    if (singleBlock) {
      const lines: string[] = ["", `### ${singleBlock.title}`, ""];
      for (const i of singleBlock.items) lines.push(`- ${i}`);
      return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    if (/"6\.\s*Seguridad"/i.test(jsonStr) || Object.keys(obj).some((k) => /^\d+\.\d+\s/.test(k) || /^6\.\s*Seguridad$/i.test(k))) {
      const nested = nestedSectionKeysToMarkdown(obj);
      if (nested) return nested;
      const inner = obj["6. Seguridad"] ?? obj["6.Seguridad"];
      if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
        const innerMd = nestedSectionKeysToMarkdown(inner as Record<string, unknown>);
        if (innerMd) return innerMd;
      }
    }
  } catch {
    // parse failed
  }
  return null;
}

/** Busca la primera ocurrencia de ## Heading que esté al inicio del documento o tras un salto de línea (evita matchear dentro de sección 2). */
function findSectionStart(draft: string, heading: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)(${escaped})\\b`);
  const match = draft.match(re);
  if (!match || match.index == null) return -1;
  return match.index + (match[0].startsWith("\n") ? 1 : 0);
}

/** Busca una sección por el primero de varios headings (ej. "## 6. Seguridad" o "## Seguridad"). */
function findSectionStartAny(draft: string, headings: string[]): { index: number; heading: string } | null {
  let best: { index: number; heading: string } | null = null;
  for (const h of headings) {
    const idx = findSectionStart(draft, h);
    if (idx !== -1 && (best == null || idx < best.index)) best = { index: idx, heading: h };
  }
  return best;
}

/**
 * En secciones ## Seguridad y ## Integración, reemplaza viñetas que son JSON crudo (ej. "- {\"subsections\":[...]}")
 * o bloques { "section"|"heading"|"title": "...", "details"|"content": [...] } por markdown legible (### título, - ítem).
 * Para ## Integración también convierte objeto con claves "### Flujo de integración", etc.
 */
const SEGURIDAD_HEADINGS = ["## 6. Seguridad", "## Seguridad"];
const INTEGRACION_HEADINGS = ["## 7. Infraestructura", "## Integración"];

export function sanitizeSeguridadIntegracionRawJson(draft: string): string {
  let out = draft;
  for (const [headings, isIntegration] of [
    [SEGURIDAD_HEADINGS, false] as const,
    [INTEGRACION_HEADINGS, true] as const,
  ]) {
    const found = findSectionStartAny(out, headings as string[]);
    if (!found) continue;
    const { index: idx, heading } = found;
    const sectionStart = idx + heading.length;
    const rest = out.slice(sectionStart);
    const nextH2 = rest.search(/\n##\s+/);
    const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
    const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";

    if (isIntegration) {
      const bodyTrimmed = body.replace(/^\s*\n+/, "").trim().replace(/^###\s*##\s*Integración\s*\n+/i, "").trim();
      const hasIntegrationHeadingKeysJson =
        bodyTrimmed.startsWith("{") && /"\s*###\s+[^"]+"\s*:/.test(bodyTrimmed);
      if (hasIntegrationHeadingKeysJson) {
        const newBody = convertIntegrationHeadingKeysObjectToMarkdown(body);
        out = out.slice(0, sectionStart) + "\n\n" + newBody + afterSection;
        continue;
      }
    }

    // Bloques JSON: section/heading/details, title/content, { "sections": [...] }, o "### sections" + objetos { title, content }
    const hasSectionHeadingJson = /\{\s*"(?:section|heading)"\s*:/i.test(body);
    const hasTitleContentJson = /\{\s*"title"\s*:/i.test(body) && /\b"content"\s*:\s*\[/.test(body);
    const hasSectionsArrayJson = /\{\s*"sections"\s*:\s*\[/i.test(body);
    const hasSectionsHeadingWithTitleContent =
      /###\s*sections/i.test(body) && /"title"\s*:/.test(body) && /"content"\s*:/.test(body);
    if (hasSectionHeadingJson || hasTitleContentJson || hasSectionsArrayJson || hasSectionsHeadingWithTitleContent) {
      const newBody = convertSectionDetailsJsonToMarkdown(body);
      out = out.slice(0, sectionStart) + "\n\n" + newBody + afterSection;
      continue;
    }
    const bulletStart = body.search(/^-\s*\{\s*"subsections"\s*:/m);
    if (bulletStart !== -1) {
      const braceStart = body.indexOf("{", bulletStart);
      const braceEnd = findBalancedBrace(body, braceStart);
      if (braceEnd !== -1) {
        try {
          const jsonStr = body.slice(braceStart, braceEnd + 1);
          const obj = JSON.parse(jsonStr) as Record<string, unknown>;
          const subMd = subsectionsToMarkdown(obj);
          if (subMd) {
            const newBody = body.slice(0, bulletStart) + subMd + body.slice(braceEnd + 1).replace(/^\s*\n?/, "\n\n");
            out = out.slice(0, sectionStart) + newBody + afterSection;
            continue;
          }
        } catch {
          // fall through to bullet-list-as-JSON-lines
        }
      }
    }

    // Bullet list as JSON lines (contaminated: each line is a bullet with a JSON fragment)
    if (isBulletListAsJsonLines(body)) {
      const newBody = unbulletAndParseSectionJson(body);
      if (newBody != null) {
        out = out.slice(0, sectionStart) + "\n\n" + newBody + afterSection;
      }
    }
  }
  return out;
}

const CONTEXTO_JSON_KEY_LABELS: Record<string, string> = {
  objective: "Objetivo",
  goal: "Objetivo",
  audience: "Audiencia",
  includeMetadata: "Incluir metadatos",
  scope: "Alcance",
  technologies: "Tecnologías",
  techStack: "Stack tecnológico",
  focus: "Enfoque",
  requirements: "Requisitos",
  keyCompetitors: "Competidores de referencia",
  keyFeatures: "Características clave",
  marketOpportunities: "Oportunidades de mercado",
};

/**
 * Si la sección "## 1. Contexto" (o "## 1. Contexto y alcance") contiene un bloque JSON,
 * lo reemplaza por viñetas en markdown. Arrays → sublista con guiones. Evita JSON crudo en §1.
 */
const CONTEXTO_HEADINGS = ["## 1. Contexto y alcance", "## 1. Contexto", "## Contexto y alcance"];

function contextJsonValueToMarkdown(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) {
    return v
      .filter((item) => item != null && String(item).trim() !== "")
      .map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)))
      .map((s) => `  - ${s}`)
      .join("\n");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function sanitizeContextSection(draft: string): string {
  let idx = -1;
  let heading = "";
  for (const h of CONTEXTO_HEADINGS) {
    const i = draft.indexOf(h);
    if (i !== -1) {
      idx = i;
      heading = h;
      break;
    }
  }
  if (idx === -1) return draft;
  const sectionStart = idx + heading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = (nextH2 !== -1 ? rest.slice(0, nextH2) : rest).replace(/^\s*\n+/, "").trim();
  const braceInBody = body.indexOf("{");
  if (braceInBody === -1 || !body.includes('"')) return draft;
  const endOfSection = nextH2 !== -1 ? sectionStart + nextH2 : draft.length;
  const start = draft.indexOf("{", sectionStart);
  if (start < sectionStart || start >= endOfSection) return draft;
  let depth = 0;
  let end = start;
  for (let i = start; i < endOfSection; i++) {
    const c = draft[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (depth !== 0) return draft;
  try {
    const jsonStr = draft.slice(start, end);
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const bullets = Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        const label = CONTEXTO_JSON_KEY_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1").trim();
        const val = contextJsonValueToMarkdown(v);
        if (val.includes("\n")) return `- **${label}:**\n${val}`;
        return `- **${label}:** ${val}`;
      })
      .join("\n");
    return draft.slice(0, start) + bullets + draft.slice(end);
  } catch {
    return draft;
  }
}

/**
 * En la sección "## 1. Contexto y alcance": reemplaza [object Object] por texto legible y convierte
 * viñetas key: value (objective, technologies, focus, requirements) en prosa breve cuando sea solo metadatos.
 */
export function sanitizeContextKeyValueAndObject(draft: string): string {
  const heading = "## 1. Contexto y alcance";
  const idx = draft.indexOf(heading);
  if (idx === -1) return draft;
  const sectionStart = idx + heading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = (nextH2 !== -1 ? rest.slice(0, nextH2) : rest).replace(/^\s*\n+/, "").trim();
  const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
  let newBody = body
    .replace(/\[object\s+Object\]/gi, "(stack tecnológico)")
    .replace(/\*\*technologies:\*\*\s*\[object\s+Object\]/gi, "**Tecnologías:** NestJS, PostgreSQL, React (según alcance).");
  const keyValueBullet = /^-\s+\*\*(objective|technologies|focus|requirements|scope)\*\*[:\s]+/im;
  if (keyValueBullet.test(newBody) && newBody.split(/\n/).length <= 8) {
    const lines = newBody.split(/\n/).map((line) => {
      const m = line.match(/^-\s+\*\*(objective|technologies|focus|requirements|scope)\*\*[:\s]+(.*)$/i);
      if (m) return `- **${m[1].charAt(0).toUpperCase() + m[1].slice(1)}:** ${m[2].trim()}`;
      return line;
    });
    newBody = lines.join("\n");
  }
  return draft.slice(0, sectionStart) + "\n\n" + newBody + (afterSection ? "\n\n" + afterSection : "");
}

const CONTRATOS_PLACEHOLDER =
  "\n\n## 4. Contratos de API\n\n(Falta: definir endpoints con request/response en JSON. El Auditor ha detectado este hueco; en la siguiente iteración se deben completar los contratos.)\n\n";

const CONTEXTO_HEADING = "## 1. Contexto y alcance";
const CONTEXTO_HEADINGS_EXTRACT = ["## 1. Contexto y alcance", "## 1. Contexto", "## Contexto y alcance"];

/** Extrae el cuerpo de la sección "## 1. Contexto" (hasta el siguiente ## o fin). */
export function extractContextSectionBody(draft: string): string | null {
  for (const heading of CONTEXTO_HEADINGS_EXTRACT) {
    const idx = draft.indexOf(heading);
    if (idx === -1) continue;
    const start = idx + heading.length;
    const after = draft.slice(start).replace(/^\s*\n+/, "");
    const nextHeading = after.search(/\n##\s+/);
    const body = nextHeading !== -1 ? after.slice(0, nextHeading).trim() : after.trim();
    return body || null;
  }
  return null;
}

/** Fusiona solo la sección 1 (Contexto y alcance) de newDraft en previousDraft; el resto del documento se mantiene de previousDraft. */
export function mergeSection1IntoDraft(previousDraft: string, newDraft: string): string {
  const section1Body = extractContextSectionBody(newDraft);
  if (!section1Body?.trim()) return previousDraft;
  return replaceContextSectionBody(previousDraft, section1Body);
}

/** Reemplaza el cuerpo de "## 1. Contexto y alcance" en draft por newBody. */
export function replaceContextSectionBody(draft: string, newBody: string): string {
  const idx = draft.indexOf(CONTEXTO_HEADING);
  if (idx === -1) return draft;
  const sectionStart = idx + CONTEXTO_HEADING.length;
  const rest = draft.slice(sectionStart);
  const nextHeadingInRest = rest.search(/\n##\s+/);
  const endOfSection = nextHeadingInRest !== -1 ? sectionStart + nextHeadingInRest : draft.length;
  const afterSection = endOfSection < draft.length ? draft.slice(endOfSection).trimStart() : "";
  return draft.slice(0, sectionStart) + "\n\n" + newBody.trim() + (afterSection ? "\n\n" + afterSection : "");
}

/** Reemplaza el cuerpo de la sección 1 (cualquier variante de título) por newBody. Para regenerar §1 sin depender del título exacto. */
export function replaceSection1BodyFromAnyHeading(draft: string, newBody: string): string {
  for (const heading of CONTEXTO_HEADINGS_EXTRACT) {
    const idx = draft.indexOf(heading);
    if (idx === -1) continue;
    const sectionStart = idx + heading.length;
    const rest = draft.slice(sectionStart);
    const nextHeadingInRest = rest.search(/\n##\s+/);
    const endOfSection = nextHeadingInRest !== -1 ? sectionStart + nextHeadingInRest : draft.length;
    const afterSection = endOfSection < draft.length ? draft.slice(endOfSection).trimStart() : "";
    return draft.slice(0, sectionStart) + "\n\n" + newBody.trim() + (afterSection ? "\n\n" + afterSection : "");
  }
  return draft;
}

const METADATA_KEYS = /^(section\d|toolPreference|diagramFormat|apiFormat|tool\s*:)$/i;

/** Detecta si el cuerpo de Contexto es solo metadatos (section3, toolPreference, etc.) sin prosa sustancial. */
function isContextOnlyMetadata(body: string): boolean {
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const bulletKey = /^-\s*\*\*([^*]+)\*\*[::\s]/;
  let allMetadata = true;
  for (const line of lines) {
    const m = line.match(bulletKey);
    if (m && METADATA_KEYS.test(m[1].trim())) continue;
    if (line.length > 80 || !line.startsWith("-")) {
      allMetadata = false;
      break;
    }
  }
  return allMetadata && lines.length > 0;
}

/** Frases que indican que el "contexto" son instrucciones de conversación, no descripción del sistema. */
const CONTEXTO_INSTRUCTION_PATTERNS = [
  /regenerar\s+el\s+(mdd|master\s+design\s+document)/i,
  /incluir\s+metadatos\s*:\s*s[ií]/i,
  /objetivo\s*:\s*regenerar/i,
  /objetivo\s*:\s*generar\s+el\s+mdd/i,
  /instrucciones?\s*(del\s+usuario|de\s+conversaci[oó]n)/i,
];

/** Si "1. Contexto y alcance" contiene instrucciones de chat (regenerar MDD, incluir metadatos, etc.), reemplaza por placeholder para que se regenere. */
export function replaceContextWhenInstructions(draft: string): string {
  const body = extractContextSectionBody(draft);
  if (!body || body.length < 30) return draft;
  const combined = body.replace(/\s+/g, " ");
  const looksLikeInstructions = CONTEXTO_INSTRUCTION_PATTERNS.some((re) => re.test(combined));
  if (!looksLikeInstructions) return draft;
  return replaceContextSectionBody(
    draft,
    "(El contexto debe describir el **sistema**, la **audiencia** y el **alcance técnico**, no las instrucciones de la conversación. En la siguiente iteración el Clarificador/Arquitecto debe rellenar esta sección con el contexto real del proyecto.)",
  );
}

/** Si "1. Contexto y alcance" contiene solo metadatos (section3, toolPreference, diagramFormat, apiFormat), reemplaza por placeholder. */
export function replaceContextWhenOnlyMetadata(draft: string): string {
  const body = extractContextSectionBody(draft);
  if (!body || !isContextOnlyMetadata(body)) return draft;
  return replaceContextSectionBody(draft, "(Contexto pendiente de definir según alcance.)");
}

/** Si el draft anterior tiene Contexto sustancial y el nuevo tiene uno peor (metadatos/key-value o más corto), preserva el anterior. */
export function preserveContextSectionIfSubstantial(previousDraft: string, newDraft: string): string {
  const prevBody = extractContextSectionBody(previousDraft);
  const newBody = extractContextSectionBody(newDraft);
  if (!prevBody || prevBody.length < 100) return newDraft;
  if (!newBody) return newDraft;
  if (newBody.length >= prevBody.length * 0.8) return newDraft;
  const looksLikeMetadata = /\b(section3|toolPreference|section\d|tool\s*:)\s*[:=]/i.test(newBody) || (newBody.split(/\n/).length <= 3 && newBody.length < 200);
  if (looksLikeMetadata || newBody.length < 80) {
    return replaceContextSectionBody(newDraft, prevBody);
  }
  return newDraft;
}

const ARQUITECTURA_HEADINGS = [/^##\s+2\.\s*Arquitectura\s+y\s*Stack\s*$/im, /^##\s+2\.\s*Arquitectura\s*$/im];

/** Extrae el cuerpo de la sección "## 2. Arquitectura y Stack" (hasta el siguiente ## o fin). */
export function extractArquitecturaSectionBody(draft: string): string | null {
  for (const re of ARQUITECTURA_HEADINGS) {
    re.lastIndex = 0;
    const match = re.exec(draft);
    if (!match) continue;
    const start = match.index + match[0].length;
    const after = draft.slice(start).replace(/^\s*\n+/, "");
    const nextH2 = after.search(/\n##\s+/);
    const body = nextH2 !== -1 ? after.slice(0, nextH2).trim() : after.trim();
    return body || null;
  }
  return null;
}

/** Reemplaza el cuerpo de "## 2. Arquitectura y Stack" en draft por newBody. */
export function replaceArquitecturaSectionBody(draft: string, newBody: string): string {
  for (const re of ARQUITECTURA_HEADINGS) {
    re.lastIndex = 0;
    const match = re.exec(draft);
    if (!match) continue;
    const sectionStart = match.index + match[0].length;
    const rest = draft.slice(sectionStart);
    const nextH2InRest = rest.search(/\n##\s+/);
    const endOfSection = nextH2InRest !== -1 ? sectionStart + nextH2InRest : draft.length;
    const afterSection = endOfSection < draft.length ? draft.slice(endOfSection).trimStart() : "";
    return draft.slice(0, sectionStart) + "\n\n" + newBody.trim() + (afterSection ? "\n\n" + afterSection : "");
  }
  return draft;
}

/** Si el draft anterior tiene §2 sustancial y el nuevo tiene (Pendiente) o muy corto, preserva el anterior. */
export function preserveArquitecturaSectionIfSubstantial(previousDraft: string, newDraft: string): string {
  const prevBody = extractArquitecturaSectionBody(previousDraft);
  const newBody = extractArquitecturaSectionBody(newDraft);
  if (!prevBody || prevBody.length < 80) return newDraft;
  if (!newBody) return newDraft;
  const newIsPlaceholder = /^\s*\(?\s*Pendiente\s*\)?\s*$/i.test(newBody.trim()) || newBody.trim().length < 100;
  if (!newIsPlaceholder) return newDraft;
  return replaceArquitecturaSectionBody(newDraft, prevBody);
}

/**
 * Rellena §1 (Contexto) y §2 (Arquitectura) en mddStructured desde el draft cuando el structured no los tiene.
 * Evita que cualquier agente que haga merge + toMarkdown borre Contexto y Arquitectura por no estar en structured.
 */
export function hydrateStructuredFromDraft(
  prev: MddStructured | null | undefined,
  draft: string,
): MddStructured {
  const base = (prev ?? {}) as MddStructured;
  const trimmed = (draft ?? "").trim();
  if (!trimmed) return base;
  const ctx = extractContextSectionBody(draft);
  const arch = extractArquitecturaSectionBody(draft);
  const out = { ...base };
  if (ctx && ctx.length >= 80 && !(base.contextoAlcance?.trim())) out.contextoAlcance = ctx;
  if (arch && arch.length >= 80 && !(base.arquitecturaStack?.trim())) out.arquitecturaStack = arch;
  return out as MddStructured;
}

const CONTRATOS_BODY_FALTA =
  "(Falta: definir endpoints con request/response en JSON. El Auditor ha detectado este hueco; en la siguiente iteración se deben completar los contratos.)";

/** Cuerpo de sección 3 que es solo el placeholder perezoso (con o sin paréntesis). */
const PENDIENTE_CONTRATOS_REGEX = /^\s*\(?\s*Pendiente:\s*definir\s+endpoints[\s\S]*?\)?\s*$/i;

/**
 * Asegura que el MDD tenga la sección "## 4. Contratos de API" antes de "## 6. Seguridad".
 * Si falta, la inserta con un placeholder. Si existe pero el cuerpo es solo "Pendiente: definir endpoints...", lo reemplaza por el texto "Falta: ...".
 */
export function ensureContratosSection(draft: string): string {
  const trimmed = (draft || "").trim();
  if (!trimmed) return draft;
  const contratosMatch = trimmed.match(/##\s*4\.\s*Contratos de API|##\s*3\.\s*Contratos de API|##\s*Contratos de API/i);
  if (contratosMatch) {
    const idx = trimmed.indexOf(contratosMatch[0]);
    const afterHeading = trimmed.slice(idx + contratosMatch[0].length).replace(/^\s*\n+/, "");
    const nextH2 = afterHeading.search(/\n##\s+/);
    const body = (nextH2 !== -1 ? afterHeading.slice(0, nextH2) : afterHeading).trim();
    if (body && PENDIENTE_CONTRATOS_REGEX.test(body)) {
      const sectionStart = idx + contratosMatch[0].length;
      const bodyStart = trimmed.indexOf(body, sectionStart);
      const bodyEnd = bodyStart + body.length;
      return (
        trimmed.slice(0, bodyStart) +
        "\n\n" +
        CONTRATOS_BODY_FALTA +
        "\n\n" +
        trimmed.slice(bodyEnd)
      ).trim();
    }
    return draft;
  }
  const seguridadIdx = trimmed.search(/\n##\s+(?:6\.\s+)?Seguridad\b/i);
  if (seguridadIdx !== -1) {
    return trimmed.slice(0, seguridadIdx) + CONTRATOS_PLACEHOLDER + trimmed.slice(seguridadIdx);
  }
  const integracionIdx = trimmed.search(/\n##\s+(?:7\.\s+)?(?:Infraestructura|Integración)\b/i);
  if (integracionIdx !== -1) {
    return trimmed.slice(0, integracionIdx) + CONTRATOS_PLACEHOLDER + trimmed.slice(integracionIdx);
  }
  return trimmed + CONTRATOS_PLACEHOLDER.trim();
}

/**
 * Subtítulos en inglés que el LLM suele copiar del brief del usuario; se reemplazan por español canónico.
 * Orden: frases más largas / específicas primero.
 */
const ENGLISH_SUBHEADING_TO_ES: Array<{ pattern: RegExp; replacement: string }> = [
  // §1
  {
    pattern:
      /\*\*1\.1\.\s*Project\s+Vision\s*(?:&|and)\s*Objectives(?:\s*\([^)]*\))?\s*:\s*\*\*/gi,
    replacement: "**1.1. Visión y objetivos del producto:**",
  },
  {
    pattern: /###\s*1\.1\.\s*Project\s+Vision\s*(?:&|and)\s*Objectives(?:\s*\([^)]*\))?\s*:?/gi,
    replacement: "### 1.1. Visión y objetivos del producto",
  },
  {
    pattern: /\*\*1\.2\.\s*Functional\s+Requirements(?:\s*\([^)]*\))?\s*:\s*\*\*/gi,
    replacement: "**1.2. Requisitos funcionales (formato EARS):**",
  },
  { pattern: /###\s*1\.2\.\s*Functional\s+Requirements(?:\s*\([^)]*\))?\s*:?/gi, replacement: "### 1.2. Requisitos funcionales (formato EARS)" },
  {
    pattern: /\*\*1\.3\.\s*Monetization\s*(?:&|and)\s*Pricing\s+Architecture\s*:\s*\*\*/gi,
    replacement: "**1.3. Monetización y arquitectura de precios:**",
  },
  {
    pattern: /###\s*1\.3\.\s*Monetization\s*(?:&|and)\s*Pricing\s+Architecture\s*:?/gi,
    replacement: "### 1.3. Monetización y arquitectura de precios",
  },
  // §2
  { pattern: /\*\*2\.1\.\s*Technical\s+Architecture\s*:\s*\*\*/gi, replacement: "**2.1. Arquitectura técnica:**" },
  { pattern: /###\s*2\.1\.\s*Technical\s+Architecture\s*:?/gi, replacement: "### 2.1. Arquitectura técnica" },
  { pattern: /\*\*2\.2\.\s*Technical\s+Architecture\s*:\s*\*\*/gi, replacement: "**2.2. Arquitectura técnica (detalle):**" },
  // §6 (seguridad)
  { pattern: /\*\*6\.2\.\s*Identity\s*:\s*\*\*/gi, replacement: "**6.2. Identidad:**" },
  { pattern: /###\s*6\.2\.\s*Identity\s*:?/gi, replacement: "### 6.2. Identidad" },
  { pattern: /\*\*6\.3\.\s*Data\s+Sovereignty\s*:\s*\*\*/gi, replacement: "**6.3. Soberanía de datos:**" },
  { pattern: /###\s*6\.3\.\s*Data\s+Sovereignty\s*:?/gi, replacement: "### 6.3. Soberanía de datos" },
  { pattern: /\*\*6\.4\.\s*Vulnerability\s+Management\s*:\s*\*\*/gi, replacement: "**6.4. Gestión de vulnerabilidades:**" },
  { pattern: /###\s*6\.4\.\s*Vulnerability\s+Management\s*:?/gi, replacement: "### 6.4. Gestión de vulnerabilidades" },
  { pattern: /\*\*6\.5\.\s*Incident\s+Response\s*:\s*\*\*/gi, replacement: "**6.5. Respuesta a incidentes:**" },
  { pattern: /###\s*6\.5\.\s*Incident\s+Response\s*:?/gi, replacement: "### 6.5. Respuesta a incidentes" },
];

/**
 * Normaliza subtítulos frecuentes en inglés (procedentes del brief) a español, sin tocar el cuerpo del texto.
 */
export function normalizeMddEnglishSubheadings(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  let out = draft;
  for (const { pattern, replacement } of ENGLISH_SUBHEADING_TO_ES) {
    out = out.replace(pattern, replacement);
  }
  // `## 6. Seguridad**6.1. Privacidad:**` (H2 pegado a subencabezado en negrita)
  out = out.replace(/(##\s*6\.\s*Seguridad)\*\*(\d+\.\d+)/gi, "$1\n\n**$2");
  return out;
}

/** Títulos canónicos del MDD (7 secciones). */
const CANONICAL_HEADINGS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^#+\s*Contexto\s*y\s*alcance\s*$/im, replacement: "## 1. Contexto" },
  { pattern: /^#+\s*Arquitectura\s+y\s*Stack\s*$/im, replacement: "## 2. Arquitectura y Stack" },
  { pattern: /^#+\s*schemaSQL\s*$/im, replacement: "## 3. Modelo de Datos" },
  { pattern: /^#+\s*Schema\s*SQL\s*$/im, replacement: "## 3. Modelo de Datos" },
  { pattern: /^#+\s*\d\.\s*Modelo\s+(?:de\s+)?datos\s*$/im, replacement: "## 3. Modelo de Datos" },
  { pattern: /^#+\s*Modelo\s+(?:de\s+)?datos\s*$/im, replacement: "## 3. Modelo de Datos" },
  { pattern: /^#+\s*Contratos\s+de\s+API\s*$/im, replacement: "## 4. Contratos de API" },
  { pattern: /^#+\s*Lógica\s+y\s*Edge\s+Cases\s*$/im, replacement: "## 5. Lógica y Edge Cases" },
  { pattern: /^#+\s*Seguridad\s*$/im, replacement: "## 6. Seguridad" },
  { pattern: /^#+\s*Integración\s*$/im, replacement: "## 7. Infraestructura" },
  { pattern: /^#+\s*Infraestructura\s*$/im, replacement: "## 7. Infraestructura" },
  { pattern: /^#+\s*endpoints\s*$/im, replacement: "### Endpoints" },
];

/**
 * Convierte secuencias literales \\n, \\t y \\" en newline, tab y comilla real.
 * Corrige drafts que llegaron escapados (ej. doble JSON) para que el markdown renderice bien.
 */
export function unescapeLiteralNewlines(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  return draft
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"');
}

/**
 * Elimina del final del documento el bloque "Respuestas del usuario (incorporar al borrador...)"
 * y todo el historial de conversación que el LLM copió. Ese bloque es contexto para los agentes,
 * no parte del MDD que debe ver el usuario.
 */
export function stripUserResponsesAndConversationHistory(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  const markers = [
    /\n\s*\*\*Respuestas del usuario\s*\(incorporar al borrador/i,
    /\n\s*\*\*Respuestas acumuladas del usuario\s*\(/i,
  ];
  for (const re of markers) {
    const match = draft.match(re);
    if (match && match.index != null) {
      return draft.slice(0, match.index).replace(/\n{2,}\s*$/, "\n").trim();
    }
  }
  return draft;
}

/** Inicio de párrafos que son instrucciones/feedback interno; no deben quedar en el documento final. */
const INSTRUCTION_STARTS = [
  /^\s*\*\*Feedback del Auditor\s*\(/i,
  /^\s*Aplica las correcciones que afecten a/i,
  /^\s*Unifica el documento y asegura que los gaps/i,
  /^\s*Opcional:\s*Usa la tool validate_mdd_structure/i,
  /^\s*\*\*Opcional:\s*\*\*.*format_section3_endpoints/i,
  /^\s*\*\*Requisitos o petición del usuario\s*\(incorporar en las secciones/i,
  // Bloques que inyectamos en el contexto del SA; el LLM no debe copiarlos en la salida.
  /^\s*\*\*ACCIÓN REQUERIDA\s*\(usuario aceptó esta propuesta\)\s*:\s*\*\*/i,
  /^\s*\*\*Prioridad\s*\(léelo primero\)\s*:\s*\*\*/i,
  /^\s*Requisitos del usuario\s*\(conversación reciente\)\s*:/im,
  /^\s*Debes aplicar esta directiva al MDD/i,
];

function isInstructionBlock(paragraph: string): boolean {
  const firstLine = paragraph.split("\n")[0]?.trim() ?? "";
  return INSTRUCTION_STARTS.some((re) => re.test(firstLine));
}

/**
 * Elimina del texto párrafos que son instrucciones o feedback interno (Feedback del Auditor, Aplica las correcciones..., Unifica el documento..., Opcional: Usa la tool...).
 * Evita que el LLM haya copiado esas instrucciones al output y queden en el MDD final.
 */
export function stripInstructionAndFeedbackBlocks(text: string): string {
  if (!text || typeof text !== "string") return text;
  const paragraphs = text.split(/\n\n+/);
  const kept = paragraphs.filter((p) => !isInstructionBlock(p));
  return kept.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Quita del contenido de un diagrama Mermaid cualquier fence sobrante (```mermaid o ```).
 * Así al envolver con ```mermaid\n...\n``` nunca queda doble apertura/cierre.
 */
export function stripMermaidFences(content: string): string {
  if (!content || typeof content !== "string") return "";
  let s = content.trim();
  // Quitar uno o más ```mermaid (o ```) al inicio
  s = s.replace(/^(\s*```(?:mermaid)?\s*)+/i, "").trim();
  // Quitar uno o más ``` al final
  s = s.replace(/(\s*```\s*)+$/g, "").trim();
  return s;
}

/**
 * Dado un objeto parseado con SQL/DiagramaER/TechnicalMetadata, devuelve el markdown canónico de la sección 2.
 * Acepta SQL como string (todo el bloque) o como array de strings.
 */
function section2ObjectToMarkdown(obj: Record<string, unknown>): string {
  const sqlArr = obj.SQL ?? obj.sql;
  const sqlContent =
    typeof sqlArr === "string"
      ? sqlArr.trim()
      : Array.isArray(sqlArr)
        ? (sqlArr as string[]).map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean).join("\n\n")
        : "";
  if (!sqlContent || !/CREATE\s+TABLE/i.test(sqlContent)) return "";
  const sqlBlock = "\n\n```sql\n" + sqlContent + "\n```";
  const diagramRaw = (obj.DiagramaER ?? obj.diagramaER ?? obj.diagrama_er ?? obj.erDiagram) as string | undefined;
  let diagramBlock = "";
  if (typeof diagramRaw === "string" && diagramRaw.trim()) {
    const m = diagramRaw.trim().match(/```mermaid\s*([\s\S]*?)```/i);
    const innerContent = m?.[1] ? m[1].trim() : diagramRaw.replace(/^[\s\S]*?```mermaid\s*/i, "").replace(/```\s*$/i, "").trim();
    const content = stripMermaidFences(innerContent || diagramRaw);
    if (content || /erDiagram/i.test(diagramRaw))
      diagramBlock = "\n\n### Diagrama entidad-relación\n\n```mermaid\n" + (content || "erDiagram\n  \n") + "\n```";
  }
  const metaRaw = (obj.technicalMetadata ?? obj.TechnicalMetadata) as string | undefined;
  const metaBlock =
    typeof metaRaw === "string" && metaRaw.trim()
      ? "\n\n```TechnicalMetadata\n" + metaRaw.trim() + "\n```"
      : "\n\n```TechnicalMetadata\n[high_security]\n```";
  return sqlBlock + diagramBlock + metaBlock + "\n\n";
}

/**
 * Convierte sección 2 cuando el cuerpo es JSON con "SQL": string|[] y/o "DiagramaER": "..." (salida mal formada del Experto).
 * Devuelve markdown correcto o null si el cuerpo no es ese JSON.
 */
function convertSection2JsonBodyToMarkdown(body: string): string | null {
  const t = body.trim();
  if (!t.startsWith("{") || !t.includes("SQL") || !t.includes("CREATE")) return null;
  try {
    const obj = JSON.parse(t) as Record<string, unknown>;
    const out = section2ObjectToMarkdown(obj);
    return out || null;
  } catch {
    return null;
  }
}

/** Unescape JSON string (\\n -> newline, \\" -> ", etc.) para contenido extraído por regex. */
function unescapeJsonString(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/**
 * Cuando el JSON dentro de ```sql es inválido (p. ej. newlines literales en strings), extrae SQL/DiagramaER/TechnicalMetadata por regex.
 */
function section2ObjectFromMalformedJson(inner: string): Record<string, unknown> | null {
  const sqlKey = /"SQL"\s*:\s*"/i.exec(inner)?.[0];
  if (!sqlKey) return null;
  const sqlStart = inner.indexOf(sqlKey) + sqlKey.length;
  const afterSql = inner.slice(sqlStart);
  const sqlEndRe = /"\s*,\s*"(?:DiagramaER|TechnicalMetadata)"/i;
  const sqlEndMatch = afterSql.match(sqlEndRe);
  const rawSql = sqlEndMatch
    ? afterSql.slice(0, sqlEndMatch.index).trim()
    : afterSql.trim().replace(/"\s*\}\s*$/, "").trim();
  const sqlContent = unescapeJsonString(rawSql);
  if (!sqlContent || !/CREATE\s+TABLE/i.test(sqlContent)) return null;
  let diagramRaw = "";
  const diagramKey = /"DiagramaER"\s*:\s*"/i.exec(inner);
  if (diagramKey) {
    const diagramStart = inner.indexOf(diagramKey[0]) + diagramKey[0].length;
    const afterDiagram = inner.slice(diagramStart);
    const diagramEndMatch = afterDiagram.match(/"\s*,\s*"TechnicalMetadata"/i) ?? afterDiagram.match(/"\s*\}/);
    diagramRaw = diagramEndMatch
      ? unescapeJsonString(afterDiagram.slice(0, diagramEndMatch.index).trim())
      : unescapeJsonString(afterDiagram.trim().replace(/"\s*\}$/, ""));
  }
  let metaRaw = "[high_security]";
  const metaMatch = inner.match(/"TechnicalMetadata"\s*:\s*"([^"]*)"\s*\}/i) ?? inner.match(/"TechnicalMetadata"\s*:\s*"([^"]*)"/i);
  if (metaMatch?.[1]) metaRaw = metaMatch[1].trim() || metaRaw;
  return { SQL: sqlContent, DiagramaER: diagramRaw || undefined, TechnicalMetadata: metaRaw };
}

/**
 * Si en la sección 2 el bloque ```sql contiene un objeto JSON ({"SQL": "...", "DiagramaER": "...", ...}),
 * lo extrae y reemplaza por la estructura canónica: ```sql + SQL crudo + ``` + ### Diagrama + ```mermaid + ```TechnicalMetadata.
 */
function unwrapSection2SqlBlockContainingJson(draft: string): string {
  const modeloHeading = "## 3. Modelo de Datos";
  const modeloIdx = draft.indexOf(modeloHeading);
  if (modeloIdx === -1) return draft;
  const sectionStart = modeloIdx + modeloHeading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  const sqlBlockMatch = body.match(/```sql\s*([\s\S]*?)```/i);
  if (!sqlBlockMatch || sqlBlockMatch.index == null) return draft;
  const inner = sqlBlockMatch[1].trim();
  if (!inner.startsWith("{") || !/SQL|DiagramaER/i.test(inner)) return draft;
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(inner) as Record<string, unknown>;
  } catch {
    obj = section2ObjectFromMalformedJson(inner);
  }
  if (!obj) return draft;
  const markdown = section2ObjectToMarkdown(obj);
  if (!markdown) return draft;
  const before = body.slice(0, sqlBlockMatch.index);
  const after = body.slice(sqlBlockMatch.index + sqlBlockMatch[0].length);
  const newBody = before + markdown.trim() + after;
  const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
  return draft.slice(0, sectionStart) + newBody + afterSection;
}

/**
 * Normaliza el contenido de la sección 2 cuando viene con JSON dentro de ```sql (salida mal formada del Experto).
 * Acepta string que empieza por "## 3. Modelo de Datos" o solo el cuerpo; devuelve sección 2 con bloques canónicos.
 */
export function unwrapSection2ContentIfJsonInsideSql(section2: string): string {
  const sqlBlockMatch = section2.match(/```sql\s*([\s\S]*?)```/i);
  if (!sqlBlockMatch || sqlBlockMatch.index == null) return section2;
  const inner = sqlBlockMatch[1].trim();
  if (!inner.startsWith("{") || !/SQL|DiagramaER/i.test(inner)) return section2;
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(inner) as Record<string, unknown>;
  } catch {
    obj = section2ObjectFromMalformedJson(inner);
  }
  if (!obj) return section2;
  const markdown = section2ObjectToMarkdown(obj);
  if (!markdown) return section2;
  const before = section2.slice(0, sqlBlockMatch.index);
  const after = section2.slice(sqlBlockMatch.index + sqlBlockMatch[0].length);
  return before + markdown.trim() + after;
}

/** Asegura que la sección 2 termine con bloque TechnicalMetadata. Si falta, lo añade al final del cuerpo. */
function ensureTechnicalMetadataAtEndOfSection2(draft: string): string {
  const modeloHeading = "## 3. Modelo de Datos";
  const modeloIdx = draft.indexOf(modeloHeading);
  if (modeloIdx === -1) return draft;
  const sectionStart = modeloIdx + modeloHeading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  if (/```TechnicalMetadata\s*[\s\S]*?```/i.test(body)) return draft;
  const defaultMeta = "\n\n```TechnicalMetadata\n[high_security]\n```\n\n";
  const newBody = body.trimEnd() + defaultMeta;
  const newRest = nextH2 !== -1 ? newBody + rest.slice(nextH2) : newBody;
  return draft.slice(0, sectionStart) + newRest;
}

/**
 * Dentro de ```mermaid, si el contenido es JSON (o "## 2. Modelo...") lo reemplaza por erDiagram o por diagramaER extraído.
 */
function stripJsonFromMermaidBlocks(body: string): string {
  return body.replace(/```mermaid\s*([\s\S]*?)```/gi, (_match, inner) => {
    const t = inner.trim();
    if (!t || /^erDiagram\b/i.test(t)) return _match;
    if (t.startsWith("##") || t.startsWith("{") || /"sqlPostgreSQL"\s*:/i.test(t)) {
      try {
        const firstBrace = t.indexOf("{");
        if (firstBrace !== -1) {
          const braceEnd = findBalancedBraceRespectingStrings(t, firstBrace);
          if (braceEnd !== -1) {
            const obj = JSON.parse(t.slice(firstBrace, braceEnd + 1)) as Record<string, unknown>;
            // erDiagram como string (clave "erDiagram") o diagramaER como array
            const erStr = (obj.erDiagram ?? obj.diagramaER ?? obj.diagrama_er) as string | string[] | undefined;
            if (typeof erStr === "string" && erStr.trim().length > 0 && /erDiagram|{\s*string\s+id/i.test(erStr)) {
              return "```mermaid\n" + erStr.trim() + "\n```";
            }
            const diagramaArr = erStr as string[] | undefined;
            if (Array.isArray(diagramaArr) && diagramaArr.length > 0) {
              const joined = diagramaArr.map((s) => (typeof s === "string" ? s : String(s)).trim()).filter(Boolean).join("\n");
              if (/erDiagram|{\s*string\s+id/i.test(joined)) return "```mermaid\n" + joined + "\n```";
            }
          }
        }
      } catch {
        // fall through to placeholder
      }
      return "```mermaid\nerDiagram\n  \n```";
    }
    return _match;
  });
}

/**
 * Dentro de bloques ```mermaid con erDiagram: relaciones : "id" con el nombre de FK correcto.
 * PK, FK se mantienen con coma (sintaxis oficial de Mermaid).
 */
function sanitizeErDiagramInMermaidBlocks(body: string): string {
  return body.replace(/```mermaid\s*([\s\S]*?)```/gi, (_match, inner) => {
    let content = inner.trim();
    if (!/erDiagram/i.test(content)) return _match;
    // Relaciones: etiquetar con la columna FK real (user_id, application_id, role_id)
    content = content.replace(
      /(users\s*\|\|--o\{\s*sessions\s*:\s*)"id"/gi,
      '$1"user_id"'
    );
    content = content.replace(
      /(applications\s*\|\|--o\{\s*roles\s*:\s*)"id"/gi,
      '$1"application_id"'
    );
    content = content.replace(
      /(users\s*\|\|--o\{\s*user_application_roles\s*:\s*)"id"/gi,
      '$1"user_id"'
    );
    content = content.replace(
      /(roles\s*\|\|--o\{\s*user_application_roles\s*:\s*)"id"/gi,
      '$1"role_id"'
    );
    content = content.replace(/(\|\|--o\{\s*sessions\s*:\s*)"id"/gi, '$1"user_id"');
    content = content.replace(/(\|\|--o\{\s*roles\s*:\s*)"id"/gi, '$1"application_id"');
    return "```mermaid\n" + content + "\n```";
  });
}

/**
 * En la sección 3: deja solo la primera ### Diagrama, primer ```mermaid y primer ```TechnicalMetadata.
 * Colapsa bloques TechnicalMetadata duplicados consecutivos y trunca tras el primero.
 */
function deduplicateSection3DiagramAndMetadata(body: string): string {
  let out = body.replace(
    /(```TechnicalMetadata\s*[\s\S]*?```)\s*(?:\s*```TechnicalMetadata\s*[\s\S]*?```\s*)+/gi,
    "$1\n\n"
  );
  const techMetaRe = /```TechnicalMetadata\s*[\s\S]*?```/gi;
  const firstTech = techMetaRe.exec(out);
  if (!firstTech) return out;
  const cutEnd = firstTech.index + firstTech[0].length;
  const rest = out.slice(cutEnd).replace(/^\s*\n+/, "").trim();
  if (!rest) return out;
  if (/```TechnicalMetadata|###\s*Diagrama\s+entidad-relación|```mermaid/i.test(rest)) {
    return out.slice(0, cutEnd).trim();
  }
  return out;
}

/**
 * Corrige doble fence en bloques Mermaid: ```mermaid\n```mermaid → ```mermaid; ```\n``` → ```.
 * Evita "Syntax error in text" en Mermaid cuando el LLM o el pipeline generó apertura/cierre duplicados.
 */
export function fixDoubleMermaidFences(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  let out = draft;
  // Doble apertura: ```mermaid seguido de ```mermaid en la siguiente línea
  out = out.replace(/```mermaid\s*\n+\s*```mermaid/gi, "```mermaid");
  // Doble cierre: ```\n``` al final de un bloque (deja solo un ```)
  out = out.replace(/\n```\s*\n+\s*```\s*(\n|$)/g, "\n```$1");
  return out;
}

/**
 * Dentro de cada bloque ```mermaid...``` reemplaza literales \n (backslash-n) por newline real.
 * El LLM a veces devuelve diagramaEr con \\n en el string; así Mermaid puede parsear el diagrama.
 */
export function unescapeMermaidLiteralNewlines(draft: string): string {
  if (!draft || typeof draft !== "string") return draft;
  return draft.replace(/```mermaid\s*([\s\S]*?)```/gi, (_match, inner) => {
    const unescaped = inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
    return "```mermaid\n" + unescaped + "\n```";
  });
}

/**
 * Estandariza el formato del MDD: títulos canónicos, SQL en bloque ```sql, evita líneas sueltas como "3".
 * Se aplica al draft antes de mostrarlo para que cada regeneración se vea consistente.
 */
export function normalizeMddFormat(draft: string): string {
  let out = (draft || "").trim();
  if (!out) return draft;
  // Muy al inicio: §6 pegada a ### (evita que deduplicateAndReorderMddSections tome heading+subheading como una línea)
  out = out.replace(/(6\.\s*Seguridad)\s*(#{1,6})/gi, "$1\n\n$2");

  out = unescapeLiteralNewlines(out);
  out = fixDoubleMermaidFences(out);
  out = unescapeMermaidLiteralNewlines(out);
  out = stripUserResponsesAndConversationHistory(out);
  out = sanitizeContextSection(out);
  out = replaceContextWhenInstructions(out);
  out = forceStripBrokenPrefix(out);
  out = collapseDuplicateMainTitle(out);
  out = out.replace(/\[object\s+Object\]/gi, "(contenido omitido)");
  out = stripBrokenMetadataDocumentBlock(out);
  out = sanitizeSeguridadIntegracionRawJson(out);
  // Quitar heading duplicado "### ## Integración" que a veces deja el LLM (dejar solo ## Integración)
  out = out.replace(/(##\s+Integración)\s*\n+\s*###\s*##\s*Integración\s*\n+/gi, "$1\n\n");
  out = stripInstructionAndFeedbackBlocks(out);
  out = replaceAwsProseWithGenericWhenInfraNotAws(out);

  for (const { pattern, replacement } of CANONICAL_HEADINGS) {
    out = out.replace(pattern, replacement);
  }
  out = normalizeMddEnglishSubheadings(out);
  // Dentro de ## 2. Arquitectura y Stack, normalizar 4.x → 2.x (subsecciones mal numeradas por el LLM)
  const archStackHeading = "## 2. Arquitectura y Stack";
  const archStackIdx = out.indexOf(archStackHeading);
  if (archStackIdx !== -1) {
    const afterArch = out.slice(archStackIdx + archStackHeading.length);
    const nextH2 = afterArch.search(/\n##\s+/);
    const body = nextH2 !== -1 ? afterArch.slice(0, nextH2) : afterArch;
    let normalizedBody = body
      .replace(/^\s*####\s+4\.(\d+)(\.?)(\s|$)/gim, (_, n, dot, rest) => `### 2.${n}${dot}${rest}`)
      .replace(/^\s*###\s+4\.(\d+)(\.?)(\s|$)/gim, (_, n, dot, rest) => `### 2.${n}${dot}${rest}`)
      .replace(/^\s*4\.(\d+)\./gm, "2.$1.");
    if (normalizedBody !== body) {
      out =
        out.slice(0, archStackIdx + archStackHeading.length) +
        normalizedBody +
        (nextH2 !== -1 ? afterArch.slice(nextH2) : "");
    }
  }
  // Quitar líneas huérfanas que son solo un número (ej. "3" entre Modelo de datos y Contratos)
  out = out.replace(/\n\s*\d+\s*\n/g, "\n");

  const modeloHeading = "## 3. Modelo de Datos";
  const modeloIdx = out.indexOf(modeloHeading);
  if (modeloIdx !== -1) {
    out = unwrapSection2SqlBlockContainingJson(out);
    out = fixSection2UnclosedSqlAndGluedMermaid(out);
    out = ensureSection2SqlBlockClosed(out);
    const sectionStart = modeloIdx + modeloHeading.length;
    const rest = out.slice(sectionStart);
    const nextH2 = rest.search(/\n##\s+/);
    const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
    let trimmedBody = body.replace(/^\s*\n+/, "").trim();
    // Quitar línea suelta "3" dentro del cuerpo por si no la pilló el replace global
    trimmedBody = trimmedBody.replace(/\n\s*\d+\s*\n/g, "\n").trim();
    trimmedBody = stripJsonFromMermaidBlocks(trimmedBody);
    trimmedBody = sanitizeErDiagramInMermaidBlocks(trimmedBody);
    trimmedBody = deduplicateSection3DiagramAndMetadata(trimmedBody);

    const fromJson = convertSection2JsonBodyToMarkdown(trimmedBody);
    if (fromJson) {
      out = out.slice(0, sectionStart) + fromJson + (nextH2 !== -1 ? rest.slice(nextH2) : "");
    } else if (trimmedBody && /CREATE\s+TABLE/i.test(trimmedBody) && !trimmedBody.includes("```sql")) {
      const sqlContent = trimmedBody
        .split(/\n/)
        .map((l) => l.replace(/^-\s*/, "").trim())
        .filter((l) => l.length > 0 && !/^\s*\d+\s*$/.test(l))
        .join("\n");
      if (sqlContent.length > 15) {
        const newBody = "\n\n```sql\n" + sqlContent + "\n```\n\n";
        out = out.slice(0, sectionStart) + newBody + (nextH2 !== -1 ? rest.slice(nextH2) : "");
      }
    } else if (
      !trimmedBody ||
      trimmedBody.length < 50 ||
      (!/CREATE\s+TABLE/i.test(trimmedBody) && /pendiente|placeholder/i.test(trimmedBody))
    ) {
      // Cuerpo vacío o solo placeholder: inyectar SQL mínimo (SSO/auth) para que la sección tenga contenido
      const minimalSql =
        "\n\n(Esquema mínimo; el Arquitecto debe completar con todas las tablas del dominio.)\n\n```sql\n" +
        "CREATE TABLE users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  username VARCHAR(255) NOT NULL UNIQUE,\n  password_hash VARCHAR(255) NOT NULL,\n  mfa_enabled BOOLEAN NOT NULL DEFAULT false,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE TABLE sessions (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  token_hash VARCHAR(255) NOT NULL,\n  expires_at TIMESTAMPTZ NOT NULL,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n" +
        "```\n\n";
      out = out.slice(0, sectionStart) + minimalSql + (nextH2 !== -1 ? rest.slice(nextH2) : "");
    } else {
      // Aplicar cuerpo ya limpiado (JSON dentro de mermaid quitado, duplicados truncados)
      out = out.slice(0, sectionStart) + "\n\n" + trimmedBody + (nextH2 !== -1 ? rest.slice(nextH2) : "");
    }
    out = ensureTechnicalMetadataAtEndOfSection2(out);
    out = ensureSection2SqlFormattedInSection(out);
  }

  // Formatear sección Contratos de API: JSON en bloques ```json con indentación
  const contratosHeading = "## 4. Contratos de API";
  const contratosIdx = out.indexOf(contratosHeading);
  if (contratosIdx !== -1) {
    const sectionStart = contratosIdx + contratosHeading.length;
    const rest = out.slice(sectionStart);
    const nextH2 = rest.search(/\n##\s+/);
    const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
    const formatted = formatContratosBody(body);
    if (formatted !== body) {
      out = out.slice(0, sectionStart) + formatted + (nextH2 !== -1 ? rest.slice(nextH2) : "");
    }
  }

  // Sección 6 Seguridad: quitar "{:" o "{" pegado al heading (ej. "## 6. Seguridad{:")
  out = out.replace(/(##\s*6\.\s*Seguridad)\s*\{:\s*/gi, "$1\n\n");
  out = out.replace(/(##\s*6\.\s*Seguridad)\s*\{\s*\n/gi, "$1\n\n");
  // "6. Seguridad- Aspectos generales" → ## 6 + ## Aspectos Generales (formato canónico)
  out = out.replace(/(?:#+\s*)?6\.\s*Seguridad\s*-\s*Aspectos\s+generales:?\s*/gi, "## 6. Seguridad\n\n## Aspectos Generales\n\n");
  // Despegar "6. Seguridad-" genérico
  out = out.replace(/(?:#+\s*)?6\.\s*Seguridad\s*-\s*/gi, "## 6. Seguridad\n\n");
  // Corregir doble guion
  out = out.replace(/(##\s*6\.\s*Seguridad\n\n)-\s*-\s*/gi, "$1- ");
  // Si queda "## 6. Seguridad" o "6. Seguridad" pegado a "###", insertar salto (varias formas por si falla el regex anterior)
  out = out.replace(/6\.\s*Seguridad\s*###/gi, "6. Seguridad\n\n###");
  out = out.replace(/(##\s*6\.\s*Seguridad)([^\n]*?)(#{1,6}\s*)/gi, "$1\n\n$3");
  const seguridadHeading = "## 6. Seguridad";
  const seguridadIdx = out.indexOf(seguridadHeading);
  if (seguridadIdx !== -1) {
    const sectionStart = seguridadIdx + seguridadHeading.length;
    const rest = out.slice(sectionStart);
    const nextH2 = rest.search(/\n##\s+/);
    const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
    let fixed = body.replace(/\s*--\s*\n*$/, "").trim();
    fixed = fixSection6BulletedJsonToMarkdown(fixed) ?? fixed;
    fixed = fixSecuritySectionBullets(fixed);
    fixed = fixed.replace(/(\n\s*-\s*)+$/, "").replace(/\n\s*---\s*$/, "").trim();
    if (fixed !== body) {
      out =
        out.slice(0, sectionStart) + fixed + (nextH2 !== -1 ? rest.slice(nextH2) : "");
    }
  }

  // Deduplicar y reordenar secciones (1, 2, 3, 4, Seguridad, Integración)
  out = deduplicateAndReorderMddSections(out);

  // Separación visual: --- antes de cada ## (excepto si ya hay --- justo antes)
  out = ensureHorizontalRuleBeforeH2(out);

  // Colapsar múltiples líneas "---" consecutivas (con o sin líneas en blanco) en una sola
  out = collapseConsecutiveHorizontalRules(out);

  // Si la sección Integración tiene manifest con stack definido, quitar etiqueta "Nota/Pendiente"
  out = stripNotaPendienteHeadingWhenManifestComplete(out);

  // Si la sección 7 tiene manifest como texto plano (stack/pending sin ```json), envolver en ```json
  out = ensureManifestInJsonBlock(out);

  // En sección 7: quitar ### Integración redundante justo bajo ## 7. Infraestructura
  out = stripRedundantIntegracionHeadingInSection7(out);

  // Colapsar ### Manifest / ### Manifest de Infraestructura duplicados en sección 7
  out = collapseDuplicateManifestHeadings(out);

  // Eliminar sección errónea "## 4. Arquitectura Frontend" (estructura canónica: la 4 es Contratos de API)
  out = stripStandaloneArquitecturaFrontendSection(out);

  return out.trim();
}

/** Elimina del draft la sección "## 4. Arquitectura Frontend" completa (hasta el siguiente ## o fin). Evita dos secciones 4. */
function stripStandaloneArquitecturaFrontendSection(draft: string): string {
  const re = /\n##\s+4\.\s*Arquitectura\s+Frontend\b[^\n]*/gi;
  const match = re.exec(draft);
  if (!match || match.index == null) return draft;
  const start = match.index + 1;
  const afterHeading = start + match[0].length;
  const rest = draft.slice(afterHeading);
  const nextH2 = rest.search(/\n##\s+/);
  const end = nextH2 !== -1 ? afterHeading + nextH2 : draft.length;
  const before = draft.slice(0, start).replace(/\n*---\s*\n*$/, "\n");
  const after = draft.slice(end).replace(/^\n*---\s*\n*/, "\n");
  return (before + after).trim();
}

/** En sección 7: si la primera subsección es ### Integración (redundante con el H2), reemplazarla por ### Resumen. */
function stripRedundantIntegracionHeadingInSection7(draft: string): string {
  const match = draft.match(/\n(##\s+(?:7\.\s+)?(?:Infraestructura|Integración)\b[^\n]*)/i);
  if (!match || match.index == null) return draft;
  const sectionStart = match.index + match[0].length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  const fixed = body.replace(/^\s*###\s+Integración\s*\n+/i, "### Resumen\n\n");
  if (fixed === body) return draft;
  return draft.slice(0, sectionStart) + fixed + (nextH2 !== -1 ? rest.slice(nextH2) : "");
}

/** En sección 7: colapsa repeticiones de ### Manifest (incl. ### 7.5 Manifest...) y ### Manifest de Infraestructura en una sola. */
function collapseDuplicateManifestHeadings(draft: string): string {
  const match = draft.match(/\n(##\s+(?:7\.\s+)?(?:Infraestructura|Integración)\b[^\n]*)/i);
  if (!match || match.index == null) return draft;
  const sectionStart = match.index + match[0].length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = nextH2 !== -1 ? rest.slice(0, nextH2) : rest;
  const repeated = /(\n###\s*(?:\d+\.\d+\s+)?Manifest(?:\s+de\s+Infraestructura)?\s*\n*)+/gi;
  const collapsed = body.replace(repeated, "\n\n### Manifest de Infraestructura\n\n");
  if (collapsed === body) return draft;
  const newRest = collapsed + (nextH2 !== -1 ? rest.slice(nextH2) : "");
  return draft.slice(0, sectionStart) + newRest;
}

/** Reemplaza secuencias de líneas "---" (con o sin líneas en blanco entre ellas) por una sola "---". */
export function collapseConsecutiveHorizontalRules(draft: string): string {
  return draft.replace(/(\n---\s*\n)(\s*---\s*\n)*/g, "\n---\n");
}

const REAL_SECTION_RE =
  /\n##\s+(?:1\.\s*Contexto|2\.\s*Modelo|3\.\s*Contratos|4\.\s*Arquitectura\s+Frontend|Seguridad|Integración)\b/i;

/** Si el draft empieza con useMermaidForDiagrams/document, recorta todo hasta la primera sección real y reconstruye. */
export function forceStripBrokenPrefix(draft: string): string {
  const trimmed = (draft || "").trim();
  if (!trimmed || trimmed.length < 100) return draft;
  const hasBroken = /useMermaidForDiagrams|##\s+document\b/i.test(trimmed.slice(0, 2000));
  if (!hasBroken) return draft;
  const match = trimmed.match(REAL_SECTION_RE);
  if (!match || match.index == null) return draft;
  const fromSection = trimmed.slice(match.index).replace(/^\s*\n+/, "");
  if (fromSection.length < 200) return draft;
  return ("# Master Design Document\n\n---\n" + fromSection).trim();
}

/**
 * Convierte sección "## TechnicalMetadata" con viñetas (- [tag]) en bloque de código
 * ```TechnicalMetadata\n[tag1] [tag2]\n``` para que no se muestre como encabezado roto.
 */
function convertTechnicalMetadataSectionToBlock(draft: string): string {
  const heading = "## TechnicalMetadata";
  const idx = draft.indexOf(heading);
  if (idx === -1) return draft;
  const sectionStart = idx + heading.length;
  const rest = draft.slice(sectionStart);
  const nextH2 = rest.search(/\n##\s+/);
  const body = (nextH2 !== -1 ? rest.slice(0, nextH2) : rest).replace(/^\s*\n+/, "").trim();
  const tagMatches = body.match(/-\s*\[([^\]]+)\]/g);
  const tags = tagMatches ? tagMatches.map((m) => "[" + m.replace(/^-\s*\[|\]$/g, "").trim() + "]") : [];
  const blockContent = tags.length > 0 ? tags.join(" ") : "[high_security]";
  const codeBlock = "\n\n```TechnicalMetadata\n" + blockContent + "\n```\n\n";
  const afterSection = nextH2 !== -1 ? rest.slice(nextH2) : "";
  return draft.slice(0, idx) + codeBlock + (afterSection ? afterSection : "");
}

/**
 * Convierte metadata en cursiva (*Metadata: [high_security]*) a bloque ```TechnicalMetadata.
 */
function convertItalicMetadataToBlock(draft: string): string {
  return draft.replace(
    /\*Metadata:\s*([^*]+)\*/gi,
    (_match, tags) => "```TechnicalMetadata\n" + tags.trim().replace(/\s*,\s*/g, " ") + "\n```"
  );
}

/** Elimina bloques "## useMermaidForDiagrams" / "## leaveUncovered" / "## document" cuando hay una sección real después. Repite hasta que no queden. */
export function stripBrokenMetadataDocumentBlock(draft: string): string {
  let out = draft;
  out = convertItalicMetadataToBlock(out);
  out = convertTechnicalMetadataSectionToBlock(out);
  let changed = true;
  while (changed) {
    changed = false;
    const idx = out.search(/\n##\s+useMermaidForDiagrams\b/i);
    if (idx === -1) break;
    const afterBroken = out.slice(idx);
    const match = afterBroken.match(REAL_SECTION_RE);
    if (!match || match.index == null) break;
    const startRemove = out.slice(0, idx).replace(/\n---\s*\n?$/, "");
    const rest = afterBroken.slice(match.index).replace(/^\n+/, "");
    out = (startRemove + "\n\n---\n" + rest).trim();
    changed = true;
  }
  return out;
}

/** Elimina repeticiones de "# Master Design Document"; deja solo la primera y quita el bloque duplicado (y --- siguiente si existe). */
export function collapseDuplicateMainTitle(draft: string): string {
  const mainTitleRe = /^#\s+Master\s+Design\s+Document[^\n]*/im;
  const first = draft.match(mainTitleRe);
  if (!first) return draft;
  const firstEnd = draft.indexOf(first[0]) + first[0].length;
  const afterFirst = draft.slice(firstEnd);
  const withoutDuplicates = afterFirst.replace(/(\n\s*)#\s+Master\s+Design\s+Document[^\n]*(\s*\n---\s*\n?)?/gi, "$1");
  return draft.slice(0, firstEnd) + withoutDuplicates;
}

/** Resultado de validación de estructura del MDD (para tools de Auditor/Redactor). */
export interface ValidateMddStructureResult {
  section3HasPayloads: boolean;
  missingSections: string[];
  hasTechnicalMetadata: boolean;
  sectionOrderCorrect: boolean;
  issues: string[];
}

const SECTION_HEADINGS_CANONICAL = [
  "1. Contexto",
  "2. Arquitectura y Stack",
  "3. Modelo de Datos",
  "4. Contratos de API",
  "5. Lógica y Edge Cases",
  "6. Seguridad",
  "7. Infraestructura",
];

function getSectionBody(draft: string, pattern: RegExp): string | null {
  const match = draft.match(pattern);
  if (!match) return null;
  const idx = draft.indexOf(match[0]);
  const start = idx + match[0].length;
  const rest = draft.slice(start).replace(/^\s*\n+/, "");
  const nextH2 = rest.search(/\n##\s+/);
  return (nextH2 !== -1 ? rest.slice(0, nextH2) : rest).trim();
}

/** Resumen del draft para logs: longitud y estado de la sección 3 (modelo de datos). */
export function getMddDraftSummary(draft: string): { length: number; section2: "sql" | "placeholder" | "empty" } {
  const trimmed = (draft ?? "").trim();
  const body = getSectionBody(trimmed, /##\s*3\.\s*Modelo\s+(?:de\s+)?datos|##\s*2\.\s*Modelo\s+(?:de\s+)?datos/i);
  let section2: "sql" | "placeholder" | "empty" = "empty";
  if (body && body.length > 10) {
    section2 = /CREATE\s+TABLE/i.test(body) ? "sql" : /pendiente|placeholder/i.test(body) ? "placeholder" : "empty";
  }
  return { length: trimmed.length, section2 };
}

/**
 * Devuelve el rango [start, end) del bloque §2–§5 (Arquitectura hasta antes de Seguridad) en el draft.
 * Usado para reemplazar solo §2–§5 al regenerar desde el arquitecto.
 */
export function getSections2To5Range(draft: string): { start: number; end: number } | null {
  const trimmed = (draft ?? "").trim();
  const startRe = /\n?(##\s*2\.\s*Arquitectura[^\n]*)/i;
  const startM = trimmed.match(startRe);
  if (!startM || startM.index == null) return null;
  const start = startM.index + (startM[0].startsWith("\n") ? 1 : 0);
  const afterStart = start + (startM[1]?.length ?? 0);
  const rest = trimmed.slice(afterStart);
  const endH2 = rest.search(/\n##\s+(?:6\.\s+)?Seguridad\b/i);
  const end = endH2 >= 0 ? afterStart + endH2 : trimmed.length;
  return { start, end };
}

/** Extrae el contenido de §2–§5 (desde ## 2. Arquitectura hasta antes de ## 6. Seguridad) de un draft. */
export function extractSections2To5Content(draft: string): string | null {
  const range = getSections2To5Range((draft ?? "").trim());
  if (!range) return null;
  return (draft ?? "").trim().slice(range.start, range.end).trim() || null;
}

/**
 * Reemplaza solo el bloque §2–§5 en currentDraft por newSections2To5Markdown.
 * newSections2To5Markdown debe incluir ## 2. Arquitectura … hasta el final de §5 (sin ## 6.).
 */
export function replaceSections2To5InDraft(
  currentDraft: string,
  newSections2To5Markdown: string,
): string {
  const trimmed = (currentDraft ?? "").trim();
  const range = getSections2To5Range(trimmed);
  if (range) {
    const before = trimmed.slice(0, range.start);
    const after = range.end < trimmed.length ? trimmed.slice(range.end).trimStart() : "";
    return (before + "\n\n" + newSections2To5Markdown.trim() + (after ? "\n\n" + after : "")).trim();
  }
  const sec6 = trimmed.match(/\n##\s+(?:6\.\s+)?Seguridad\b/i);
  if (sec6 && sec6.index != null) {
    return (trimmed.slice(0, sec6.index).trim() + "\n\n" + newSections2To5Markdown.trim() + "\n\n" + trimmed.slice(sec6.index).trim()).trim();
  }
  return (trimmed + "\n\n" + newSections2To5Markdown.trim()).trim();
}

/**
 * Devuelve el rango [start, end) de la sección 6 (Seguridad) o 7 (Infraestructura) en el draft.
 * Usado para reemplazar solo esa sección sin tocar §1–§5 (evitar sobrescribir §3/§4 desde structured).
 */
export function getSection6Or7Range(
  draft: string,
  section: 6 | 7,
): { start: number; end: number; heading: string } | null {
  const trimmed = (draft ?? "").trim();
  const re =
    section === 6
      ? /(?:^|\n)(##\s+(?:6\.\s+)?Seguridad\b[^\n]*)/im
      : /(?:^|\n)(##\s+(?:7\.\s+)?(?:Infraestructura|Integración)\b[^\n]*)/im;
  const m = trimmed.match(re);
  if (!m || m.index == null) return null;
  const heading = m[1] ?? (section === 6 ? "## 6. Seguridad" : "## 7. Infraestructura");
  const start = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const afterHeading = start + heading.length;
  const rest = trimmed.slice(afterHeading).replace(/^\s*\n+/, "");
  const nextH2 = rest.search(/\n##\s+/);
  const end = nextH2 >= 0 ? afterHeading + nextH2 : trimmed.length;
  return { start, end, heading };
}

/**
 * Reemplaza solo la sección 6 (Seguridad) o 7 (Infraestructura) en el draft por newSectionMarkdown.
 * newSectionMarkdown debe incluir el heading canónico (## 6. Seguridad o ## 7. Infraestructura) y el cuerpo.
 * Si la sección no existe, la inserta antes de la otra (§6 antes de §7) o al final.
 * Preserva §1–§5 del draft entrante (no reconstruye desde mddStructured).
 */
export function replaceSection6Or7InDraft(
  draft: string,
  section: 6 | 7,
  newSectionMarkdown: string,
): string {
  let sectionMd = newSectionMarkdown.trim();
  if (section === 6) {
    sectionMd = sectionMd.replace(/\s*--\s*\n*$/, "").trim();
  }
  const trimmed = (draft ?? "").trim();
  const range = getSection6Or7Range(trimmed, section);
  if (range) {
    const before = trimmed.slice(0, range.start);
    const after = range.end < trimmed.length ? trimmed.slice(range.end).trimStart() : "";
    return (before + sectionMd + (after ? "\n\n" + after : "")).trim();
  }
  const otherRange = getSection6Or7Range(trimmed, section === 6 ? 7 : 6);
  if (section === 6 && otherRange) {
    return (trimmed.slice(0, otherRange.start) + sectionMd + "\n\n" + trimmed.slice(otherRange.start)).trim();
  }
  if (section === 7 && otherRange) {
    return (trimmed.slice(0, otherRange.end) + "\n\n" + sectionMd + (otherRange.end < trimmed.length ? "\n\n" + trimmed.slice(otherRange.end) : "")).trim();
  }
  return (trimmed + "\n\n" + sectionMd).trim();
}

/** Línea que es solo el título de la sección (evitar duplicar "6. Seguridad" en el cuerpo). */
const reSection6TitleOnly = /^\s*(###?\s*)?6\.\s*Seguridad\s*$/i;

/** Detecta subsección por número (6.1, 6.2) o por **Título:** */
const reSection6SubsectionNum = /^\d+\.\d+\s+.+$/;
const reSection6BoldHeading = /^\*\*[^*]+\*\*:\s*$/; // **Autenticación y Autorización:**

const SECTION6_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Formato canónico §6: ## Aspectos Generales + párrafo intro + ### A. / B. / C. con * bullets; Conclusión en blockquote.
 */
function formatSection6AspectosGenerales(lines: string[]): string {
  const normalized = lines
    .map((c) => c.replace(/^#+\s*/, "").replace(/^-\s*/, "").trim())
    .filter((c) => c && !reSection6TitleOnly.test(c));
  const intro: string[] = [];
  const groups: { title: string; lines: string[] }[] = [];
  let i = 0;
  while (i < normalized.length) {
    const line = normalized[i]!;
    if (reSection6BoldHeading.test(line)) {
      const title = line.replace(/^\*\*|\*\*:\s*$/g, "").trim();
      const groupLines: string[] = [];
      i++;
      while (i < normalized.length && !reSection6BoldHeading.test(normalized[i]!)) {
        groupLines.push(normalized[i]!);
        i++;
      }
      groups.push({ title, lines: groupLines });
    } else {
      intro.push(line);
      i++;
    }
  }
  const out: string[] = [];
  if (intro.length) out.push(intro.join(" ").trim(), "");
  groups.forEach((g, idx) => {
    const letter = SECTION6_LETTERS[idx] ?? String(idx + 1);
    const title = g.title.trim();
    if (/^conclusi[oó]n$/i.test(title)) {
      const text = g.lines.length ? g.lines.join(" ").trim() : "(Pendiente.)";
      out.push("> **Conclusión:** " + text, "");
      return;
    }
    out.push(`### ${letter}. ${title}`);
    out.push("");
    g.lines.forEach((l) => out.push("* " + l));
    out.push("");
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Agrupa líneas de contenido por subsecciones 6.1/6.2 o **X:**; 4 espacios para ítem, 8 para hijos. */
function formatSection6ContentLines(lines: string[]): string {
  const sub = "    - "; // 4 espacios = primer nivel
  const subSub = "        - "; // 8 espacios = bajo subsección
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i]!.trim();
    if (!line) {
      i++;
      continue;
    }
    line = line.replace(/^#+\s*/, "").replace(/^-\s*/, "").trim();
    if (reSection6TitleOnly.test(line)) {
      i++;
      continue;
    }
    const isSubsectionNum = reSection6SubsectionNum.test(line);
    const isBoldHeading = reSection6BoldHeading.test(line);
    if (isSubsectionNum || isBoldHeading) {
      const label = line.endsWith(":") ? line : line + ":";
      out.push(sub + label);
      i++;
      while (i < lines.length) {
        const raw = lines[i]!.trim();
        const next = raw.replace(/^-\s*/, "");
        if (!next) {
          i++;
          continue;
        }
        if (reSection6SubsectionNum.test(next) || reSection6BoldHeading.test(next)) break;
        out.push(subSub + next);
        i++;
      }
    } else {
      out.push(sub + line);
      i++;
    }
  }
  return out.length ? out.join("\n") : sub + "(Pendiente.)";
}

/** Convierte array de items { title, content } a markdown de la sección 6 (Seguridad). Categoría con -; subniveles 4 espacios; bajo 6.1/6.2 etc. 8 espacios. Sin "--" al final. */
export function seguridadItemsToSection6Markdown(
  items: Array<{ title: string; content: string[] }>,
): string {
  if (!items?.length) return "## 6. Seguridad\n\n(Pendiente de definir.)";
  const filtered =
    items.length > 1
      ? items.filter((item) => {
          const t = (item.title ?? "").trim().replace(/^\d+\.\d*\s*/, "");
          return t && t !== "Seguridad" && !/^6\.\s*Seguridad$/i.test(t);
        })
      : items;
  const reLineSeguridad = /^\s*(-\s*)?##\s*6\.\s*Seguridad\s*$/i;
  const parts = filtered.map((item) => {
    let title = (item.title ?? "").replace(/^\d+\.\d*\s*/, "").replace(/^#+\s*/, "").trim();
    if (filtered.length === 1 && (!title || title === "Seguridad")) title = "Aspectos generales";
    let lines = Array.isArray(item.content) ? item.content.filter(Boolean) : [String(item.content ?? "").trim()].filter(Boolean);
    lines = lines
      .filter((c) => !reLineSeguridad.test(c.trim()))
      .map((c) => c.replace(/^#+\s*/, "").replace(/^-\s*/, "").trim())
      .filter((c) => !reSection6TitleOnly.test(c));
    // Un solo ítem "Aspectos generales" → formato canónico: ## Aspectos Generales + intro + ### A./B./C. + * bullets; Conclusión en blockquote
    if (filtered.length === 1 && /^Aspectos\s+generales$/i.test(title)) {
      const body = lines.length ? formatSection6AspectosGenerales(lines) : "(Pendiente de definir.)";
      return `## Aspectos Generales\n\n${body}`;
    }
    const subBullets = lines.length ? formatSection6ContentLines(lines) : "    - (Pendiente.)";
    const label = title.endsWith(":") ? title : title + ":";
    return `- ${label}\n${subBullets}`;
  });
  let body = parts.length ? parts.join("\n\n") : "(Pendiente de definir.)";
  body = body.replace(/\s*--\s*\n*$/, "").replace(/(\n\s*-\s*)+$/, "").trim();
  return "## 6. Seguridad\n\n" + body;
}

/** Convierte objeto integracion (subsections + manifest) a markdown de la sección 7. */
export function integracionToSection7Markdown(integracion: {
  subsections?: Array<{ title: string; content: string | string[] }>;
  manifest?: Record<string, unknown>;
}): string {
  const subs = integracion?.subsections ?? [];
  let body = subs.length
    ? subs
      .map((s) => {
        const c = s.content;
        const text = typeof c === "string" ? c : Array.isArray(c) ? c.join("\n") : "";
        return `### ${s.title}\n\n${text}`;
      })
      .join("\n\n")
    : "(Pendiente de definir.)";
  const manifest =
    integracion?.manifest && typeof integracion.manifest === "object"
      ? integracion.manifest
      : buildNewFormatManifestFromIdentifiedTerms([]);
  body += "\n\n### Manifest de Infraestructura\n\n```json\n" + JSON.stringify(manifest, null, 2) + "\n```";
  return "## 7. Infraestructura\n\n" + body;
}

/** Extrae el cuerpo de la sección ## 3. Modelo de Datos (hasta el siguiente ## o fin). */
export function extractSection3Body(draft: string): string | null {
  const body = getSectionBody((draft ?? "").trim(), /##\s*3\.\s*Modelo\s+(?:de\s+)?datos/i);
  return body && body.length > 0 ? body : null;
}

const DEBUG_S3_ENV = "DEBUG_MDD_SECTION3";
const DEBUG_S3_PREVIEW_LEN = 800;

/**
 * Si DEBUG_MDD_SECTION3=1, escribe en consola el cuerpo de §3 (longitud + preview) para comparar
 * post-SA vs final y localizar dónde se pierde el contenido.
 */
export function logSection3Debug(label: string, draft: string): void {
  if (process.env[DEBUG_S3_ENV] !== "1" && process.env[DEBUG_S3_ENV] !== "true") return;
  const body = extractSection3Body(draft);
  const len = body?.length ?? 0;
  const preview = body ? body.slice(0, DEBUG_S3_PREVIEW_LEN).replace(/\n/g, " ") + (body.length > DEBUG_S3_PREVIEW_LEN ? "…" : "") : "(sin §3)";
  const tables = body ? (body.match(/CREATE\s+TABLE\s+(\w+)/gi) ?? []).join(", ") : "";
  console.log(`[MDD:§3 DEBUG] ${label} len=${len} tables=[${tables}] preview=${preview}`);
}

/** Extrae el cuerpo de la sección ## 4. Contratos de API (hasta el siguiente ## o fin). */
export function extractSection4Body(draft: string): string | null {
  const body = getSectionBody(
    (draft ?? "").trim(),
    /##\s*4\.\s*Contratos\s+de\s+API|##\s*3\.\s*Contratos\s+de\s+API|##\s*Contratos\s+de\s+API/i,
  );
  return body && body.length > 0 ? body : null;
}

/**
 * Extrae SQL del cuerpo de §3 cuando no está en bloque ```sql (parse tolerante).
 * Busca CREATE TABLE y toma hasta el siguiente ``` o hasta un bloque ```mermaid/TechnicalMetadata.
 */
function extractSqlFromSection3Fallback(markdown: string): string {
  const trimmed = (markdown ?? "").trim();
  const createIdx = trimmed.search(/\bCREATE\s+TABLE\b/i);
  if (createIdx === -1) return "";
  const fromCreate = trimmed.slice(createIdx);
  const nextBlock = fromCreate.search(/\n?\s*```\s*(?:mermaid|sql|TechnicalMetadata|json)/i);
  const chunk = nextBlock >= 0 ? fromCreate.slice(0, nextBlock) : fromCreate;
  return chunk.trim();
}

/** Parsea cuerpo de §3 (markdown con ```sql, ```mermaid, ```TechnicalMetadata) a modeloDatos. Para merge en mddStructured cuando el SA genera §3. Más tolerante: si hay CREATE TABLE pero no ```sql, extrae SQL por heurística. */
export function parseModeloDatosFromSection3Markdown(markdown: string): {
  sql: string;
  diagramaEr?: string;
  technicalMetadata?: string[];
} | null {
  const trimmed = (markdown ?? "").trim();
  if (!trimmed) return null;
  const sqlMatch = trimmed.match(/```sql\s*([\s\S]*?)```/i);
  let sql = sqlMatch?.[1]?.trim() ?? "";
  if (!sql && /CREATE\s+TABLE/i.test(trimmed)) sql = extractSqlFromSection3Fallback(trimmed);
  if (!sql) return null;
  const mermaidMatch = trimmed.match(/```mermaid\s*([\s\S]*?)```/i);
  const diagramaEr = mermaidMatch?.[1]?.trim();
  const metaMatch = trimmed.match(/```TechnicalMetadata\s*([\s\S]*?)```/i);
  const metaRaw = metaMatch?.[1]?.trim();
  const technicalMetadata = metaRaw
    ? metaRaw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => /^\[.*\]$/.test(s))
    : ["[high_security]"];
  return { sql, diagramaEr, technicalMetadata };
}

const OUTPUT_PREFIX_LEN = 200;

/** Log resumido de la salida de un nodo (len, section2, prefijo) para depurar pipeline MDD. */
export function logMddNodeOutput(nodeName: string, draft: string): void {
  const trimmed = (draft ?? "").trim();
  const sum = getMddDraftSummary(trimmed);
  const prefix = trimmed.slice(0, OUTPUT_PREFIX_LEN).replace(/\s+/g, " ").trim();
  const suffix = trimmed.length > OUTPUT_PREFIX_LEN ? "…" : "";
  console.log(
    `[MDD:${nodeName}] output len=${sum.length} section2=${sum.section2} prefix=${JSON.stringify(prefix + suffix)}`
  );
}

/**
 * Valida la estructura del MDD: sección 3 con payloads, secciones presentes, TechnicalMetadata, orden.
 * Usado por tools del Auditor y Redactor.
 */
export function validateMddStructure(draft: string): ValidateMddStructureResult {
  const trimmed = (draft || "").trim();
  const issues: string[] = [];
  const missingSections: string[] = [];
  const foundOrder: string[] = [];
  const withNewline = "\n" + (trimmed.startsWith("#") ? trimmed : "# " + trimmed);

  for (let i = 0; i < SECTION_ORDER.length; i++) {
    const { pattern } = SECTION_ORDER[i];
    const re = /\n(##\s+[^\n]+)/gi;
    let match: RegExpExecArray | null = null;
    let sectionFound = false;
    while ((match = re.exec(withNewline)) !== null) {
      if (pattern.test(match[1])) {
        const bodyStart = match.index + match[0].length;
        const rest = withNewline.slice(bodyStart).replace(/^\s*\n+/, "");
        const nextH2 = rest.search(/\n##\s+/);
        const body = (nextH2 !== -1 ? rest.slice(0, nextH2) : rest).trim();
        if (body.length > 0) foundOrder.push(SECTION_HEADINGS_CANONICAL[i]);
        sectionFound = true;
        break;
      }
    }
    if (!sectionFound) missingSections.push(SECTION_HEADINGS_CANONICAL[i]);
  }

  const section4Body = getSectionBody(trimmed, /##\s*4\.\s*Contratos\s+de\s+API|##\s*3\.\s*Contratos\s+de\s+API|##\s*Contratos\s+de\s+API/i);
  const section3HasPayloads =
    !!section4Body &&
    section4Body.length >= 100 &&
    !/^\s*\(?\s*(Pendiente|Falta):\s*definir\s+endpoints/i.test(section4Body) &&
    (/```json/i.test(section4Body) || /\b(POST|GET|PUT|DELETE|PATCH)\s+[\"']?\//i.test(section4Body) || /###\s+(POST|GET|PUT|DELETE|PATCH)/i.test(section4Body));

  if (!section3HasPayloads && section4Body !== null) {
    issues.push("Sección 4. Contratos de API: debe incluir tabla de endpoints y al menos 2-3 endpoints con request/response en bloques ```json.");
  }
  if (missingSections.length > 0) {
    issues.push("Secciones faltantes: " + missingSections.join(", "));
  }

  const hasTechnicalMetadata =
    /TechnicalMetadata|\[high_security\]|\[external_api\]|\[multi_tenant\]|\[cicd_pipeline\]|\[real_time\]/i.test(trimmed);

  if (!hasTechnicalMetadata) {
    issues.push("Falta bloque TechnicalMetadata con etiquetas (ej. [high_security], [external_api]) en la sección 3. Modelo de Datos.");
  }

  const sectionOrderCorrect =
    foundOrder.length === 0 ||
    foundOrder.every((h, idx) => h === SECTION_HEADINGS_CANONICAL[idx]);

  return {
    section3HasPayloads,
    missingSections,
    hasTechnicalMetadata,
    sectionOrderCorrect,
    issues,
  };
}

/** Títulos canónicos en orden para reordenar y deduplicar el MDD (7 secciones). */
const SECTION_ORDER = [
  { pattern: /^##\s+1\.\s*Contexto/i, heading: "## 1. Contexto" },
  { pattern: /^##\s+2\.\s*Arquitectura\s+y\s*Stack/i, heading: "## 2. Arquitectura y Stack" },
  { pattern: /^##\s+3\.\s*Modelo\s+(?:de\s+)?datos/i, heading: "## 3. Modelo de Datos" },
  { pattern: /^##\s+4\.\s*Contratos\s+de\s+API/i, heading: "## 4. Contratos de API" },
  { pattern: /^##\s+5\.\s*Lógica\s+y\s*Edge\s+Cases/i, heading: "## 5. Lógica y Edge Cases" },
  { pattern: /^##\s+6\.\s*Seguridad\b/i, heading: "## 6. Seguridad" },
  { pattern: /^##\s+7\.\s*Infraestructura\b/i, heading: "## 7. Infraestructura" },
  { pattern: /^##\s+Seguridad\b/i, heading: "## 6. Seguridad" },
  { pattern: /^##\s+Integración\b/i, heading: "## 7. Infraestructura" },
];

/**
 * Índice del siguiente ## que NO está dentro de un bloque con fences (```...```).
 * Así no cortamos una sección en un ## que sea contenido literal (ej. dentro de ```markdown).
 */
function indexOfNextH2OutsideFenced(text: string, fromIndex: number): number {
  const rest = text.slice(fromIndex);
  const re = /\n##\s+/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(rest)) !== null) {
    const pos = fromIndex + match.index;
    const before = text.slice(0, pos);
    const fences = (before.match(/```/g) || []).length;
    if (fences % 2 === 0) return pos;
  }
  return -1;
}

/**
 * Extrae el contenido de una sección (desde la línea del heading hasta el siguiente ## o fin).
 * No considera ## que estén dentro de bloques ```...``` para no partir en contenido embebido.
 */
function extractSection(draft: string, startIndex: number): { heading: string; body: string } {
  const afterStart = draft.slice(startIndex).replace(/^\s*\n+/, "");
  const firstNewline = afterStart.indexOf("\n");
  const heading = firstNewline !== -1 ? afterStart.slice(0, firstNewline).trim() : afterStart.trim();
  const bodyStartRel = firstNewline !== -1 ? firstNewline + 1 : afterStart.length;
  const rest = afterStart.slice(bodyStartRel);
  const nextH2 = indexOfNextH2OutsideFenced(draft, startIndex + bodyStartRel);
  const bodyEnd = nextH2 !== -1 ? nextH2 - startIndex - bodyStartRel : rest.length;
  const body = rest.slice(0, bodyEnd).replace(/^\s*\n+/, "").trim();
  return { heading, body };
}

/** Si el cuerpo de la sección 2 contiene ## 3, ## 4 (Contratos o Arquitectura Frontend), ### 4.x (frontend) o bloque ```markdown con ##, es contenido desplazado; reemplazar por placeholder. */
function sanitizeArquitecturaStackBody(body: string): string {
  const hasMisplaced =
    /##\s*3\.\s*Modelo\s+(?:de\s+)?datos/i.test(body) ||
    /##\s*4\.\s*Contratos\s+de\s+API/i.test(body) ||
    /##\s*4\.\s*Arquitectura\s+Frontend/i.test(body) ||
    /###\s*4\.\d+/i.test(body) ||
    /###\s*4\.\s/i.test(body) ||
    /```markdown\s*[\s\S]*?##\s*[34]\./i.test(body);
  if (hasMisplaced) return "(Pendiente: Arquitecto de Software)";
  return body;
}

/**
 * Reordena el MDD a 1..7 y elimina secciones duplicadas.
 * No parte en ## que estén dentro de bloques ```. Si la sección 2 contiene ## 3/## 4 embebidos, la reemplaza por placeholder.
 */
export function deduplicateAndReorderMddSections(draft: string): string {
  let trimmed = (draft || "").trim();
  if (!trimmed) return draft;
  // Corregir §6 pegada a ### antes de extraer (evita que extractSection tome "## 6. Seguridad###..." como una sola línea)
  trimmed = trimmed.replace(/(6\.\s*Seguridad)\s*(#{1,6})/gi, "$1\n\n$2");
  const titleMatch = trimmed.match(/^#\s+Master\s+Design\s+Document[^\n]*/i);
  const title = titleMatch ? titleMatch[0] : "# Master Design Document";
  const afterTitle = titleMatch ? trimmed.slice(titleMatch[0].length).replace(/^\s*\n+/, "") : trimmed;
  const withNewline = "\n" + afterTitle;
  const sections: Array<{ heading: string; body: string }> = [];
  for (const { pattern } of SECTION_ORDER) {
    const re = /\n(##\s+[^\n]+)/gi;
    let match: RegExpExecArray | null = null;
    const candidates: Array<{ heading: string; body: string }> = [];
    while ((match = re.exec(withNewline)) !== null) {
      const line = match[1];
      if (pattern.test(line)) {
        const { heading: actualHeading, body } = extractSection(withNewline, match.index);
        let bodyToUse = body;
        if (/^##\s*2\.\s*Arquitectura\s+y\s*Stack/i.test(actualHeading))
          bodyToUse = sanitizeArquitecturaStackBody(body);
        candidates.push({ heading: actualHeading, body: bodyToUse });
      }
    }
    if (candidates.length === 0) continue;
    const best = candidates.reduce((a, b) => (a.body.length >= b.body.length ? a : b));
    sections.push(best);
  }
  if (sections.length === 0) return draft;
  const out = [title, "", ...sections.flatMap((s) => ["---", s.heading, "", s.body, ""])];
  const result = out.join("\n").trim();
  if (result.length < trimmed.length * 0.5) return draft;
  return result;
}

/** Inserta `---` antes de cada `##` que no tenga ya una línea `---` inmediatamente anterior. */
function ensureHorizontalRuleBeforeH2(draft: string): string {
  const lines = draft.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isH2 = /^##\s+/.test(line);
    const prevLine = result[result.length - 1] ?? "";
    if (isH2 && prevLine.trim() !== "---") {
      // No insertar --- antes del primer ## si va justo tras el título # (opcional: siempre insertar)
      if (result.length > 0) result.push("---");
    }
    result.push(line);
  }
  return result.join("\n");
}

/** Extrae el primer objeto/array JSON de una línea (desde { o [ hasta el cierre balanceado). */
function extractJsonFromLine(line: string): { json: string; start: number; end: number } | null {
  const open = line.indexOf("{");
  const openBracket = line.indexOf("[");
  const start = open === -1 ? openBracket : openBracket === -1 ? open : Math.min(open, openBracket);
  if (start === -1) return null;
  const openChar = line[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < line.length; i++) {
    if (line[i] === openChar) depth++;
    else if (line[i] === closeChar) {
      depth--;
      if (depth === 0) return { json: line.slice(start, i + 1), start, end: i + 1 };
    }
  }
  return null;
}

/** Asegura que la fila de tabla cierre con | (evita errores de parseo en Backstage y otros). */
function ensureTrailingTablePipe(row: string): string {
  const t = row.trimEnd();
  return t.endsWith("|") ? t : t + " |";
}

/**
 * Solo parte en límites de fila: | seguido de | y luego --- (separador), POST/GET/etc, o /ruta (datos).
 * No parte en | | que sea una celda vacía dentro de la misma fila.
 */
const TABLE_ROW_BOUNDARY = /\|\s*\|(?=\s*(?:-{2,}|(?:POST|GET|PUT|DELETE|PATCH)\s*\||\/))/gi;

/**
 * Colapsa líneas en blanco entre fila de cabecera de tabla (| ... |) y fila separador (|---|).
 * Muchos renderers rompen la tabla si hay línea vacía entre ambas.
 */
function collapseBlankBetweenTableHeaderAndSeparator(body: string): string {
  return body.replace(
    /(\|[^\n]+)\n(\s*\n)+(\|\s*[-|\s]+\|[^\n]*)/g,
    "$1\n$3"
  );
}

/** Parte una línea con varias filas de tabla concatenadas (ej. 8 celdas en tabla de 4 columnas) en una fila por línea. */
function splitConcatenatedTableRows(line: string, colCount = 4): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.includes("|")) return [line];
  const parts = trimmed.split("|").map((p) => p.trim());
  const cells =
    parts.length >= 2 && parts[0] === "" && parts[parts.length - 1] === "" ? parts.slice(1, -1) : parts;
  if (cells.length <= colCount || cells.length % colCount !== 0) return [line];
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += colCount) {
    rows.push("| " + cells.slice(i, i + colCount).join(" | ") + " |");
  }
  return rows;
}

/**
 * Si una línea parece tabla Markdown pero tiene filas concatenadas en una sola línea,
 * separa cada fila en su propia línea (solo en límites de fila, no en cada celda).
 * También quita el pipe final de cada fila para evitar columna vacía en el render.
 */
function fixMarkdownTableRows(body: string): string {
  const collapsed = collapseBlankBetweenTableHeaderAndSeparator(body);
  const lines = collapsed.split(/\n/);
  const out: string[] = [];
  let lastWasTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const hasDoublePipe = /\|\s*\|/.test(trimmed);
    const looksLikeTable = trimmed.includes("|") && (trimmed.includes("---") || /\|[^|]+\|[^|]+\|/.test(trimmed));
    const concatenatedRows = splitConcatenatedTableRows(trimmed, 4);
    if (concatenatedRows.length > 1) {
      if (lastWasTable === false && out.length > 0) out.push("");
      for (const row of concatenatedRows) out.push(ensureTrailingTablePipe(row));
      lastWasTable = true;
      continue;
    }
    if ((looksLikeTable || trimmed.startsWith("|")) && hasDoublePipe) {
      const fixed = trimmed.replace(TABLE_ROW_BOUNDARY, "|\n|").trim();
      const rows = fixed.split("\n");
      if (lastWasTable === false && out.length > 0) out.push("");
      for (const row of rows) out.push(ensureTrailingTablePipe(row.trim()));
      lastWasTable = true;
    } else if (trimmed.startsWith("|") && looksLikeTable) {
      lastWasTable = true;
      out.push(ensureTrailingTablePipe(trimmed));
    } else {
      lastWasTable = false;
      out.push(line);
    }
  }
  return out.join("\n");
}

/**
 * Convierte un bloque de viñetas con pipes (ej. "*   **POST** | `/path` | desc | Auth") en tabla Markdown válida
 * (encabezado + separador + filas con pipes). Así el renderer muestra tabla y no texto plano.
 */
function convertListWithPipesToMarkdownTable(body: string): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const hasPipes = bulletMatch && bulletMatch[1].includes("|");
    if (!bulletMatch || !hasPipes) {
      result.push(line);
      i++;
      continue;
    }
    const block: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const m = l.match(/^\s*[-*]\s+(.+)$/);
      if (!m || !m[1].includes("|")) break;
      block.push(m[1].trim());
      i++;
    }
    if (block.length === 0) {
      i++;
      continue;
    }
    const parseCells = (row: string): string[] =>
      row
        .split("|")
        .map((c) => c.replace(/\*\*([^*]+)\*\*/, "$1").trim())
        .filter((cell, idx, arr) => idx < arr.length - 1 || cell.trim().length > 0);
    const rows = block.map(parseCells);
    const colCount = Math.max(...rows.map((r) => r.length), 2);
    const headers =
      colCount >= 4 ? ["Método", "Ruta", "Descripción", "Auth"] : Array.from({ length: colCount }, (_, j) => `Col${j + 1}`);
    const headerRow = "| " + headers.slice(0, colCount).join(" | ") + " |";
    const sepRow = "|" + Array(colCount).fill(":---").join("|") + "|";
    result.push("", headerRow, sepRow);
    for (const cells of rows) {
      const padded = [...cells];
      while (padded.length < colCount) padded.push("");
      result.push("| " + padded.slice(0, colCount).join(" | ") + " |");
    }
    result.push("");
  }
  return result.join("\n");
}

/**
 * Si la cabecera y el separador están en la misma línea (ej. "| Método | Ruta |---|---|---"),
 * los separa en dos líneas para que la tabla renderice bien.
 */
function splitHeaderAndSeparatorOnSameLine(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const sepRun = trimmed.match(/\|\s*\-{2,}(\|\s*\-{2,})*\s*\|?\s*$/);
    if (sepRun && /[a-zA-Z\u00C0-\u024F]/.test(trimmed) && trimmed.includes("|")) {
      const sepStart = trimmed.length - sepRun[0].length;
      const headerPart = trimmed.slice(0, sepStart).trim();
      const colCount = Math.max(
        1,
        headerPart
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean).length,
      );
      const sepRow = "|" + Array(colCount).fill(":---").join("|") + "|";
      const headerNormalized = headerPart.endsWith("|") ? headerPart : headerPart + " |";
      out.push(headerNormalized, sepRow);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Normaliza el texto de la tabla de §4 (contratos): limpia separadores duplicados, convierte viñetas con pipes
 * en tabla Markdown válida y asegura un solo separador bajo el encabezado.
 */
export function normalizeContratosTableSummary(body: string): string {
  let out = splitHeaderAndSeparatorOnSameLine(body);
  out = deduplicateTableSeparators(out);
  out = convertListWithPipesToMarkdownTable(out);
  out = ensureTableSeparatorAfterHeader(out);
  return out;
}

/** True si la línea es la fila separadora de una tabla (solo |, - y espacios; trailing | opcional). */
function isTableSeparatorLine(trimmed: string): boolean {
  const withoutSpaces = trimmed.replace(/\s/g, "");
  if (
    (withoutSpaces.length > 0 &&
      /^[\|\-\:]+$/.test(withoutSpaces) &&
      trimmed.includes("|") &&
      (trimmed.includes("-") || trimmed.includes(":"))) ||
    /^\|[\-\:|]+\|?$/.test(withoutSpaces) ||
    /^[\-\:]+\|/.test(withoutSpaces)
  ) {
    return true;
  }
  if (!trimmed.startsWith("|") || !trimmed.includes("|")) return false;
  const cells = trimmed.split("|").map((c) => c.trim());
  return (
    cells.length >= 2 &&
    cells.some((c) => /-/.test(c)) &&
    cells.every((c) => c === "" || /^[\s\-:]+$/.test(c))
  );
}

/**
 * Elimina separadores duplicados o intercalados: deja solo una fila separadora justo después de la cabecera.
 * Omite líneas en blanco entre cabecera y separador/datos; si llega una fila de datos sin separador, lo inserta.
 */
function deduplicateTableSeparators(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let inTable = false;
  let headerDone = false;
  let separatorDone = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isSeparator = isTableSeparatorLine(trimmed);
    const isTableRow = /^\|\s*.+\s*\|?/.test(trimmed) && trimmed.includes("|");
    if (isTableRow && !isSeparator) {
      if (!inTable) {
        inTable = true;
        headerDone = false;
        separatorDone = false;
      }
      if (inTable && headerDone && !separatorDone) {
        const headerLine = out[out.length - 1];
        const colCount = headerLine
          ? Math.max(
            1,
            headerLine
              .trim()
              .split("|")
              .map((c) => c.trim())
              .filter(Boolean).length,
          )
          : 4;
        out.push("|" + Array(colCount).fill(":---").join("|") + "|");
        separatorDone = true;
      }
      out.push(line);
      if (!headerDone) headerDone = true;
      continue;
    }
    if (isSeparator) {
      if (inTable && headerDone && !separatorDone) {
        out.push(line);
        separatorDone = true;
      }
      continue;
    }
    if (trimmed === "" && inTable) {
      continue;
    }
    inTable = false;
    headerDone = false;
    separatorDone = false;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Añade línea separadora bajo la primera fila con pipes si falta (solo tras la cabecera real, no tras cada fila).
 * Si hay líneas en blanco entre cabecera y la primera fila de datos, no las emite y inserta el separador.
 */
function ensureTableSeparatorAfterHeader(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let i = 0;
  let lastPushedIsHeader = false;
  let separatorPushed = false;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const currentIsSeparator = isTableSeparatorLine(trimmed);
    const looksLikeHeaderRow =
      !currentIsSeparator &&
      /^\|\s*.+\s*\|?/.test(trimmed) &&
      trimmed.includes("|") &&
      /[a-zA-Z\u00C0-\u024F]/.test(trimmed);
    const isDataRow = /^\|\s*.+\s*\|?/.test(trimmed) && trimmed.includes("|") && !currentIsSeparator;

    if (trimmed === "" && lastPushedIsHeader && !separatorPushed) {
      i++;
      continue;
    }
    if (currentIsSeparator) {
      if (separatorPushed) {
        i++;
        continue;
      }
      separatorPushed = true;
    }
    if ((isDataRow || looksLikeHeaderRow) && !separatorPushed) lastPushedIsHeader = true;
    else if (isDataRow || looksLikeHeaderRow) lastPushedIsHeader = false;
    else if (trimmed !== "") {
      lastPushedIsHeader = false;
      separatorPushed = false;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

/**
 * Envuelve JSON minificado (líneas largas sin saltos) en bloques ```json con pretty-print.
 */
function formatContratosBody(body: string): string {
  let normalized = splitHeaderAndSeparatorOnSameLine(body);
  normalized = deduplicateTableSeparators(normalized);
  normalized = convertListWithPipesToMarkdownTable(normalized);
  normalized = ensureTableSeparatorAfterHeader(normalized);
  normalized = fixMarkdownTableRows(normalized);
  // Muchos renderers de markdown requieren línea en blanco antes de la tabla
  if (normalized.trimStart().startsWith("|")) {
    normalized = "\n" + normalized.trimStart();
  }
  const lines = normalized.split(/\n/);
  const result: string[] = [];
  for (const line of lines) {
    if (line.includes("```json") || line.trim().startsWith("```")) {
      result.push(line);
      continue;
    }
    if (line.length < 40 || (!line.includes("{") && !line.includes("["))) {
      result.push(line);
      continue;
    }
    const extracted = extractJsonFromLine(line);
    if (!extracted) {
      result.push(line);
      continue;
    }
    try {
      const parsed = JSON.parse(extracted.json) as unknown;
      const pretty = JSON.stringify(parsed, null, 2);
      const before = line.slice(0, extracted.start).trimEnd();
      const after = line.slice(extracted.end).trimStart();
      if (before) result.push(before);
      result.push("```json", pretty, "```");
      if (after) result.push(after);
    } catch {
      result.push(line);
    }
  }
  return result.join("\n");
}

/**
 * Normaliza `tables` cuando el LLM devuelve array (ej. [{ name: "users", columns: [{ name, type, primaryKey, unique }] }])
 * a formato record esperado por structuredToMarkdown: { "users": { "columns": { "id": "UUID PRIMARY KEY", ... } } }.
 */
export function normalizeTablesToRecord(tables: unknown): Record<string, { columns: Record<string, string> }> | null {
  if (!tables || typeof tables !== "object") return null;
  if (!Array.isArray(tables)) return tables as Record<string, { columns: Record<string, string> }>;

  const record: Record<string, { columns: Record<string, string> }> = {};
  for (const row of tables) {
    const t = row && typeof row === "object" && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
    const name = typeof t.name === "string" ? t.name : "table";
    const colsRaw = t.columns;
    const cols: Record<string, string> = {};
    if (Array.isArray(colsRaw)) {
      for (const c of colsRaw) {
        const col = c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
        const colName = typeof col.name === "string" ? col.name : "id";
        const type = typeof col.type === "string" ? col.type : "VARCHAR(255)";
        const parts = [type];
        if (col.primaryKey) parts.push("PRIMARY KEY");
        if (col.unique) parts.push("UNIQUE");
        if (col.notNull !== false) parts.push("NOT NULL");
        cols[colName] = parts.join(" ");
      }
    }
    record[name] = { columns: Object.keys(cols).length ? cols : { id: "UUID PRIMARY KEY DEFAULT gen_random_uuid()" } };
  }
  return Object.keys(record).length ? record : null;
}

/**
 * Convierte cualquier objeto JSON a Markdown estructurado recursivamente.
 * Reemplaza la lógica anterior estricta por una universal.
 */
export function objectSectionToMarkdown(data: unknown, level = 1): string {
  if (data === null || data === undefined) return "";

  // Si es string/number/boolean, devolverlo directo
  if (typeof data !== "object") return String(data).trim();

  // Si es array, convertir a lista de viñetas
  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === "object" && item !== null) {
        return `- ${JSON.stringify(item)}`;
      }
      return `- ${String(item)}`;
    }).join("\n");
  }

  const out: string[] = [];
  const entries = Object.entries(data as Record<string, unknown>);

  // Detectar si estamos en la raíz y hay una clave contenedora principal "mddDraft" o "Master Design Document"
  if (level === 1 && entries.length === 1 && (entries[0][0] === "mddDraft" || entries[0][0] === "Master Design Document")) {
    return objectSectionToMarkdown(entries[0][1], level);
  }

  // Detectar wrapper { "Master Design Document": ... } junto con otras claves
  if (level === 1 && entries.some(e => e[0] === "Master Design Document")) {
    const mdd = (data as Record<string, unknown>)["Master Design Document"];
    if (mdd) out.push(objectSectionToMarkdown(mdd, level));
    for (const [key, val] of entries) {
      if (key === "Master Design Document") continue;
      out.push(objectSectionToMarkdown({ [key]: val }, level));
    }
    return out.join("\n\n").trim();
  }

  // Título principal si level=1 y no hay wrapper obvio
  if (level === 1) {
    out.push("# Master Design Document", "");
  }

  for (const [key, val] of entries) {
    if (val === undefined || val === null) continue;

    const headingPrefix = "#".repeat(Math.min(level + 1, 6)); // Start at H2 for keys at level 1

    // Heurísticas de formato para bloques de código
    if (typeof val === "string") {
      const trimmed = val.trim();
      // Si ya tiene bloques de código, imprimir tal cual
      if (trimmed.startsWith("```")) {
        out.push(`${headingPrefix} ${key}`, "", trimmed, "");
        continue;
      }
      // Si parece SQL
      if (key.toLowerCase().includes("sql") || trimmed.includes("CREATE TABLE") || trimmed.includes("SELECT ")) {
        out.push(`${headingPrefix} ${key}`, "", "```sql", trimmed, "```", "");
        continue;
      }
      // Texto normal
      out.push(`${headingPrefix} ${key}`, "", trimmed, "");
      continue;
    }

    if (key === "request" || key === "response" || key === "body" || key === "payload") {
      if (typeof val === "object") {
        out.push(`${headingPrefix} ${key}`, "", "```json", JSON.stringify(val, null, 2), "```", "");
        continue;
      }
    }

    // Si es array
    if (Array.isArray(val)) {
      out.push(`${headingPrefix} ${key}`, "");
      // Si es lista de endpoints (objetos), intentar formatear mejor
      if (val.length > 0 && typeof val[0] === "object" && ((val[0] as any).method || (val[0] as any).path || (val[0] as any).endpoint)) {
        for (const item of val) {
          const method = (item as any).method || (item as any).type || "ITEM";
          const path = (item as any).path || (item as any).endpoint || "";
          const label = path ? `${method} ${path}` : method;
          out.push(objectSectionToMarkdown({ [label]: item }, level + 1));
        }
      } else {
        const list = val.map(item => {
          if (typeof item === "object") return `- ${JSON.stringify(item)}`;
          return `- ${String(item)}`;
        }).join("\n");
        out.push(list, "");
      }
      continue;
    }

    // Si es objeto regular
    out.push(`${headingPrefix} ${key}`, "");
    out.push(objectSectionToMarkdown(val, level + 1), "");
  }

  return out.join("\n").trim();
}
