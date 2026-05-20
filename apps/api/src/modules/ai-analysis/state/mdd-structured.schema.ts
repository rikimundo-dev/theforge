import { z } from "zod";

/**
 * Schema estructurado del MDD (Master Design Document).
 * Cada agente devuelve un slice; se hace merge en mddStructured y el markdown se genera con mddStructuredToMarkdown.
 * Forma de cada sección:
 * - contextoAlcance: string (prosa/markdown).
 * - modeloDatos: { sql, diagramaEr?, technicalMetadata? }.
 * - contratosApi: { summary?, endpoints[] } con method, path, description?, requestBody?, responses?.
 * - arquitecturaFrontend: string (markdown sección 4).
 * - seguridad: array de { title, content: string[] } (viñetas por subsección).
 * - integracion: subsections[] + manifest? o array de { title, content }.
 * - customSections: extensibilidad para nuevas secciones (ej. "5. Riesgos").
 */

/** Una subsección de Seguridad: título + viñetas o párrafos. */
export const mddSeguridadItemSchema = z.object({
  title: z.string(),
  content: z.array(z.string()),
});
export type MddSeguridadItem = z.infer<typeof mddSeguridadItemSchema>;

/** Subsección de Integración: título + array de viñetas (obligatorio, como seguridad). */
export const mddIntegracionSubsectionSchema = z.object({
  title: z.string(),
  content: z.array(z.string()),
});
export type MddIntegracionSubsection = z.infer<typeof mddIntegracionSubsectionSchema>;

/** Integración: subsections + manifest opcional (JSON de infra). */
export const mddIntegracionWithManifestSchema = z.object({
  subsections: z.array(mddIntegracionSubsectionSchema),
  manifest: z.record(z.unknown()).optional(),
});
export type MddIntegracionWithManifest = z.infer<typeof mddIntegracionWithManifestSchema>;

/** Modelo de datos: SQL, diagrama ER (mermaid sin fences), metadata. */
export const mddModeloDatosSchema = z.object({
  sql: z.string(),
  diagramaEr: z.string().optional(),
  technicalMetadata: z.array(z.string()).optional(),
});
export type MddModeloDatos = z.infer<typeof mddModeloDatosSchema>;

/** Endpoint en Contratos de API. */
export const mddEndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string().optional(),
  requestBody: z.string().optional(),
  responses: z.record(z.string()).optional(),
});
export type MddEndpoint = z.infer<typeof mddEndpointSchema>;

/** Contratos de API: tabla resumen opcional + endpoints. */
export const mddContratosApiSchema = z.object({
  summary: z.string().optional(),
  endpoints: z.array(mddEndpointSchema).optional(),
});
export type MddContratosApi = z.infer<typeof mddContratosApiSchema>;

/** Sección custom (extensibilidad). */
export const mddCustomSectionSchema = z.object({
  heading: z.string(),
  body: z.string(),
});
export type MddCustomSection = z.infer<typeof mddCustomSectionSchema>;

/** Integración: array de subsecciones O objeto con subsections + manifest. */
export const mddIntegracionSchema = z.union([
  z.array(mddIntegracionSubsectionSchema),
  mddIntegracionWithManifestSchema,
]);
export type MddIntegracion = z.infer<typeof mddIntegracionSchema>;

/**
 * Documento MDD estructurado. Fuente de verdad; el markdown se deriva con mddStructuredToMarkdown.
 * Estructura canónica: 1. Contexto, 2. Arquitectura y Stack, 3. Modelo de Datos, 4. Contratos de API,
 * 5. Lógica y Edge Cases, 6. Seguridad, 7. Infraestructura.
 */
export const mddStructuredSchema = z.object({
  title: z.string().optional(),
  /** 1. Contexto */
  contextoAlcance: z.string().optional(),
  /** 2. Arquitectura y Stack */
  arquitecturaStack: z.string().optional(),
  /** 3. Modelo de datos */
  modeloDatos: mddModeloDatosSchema.optional(),
  /** 4. Contratos de API */
  contratosApi: mddContratosApiSchema.optional(),
  /** 5. Lógica y Edge Cases */
  logicaEdgeCases: z.string().optional(),
  /** 6. Seguridad */
  seguridad: z.array(mddSeguridadItemSchema).optional(),
  /** 7. Infraestructura (antes Integración) */
  integracion: mddIntegracionSchema.optional(),
  /** 4 legacy / compat: Arquitectura Frontend (mapeable a arquitecturaStack o custom) */
  arquitecturaFrontend: z.string().optional(),
  customSections: z.array(mddCustomSectionSchema).optional(),
});
export type MddStructured = z.infer<typeof mddStructuredSchema>;

/** Orden canónico de secciones del MDD (1..7). */
export const MDD_SECTION_ORDER = [
  "1. Contexto",
  "2. Arquitectura y Stack",
  "3. Modelo de Datos",
  "4. Contratos de API",
  "5. Lógica y Edge Cases",
  "6. Seguridad",
  "7. Infraestructura",
] as const;

/** Matriz de delegación: sección → agente(s) responsable(s). Sin traslape. */
export const MDD_SECTION_TO_AGENTS: Record<string, string[]> = {
  "1. Contexto": ["clarifier"],
  "2. Arquitectura y Stack": ["software_architect"],
  "3. Modelo de Datos": ["software_architect"],
  "4. Contratos de API": ["software_architect"],
  "5. Lógica y Edge Cases": ["software_architect"],
  "6. Seguridad": ["security"],
  "7. Infraestructura": ["integration"],
};

/**
 * Plantilla canónica del MDD (7 secciones) según Specification-Driven Development.
 * Única fuente de verdad para placeholders en Clarifier y Legacy.
 * @param section1Content - Contenido opcional para la sección 1 (Contexto); si no se pasa, se usa "(Pendiente)".
 */
export function getMddTemplatePlaceholder(section1Content?: string): string {
  const s1 = (section1Content ?? "(Pendiente)").trim() || "(Pendiente)";
  return `# Master Design Document

## 1. Contexto

${s1}

## 2. Arquitectura y Stack

(Pendiente)

## 3. Modelo de Datos

(Pendiente)

## 4. Contratos de API

(Pendiente)

## 5. Lógica y Edge Cases

(Pendiente)

## 6. Seguridad

(Pendiente)

## 7. Infraestructura

(Pendiente)`;
}
