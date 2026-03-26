import { Injectable } from "@nestjs/common";

/**
 * Verificación de conformidad de entregables (Blueprint, API, Infra) contra el MDD (Constitución).
 * SDD Plan 10/10: Fase 2 — Conformance check.
 */

export interface ConformanceResult {
  ok: boolean;
  gaps: string[];
}

export interface ApiConformanceResult {
  ok: boolean;
  missingInApi: string[];
  extraInApi: string[];
}

/** Extrae el cuerpo de la primera sección cuyo título coincide con el patrón (hasta el siguiente ##). */
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

/** Forma canónica por tecnología para que "postgres"/"postgresql" y "tailwind"/"tailwindcss" cuenten como match. */
const STACK_CANONICAL: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql",
  sqlite: "sqlite",
  tailwind: "tailwindcss",
  tailwindcss: "tailwindcss",
  vite: "vite",
  webpack: "webpack",
  nestjs: "nestjs",
  react: "react",
  vue: "vue",
  angular: "angular",
  svelte: "svelte",
  prisma: "prisma",
  typeorm: "typeorm",
  docker: "docker",
  dockerfile: "docker",
  "docker-compose": "docker",
  typescript: "typescript",
  javascript: "javascript",
  turborepo: "turborepo",
  nx: "nx",
};

/** Extrae palabras clave de stack/tecnologías (NestJS, React, PostgreSQL, etc.) de un bloque de texto. Devuelve formas canónicas para comparación. */
function extractStackKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  const keywords = new Set<string>();
  const patterns = [
    /\b(nestjs|nestjs\s*v?\d*)\b/gi,
    /\b(react|vue|angular|svelte)\b/gi,
    /\b(postgresql|postgres|mysql|sqlite)\b/gi,
    /\b(prisma|typeorm)\b/gi,
    /\b(docker|dockerfile|docker-compose)\b/gi,
    /\b(typescript|javascript)\b/gi,
    /\b(tailwind|tailwindcss)\b/gi,
    /\b(vite|webpack)\b/gi,
    /\b(turborepo|nx)\b/gi,
  ];
  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.exec(lower)) !== null) {
      const raw = (match[1]?.toLowerCase() ?? "").replace(/\s*v?\d*$/, "");
      const canonical = STACK_CANONICAL[raw] ?? raw;
      if (canonical) keywords.add(canonical);
    }
  }
  return keywords;
}

/** Extrae nombres de entidades/tablas (CREATE TABLE, **Entity**, etc.) de un bloque. */
function extractEntities(text: string): Set<string> {
  const entities = new Set<string>();
  const createTable = text.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?/gi);
  for (const m of createTable) {
    if (m[1]) entities.add(m[1].toLowerCase());
  }
  const bold = text.matchAll(/\*\*([A-Za-z][A-Za-z0-9_]*)\*\*/g);
  for (const m of bold) {
    if (m[1] && m[1].length > 2) entities.add(m[1].toLowerCase());
  }
  return entities;
}

/** Rutas que son mutaciones (login, register, logout, etc.): método por defecto POST, no GET. */
function defaultMethodForPath(path: string): string {
  const lower = path.toLowerCase();
  if (/\/login\/?$|\/register\/?$|\/logout\/?$|\/mfa\/setup\/?$|\/mfa\/verify\/?$|\/auth\/login|\/auth\/register|\/auth\/logout/.test(lower)) {
    return "POST";
  }
  if (/\/assign\/?$|\/create\/?$|\/delete\/?$|\/application\/register\/?$|\/role\/assign\/?$/.test(lower)) return "POST";
  return "GET";
}

