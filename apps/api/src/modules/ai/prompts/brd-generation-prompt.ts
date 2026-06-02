import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "brd-generation-prompt.md");

function loadBrdGenerationSystemPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      "Eres analista de producto en español. Genera BRD completos en markdown desde el documento fuente, " +
        "con requisitos funcionales, RNF, matriz de permisos, flujos críticos y contratos de datos preliminares. " +
        "Usa «No aplica» con motivo para herramientas internas; «Por validar» solo con entrada en decision log.",
    );
  }
}

export const BRD_GENERATION_SYSTEM = loadBrdGenerationSystemPrompt();

export type BrdGenerationMode = "greenfield-from-dbga" | "legacy-as-is" | "legacy-change";

const BRD_DELIMITERS =
  "Responde **solo** con este formato exacto (delimitadores literales):\n" +
  "<<<BRD>>>\n(markdown BRD completo)\n<<<END_BRD>>>\n";

/** Plantilla de secciones — agnóstica al dominio; el LLM adapta títulos de módulos al fuente. */
export const BRD_SECTION_OUTLINE = `## Estructura obligatoria del BRD (usa estos títulos en español)

# BRD — [nombre del producto o iniciativa]

## Pain Points & Problem Statement
### Mapa de dolores
Tabla: | Dolor | Quién lo siente | Frecuencia/impacto | Workaround actual | Gap |
### Validación de demanda
Señales de mercado o **No aplica — [motivo]** si es desarrollo interno.
### Perfil del cliente / usuarios objetivo
Tamaño de organización, roles, concurrencia estimada (usuarios simultáneos por rol si se puede inferir).
### Costo de la inacción
Estimado mensual/anual de pérdida o ineficiencia (tiempo, dinero, riesgo); si no hay dato, supuesto numerado + «Por validar» en decision log.

## Problema y objetivos de negocio
## Alcance del producto (MVP)
Lista de capacidades incluidas (vincula módulos del fuente).
## Fuera de alcance

## Personas y casos de uso clave
2–4 personas; 1–3 casos de uso por capacidad crítica (formato breve: actor, disparador, resultado).

## Requisitos funcionales por capacidad
Por cada módulo/capacidad del fuente: reglas de negocio, excepciones, integraciones. Usa subsecciones ### [nombre módulo].

## Matriz de permisos
Tabla: | Módulo / capacidad | [roles del fuente] | Notas de confidencialidad (ej. costo real oculto a comercial) |

## Flujos de negocio críticos
Por cada flujo (autorizaciones, sincronización, cotización, etc.):
- Origen → Estados → Notificaciones → Resolución (aprobado/rechazado) → Efecto en sistema origen

## Reglas de negocio y fórmulas
Fórmulas explícitas; umbrales (%, montos, niveles de aprobación).

## Requisitos no funcionales
### Seguridad y confidencialidad (cifrado, auditoría, SSO/M2M si aplica)
### Rendimiento y disponibilidad (SLA/latencia p99 objetivo)
### Volumetría (registros/mes, RPS pico, retención)

## Contratos de datos e integraciones (preliminar)
Por webhook/API: campos obligatorios, tipos, idempotencia, errores HTTP esperados.

## Requisitos UX/UI transversales
Validaciones de captura, máscaras, mensajes de error, accesibilidad si aplica.

## Supuestos y dependencias
## Riesgos
## Métricas de éxito
## Pendientes de validación (decision log)
| Tema | Estado | Dueño sugerido | Impacto | Plazo sugerido |

## Registro de cambios del documento
Tabla | Versión | Fecha | Descripción del cambio | — fila 1.0 en creación; filas incrementales en cada revisión material.`;

export type BuildBrdUserPromptParams = {
  mode: BrdGenerationMode;
  sourceLabel: string;
  sourceDocument: string;
  baselineBrdBlock?: string;
};

function modePreamble(mode: BrdGenerationMode): string {
  switch (mode) {
    case "greenfield-from-dbga":
      return (
        "A partir del **Domain Benchmark / guía de dominio (DBGA)** siguiente, genera **solo el BRD**.\n\n" +
        "Extrae módulos, webhooks, roles SSO, tablas espejo y reglas del DBGA. " +
        "El Pain Points debe reflejar los hallazgos críticos del discovery (dolores, validaciones, gaps).\n\n"
      );
    case "legacy-as-is":
      return (
        "A partir del **MDD inicial / documentación del codebase** siguiente, genera el **BRD del sistema actual** (no es documento de cambio).\n\n" +
        "Refleja fielmente lo documentado: módulos, usuarios, integraciones. " +
        "Pain Points: dolores que el sistema actual resuelve y los que aún persisten según el doc.\n\n"
      );
    case "legacy-change":
      return (
        "A partir del documento siguiente (evidencia del codebase), genera el **BRD de cambio** (solo lo que cambia).\n\n" +
        "No redescribas el sistema completo. Pain Points centrados en el delta. Cita rutas/módulos tocados.\n\n"
      );
  }
}

/**
 * Mensaje de usuario para `suggest-brd-from-dbga` y `suggest-brd-from-codebase-doc`.
 */
export function buildBrdUserPrompt(params: BuildBrdUserPromptParams): string {
  const baseline = params.baselineBrdBlock?.trim() ? `${params.baselineBrdBlock.trim()}\n\n` : "";
  return (
    modePreamble(params.mode) +
    BRD_SECTION_OUTLINE +
    "\n\n" +
    baseline +
    BRD_DELIMITERS +
    "\n\n" +
    `--- ${params.sourceLabel} ---\n\n` +
    params.sourceDocument
  );
}