/** Extrae métodos + rutas (GET /api/..., POST /auth/...) de un bloque. Acepta líneas sueltas y filas de tabla Markdown (| POST | /api/v1/auth/login | ...). */
function extractEndpoints(text: string): Array<{ method: string; path: string }> {
  const endpoints: Array<{ method: string; path: string }> = [];
  const seen = new Set<string>();
  const add = (method: string, path: string) => {
    const key = `${method.toUpperCase()} ${path.replace(/\/$/, "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    endpoints.push({ method: method.toUpperCase(), path });
  };
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const methodPath = line.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[\w/-]+)/i);
    if (methodPath) {
      add(methodPath[1], methodPath[2]);
      continue;
    }
    const tableRow = line.match(/\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*(\/[\w/-]+)/i);
    if (tableRow) {
      add(tableRow[1], tableRow[2]);
      continue;
    }
    if (/\/api\/|\/auth\//.test(line)) {
      const path = line.match(/(\/[\w/-]+)/)?.[1];
      if (path) {
        add(defaultMethodForPath(path), path);
      }
    }
  }
  return endpoints;
}

/** Normaliza endpoint para comparación (sin trailing slash, lowercase path). */
function normEp(ep: { method: string; path: string }): string {
  let method = ep.method.toUpperCase();
  const path = ep.path.replace(/\/$/, "").toLowerCase();
  if (method === "GET" && defaultMethodForPath(path) === "POST") {
    method = "POST";
  }
  return `${method} ${path}`;
}

/** Longitud mínima para considerar un documento como "con contenido" (evitar falsos Cumple cuando está vacío). */
const MIN_DOC_LENGTH = 80;

/**
 * Solo §3 Modelo de datos vs Blueprint (entidades/tablas). Usado para gate de generación de API.
 */
export function checkBlueprintDataModelVsMdd(
  mddContent: string | null,
  blueprintContent: string | null,
): ConformanceResult {
  const gaps: string[] = [];
  if (!mddContent?.trim()) {
    return { ok: true, gaps: [] };
  }
  if (!blueprintContent?.trim() || blueprintContent.trim().length < MIN_DOC_LENGTH) {
    return {
      ok: false,
      gaps: ["Falta Blueprint con contenido suficiente para validar el modelo de datos (§3 MDD)"],
    };
  }
  const section3 = extractSection(
    mddContent,
    /^#+\s*(?:3\.\s*)?(?:modelo\s+de\s+datos|datos\s*\/\s*entidades)/im,
  );
  if (section3.length <= 50) {
    return { ok: true, gaps: [] };
  }
  const mddEntities = extractEntities(section3);
  const blueprintEntities = extractEntities(blueprintContent);
  for (const e of mddEntities) {
    if (!e || e.length < 2) continue;
    const exactMatch = blueprintEntities.has(e);
    const partialMatch = Array.from(blueprintEntities).some(
      (b) => b.includes(e) || e.includes(b),
    );
    if (!exactMatch && !partialMatch) {
      gaps.push(`Entidad/tabla "${e}" del MDD §3 no está reflejada en el Blueprint`);
    }
  }
  return { ok: gaps.length === 0, gaps };
}

/**
 * Comprueba conformidad del Blueprint con el MDD (§2 Arquitectura y Stack, §3 Modelo de Datos).
 */
export function checkBlueprintVsMdd(mddContent: string | null, blueprintContent: string | null): ConformanceResult {
  const gaps: string[] = [];
  if (!mddContent?.trim()) {
    return { ok: true, gaps: [] };
  }
  if (!blueprintContent?.trim() || blueprintContent.trim().length < MIN_DOC_LENGTH) {
    return { ok: false, gaps: ["Falta contenido del Blueprint"] };
  }
  const section2 = extractSection(
    mddContent,
    /^#+\s*(?:2\.\s*)?(?:arquitectura\s+y\s+stack|arquitectura\s+stack)/im,
  );
  if (section2.length > 50) {
    const mddStack = extractStackKeywords(section2);
    const blueprintStack = extractStackKeywords(blueprintContent);
    for (const kw of mddStack) {
      if (kw && !blueprintStack.has(kw)) {
        gaps.push(`Stack MDD menciona "${kw}" pero no aparece en Blueprint`);
      }
    }
  }
  const dataModel = checkBlueprintDataModelVsMdd(mddContent, blueprintContent);
  gaps.push(...dataModel.gaps);
  return { ok: gaps.length === 0, gaps };
}

/**
 * Comprueba conformidad del documento de API con el MDD (§4 Contratos de API).
 */
export function checkApiVsMdd(mddContent: string | null, apiContent: string | null): ApiConformanceResult {
  const missingInApi: string[] = [];
  const extraInApi: string[] = [];
  if (!mddContent?.trim()) {
    return { ok: true, missingInApi: [], extraInApi: [] };
  }
  const section4 = extractSection(
    mddContent,
    /^#+\s*(?:4\.\s*)?(?:contratos\s+de\s+api|api\s+contracts|endpoints)/im,
  );
  const mddEndpoints = new Set(extractEndpoints(section4).map(normEp));
  if (!apiContent?.trim() || apiContent.trim().length < MIN_DOC_LENGTH) {
    const missing = mddEndpoints.size > 0 ? Array.from(mddEndpoints) : ["Falta contenido del documento API"];
    return {
      ok: false,
      missingInApi: missing,
      extraInApi: [],
    };
  }
  const apiEndpoints = new Set(extractEndpoints(apiContent).map(normEp));
  for (const ep of mddEndpoints) {
    const match = apiEndpoints.has(ep) || Array.from(apiEndpoints).some((a) => a.toLowerCase() === ep.toLowerCase());
    if (!match) missingInApi.push(ep);
  }
  for (const ep of apiEndpoints) {
    const match = mddEndpoints.has(ep) || Array.from(mddEndpoints).some((m) => m.toLowerCase() === ep.toLowerCase());
    if (!match) extraInApi.push(ep);
  }
  const ok = missingInApi.length === 0 && extraInApi.length === 0;
  return { ok, missingInApi, extraInApi };
}

/**
 * Comprueba conformidad del documento de Infra con el MDD (§7 Infraestructura).
 */
export function checkInfraVsMdd(mddContent: string | null, infraContent: string | null): ConformanceResult {
  const gaps: string[] = [];
  if (!mddContent?.trim()) {
    return { ok: true, gaps: [] };
  }
  if (!infraContent?.trim() || infraContent.trim().length < MIN_DOC_LENGTH) {
    return { ok: false, gaps: ["Falta contenido del documento de Infra"] };
  }
  const section7 = extractSection(
    mddContent,
    /^#+\s*(?:7\.\s*)?(?:infraestructura|infra|integraci[oó]n)/im,
  );
  const infraLower = infraContent.trim().toLowerCase();
  if (section7.length > 80) {
    if (/\b(env|variable|variable de entorno|\.env)\b/i.test(section7) && !/\b(env|\.env|variable)\b/i.test(infraLower)) {
      gaps.push("MDD §7 exige variables de entorno; no se mencionan en el doc de Infra");
    }
    if (/\b(docker|dockerfile|docker-compose)\b/i.test(section7) && !/\b(docker|dockerfile|docker-compose)\b/i.test(infraLower)) {
      gaps.push("MDD §7 exige Docker; no aparece en el doc de Infra");
    }
    if (/\b(ci\/cd|pipeline|despliegue)\b/i.test(section7) && !/\b(ci|cd|pipeline|deploy)\b/i.test(infraLower)) {
      gaps.push("MDD §7 exige CI/CD o despliegue; no aparece en el doc de Infra");
    }
  }
  return { ok: gaps.length === 0, gaps };
}

/** Extrae términos de lógica/edge cases (validación, flujo, mermaid, regla, caso de uso, etc.) de un bloque. */
function extractLogicKeywords(text: string): Set<string> {
  const lower = text.toLowerCase();
  const keywords = new Set<string>();
  const patterns = [
    /\b(edge\s+case|caso\s+límite|casos\s+límite)\b/gi,
    /\b(validaci[oó]n|validar|regla\s+de\s+negocio)\b/gi,
    /\b(flujo|flow|sequence|secuencia)\b/gi,
    /\b(mermaid|sequenceDiagram|flowchart)\b/gi,
    /\b(caso\s+de\s+uso|use\s+case)\b/gi,
    /\b(regla|rule|business\s+logic)\b/gi,
    /\b(mfa|2fa|two-factor|autenticaci[oó]n)\b/gi,
  ];
  for (const p of patterns) {
    let match: RegExpExecArray | null;
    while ((match = p.exec(lower)) !== null) {
      keywords.add((match[1] ?? match[0])?.toLowerCase().trim() ?? "");
    }
  }
  return keywords;
}

/**
 * Comprueba conformidad del documento de Flujos de lógica con el MDD (§5 Lógica y Edge Cases).
 */
export function checkLogicFlowsVsMdd(mddContent: string | null, logicFlowsContent: string | null): ConformanceResult {
  const gaps: string[] = [];
  if (!mddContent?.trim()) {
    return { ok: true, gaps: [] };
  }
  // Misma regla que Blueprint/API/Infra: MDD con contenido + entregable vacío/corto → no cumple
  if (!logicFlowsContent?.trim() || logicFlowsContent.trim().length < MIN_DOC_LENGTH) {
    return { ok: false, gaps: ["Falta contenido del documento de Flujos"] };
  }
  const section5 = extractSection(
    mddContent,
    /^#+\s*(?:5\.\s*)?(?:l[oó]gica\s+y\s+edge\s+cases|l[oó]gica\s+edge|edge\s+cases|casos\s+de\s+uso)/im,
  );
  const mddLogic = extractLogicKeywords(section5);
  const flowsLogic = extractLogicKeywords(logicFlowsContent);
  for (const kw of mddLogic) {
    if (kw && kw.length > 2 && !flowsLogic.has(kw)) {
      const inFlows = Array.from(flowsLogic).some((f) => f.includes(kw) || kw.includes(f));
      if (!inFlows) {
        gaps.push(`MDD §5 menciona "${kw}" pero no aparece en Flujos`);
      }
    }
  }
  const mddMentionsDiagrams = /\b(mermaid|diagrama|flowchart|sequence|flujo)\b/i.test(section5);
  if (mddMentionsDiagrams && !/\b(mermaid|sequenceDiagram|flowchart|flujo|diagrama)\b/i.test(logicFlowsContent)) {
    gaps.push("Flujos no incluye diagramas (Mermaid) o descripción de flujos explícita");
  }
  return { ok: gaps.length === 0, gaps };
}

@Injectable()
export class ConformanceService {
  checkBlueprintDataModel(mddContent: string | null, blueprintContent: string | null): ConformanceResult {
    return checkBlueprintDataModelVsMdd(mddContent, blueprintContent);
  }

  checkBlueprint(mddContent: string | null, blueprintContent: string | null): ConformanceResult {
    return checkBlueprintVsMdd(mddContent, blueprintContent);
  }

  checkApi(mddContent: string | null, apiContent: string | null): ApiConformanceResult {
    return checkApiVsMdd(mddContent, apiContent);
  }

  checkLogicFlows(mddContent: string | null, logicFlowsContent: string | null): ConformanceResult {
    return checkLogicFlowsVsMdd(mddContent, logicFlowsContent);
  }

  checkInfra(mddContent: string | null, infraContent: string | null): ConformanceResult {
    return checkInfraVsMdd(mddContent, infraContent);
  }
}
