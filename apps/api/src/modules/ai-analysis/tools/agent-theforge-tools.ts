import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { getLegacySemanticSearchLimit } from "../../theforge/theforge-evidence-context.util.js";
import { TheForgeService } from "../../theforge/theforge.service.js";

/**
 * Herramientas TheForge (MCP) fijadas a un `theforgeProjectId` — para Coordinador Legacy / ReAct.
 */
/**
 * Solo `ask_codebase`, `semantic_search`, `get_file_content` — descubrimiento escalonado MDD legacy (Plan-and-Execute).
 */
export function getStagedDiscoveryTheForgeTools(theforge: TheForgeService, theforgeProjectId: string): StructuredToolInterface[] {
  const pid = theforgeProjectId.trim();
  const lim = getLegacySemanticSearchLimit();
  /** El MCP Ariadne exige `projectId` en cada llamada; el modelo debe repetir el UUID canónico (anti–tool-args vacíos). La API sigue usando `pid` resuelto por Supervisor/proyecto. */
  const projectIdField = () =>
    z.literal(pid).describe(
      "Identificador de proyecto en Ariadne (theforgeProjectId). Debe ser exactamente el UUID del system prompt.",
    );
  return [
    tool(
      async ({ question }) => theforge.askCodebase(question, pid),
      {
        name: "ask_codebase",
        description:
          "Fase 0–1: pregunta NL **acotada** (inventario de repos/roles, límites entre repos, topología verbal). " +
          "No uses una sola pregunta para ‘listar exhaustivamente’ todo el modelo, APIs y UI. Después de Fase 0–1, solo preguntas focalizadas por repo o dominio.",
        schema: z.object({
          question: z.string(),
          projectId: projectIdField(),
        }),
      },
    ),
    tool(
      async ({ query, limit }) => theforge.semanticSearch(query, pid, limit ?? lim),
      {
        name: "semantic_search",
        description:
          "Fase 2 (no al inicio): búsqueda semántica **corta y específica** por repo/tema ya identificado (ej. entidades de X, rutas de Y). " +
          "Evita varias consultas genéricas en paralelo antes de haber cerrado roles de repos y arquitectura de alto nivel.",
        schema: z.object({
          query: z.string(),
          projectId: projectIdField(),
          limit: z.number().optional(),
        }),
      },
    ),
    tool(
      async ({ path, ref, currentFilePath }) =>
        theforge.getFileContent(path, pid, ref, currentFilePath),
      {
        name: "get_file_content",
        description:
          "Fase 2: lee un archivo **concreto** ya citado en evidencia previa; no descargues decenas de archivos de exploración.",
        schema: z.object({
          path: z.string(),
          projectId: projectIdField(),
          ref: z.string().optional(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
  ];
}

export function getLegacyTheForgeAgentTools(theforge: TheForgeService, theforgeProjectId: string): StructuredToolInterface[] {
  const pid = theforgeProjectId.trim();
  const projectIdField = () =>
    z.literal(pid).describe(
      "Identificador de proyecto Ariadne (theforgeProjectId). Debe coincidir con el UUID del contexto de sesión.",
    );
  return [
    tool(
      async ({ question }) => theforge.askCodebase(question, pid),
      {
        name: "ask_codebase",
        description: "Pregunta en lenguaje natural sobre el código indexado en TheForge (grafo del repo).",
        schema: z.object({
          question: z.string(),
          projectId: projectIdField(),
        }),
      },
    ),
    tool(
      async ({ userDescription }) => {
        const plan = await theforge.getModificationPlan(userDescription, pid);
        return plan ? JSON.stringify(plan, null, 2) : "(sin plan — TheForge no disponible o vacío)";
      },
      {
        name: "get_modification_plan",
        description: "Plan de modificación desde el grafo: archivos a tocar y preguntas de negocio.",
        schema: z.object({ userDescription: z.string() }),
      },
    ),
    tool(
      async ({ nodeName, currentFilePath }) =>
        theforge.validateBeforeEdit(nodeName, pid, currentFilePath),
      {
        name: "validate_before_edit",
        description: "Validación obligatoria antes de editar un nodo/archivo; impacto y contrato.",
        schema: z.object({
          nodeName: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ path, ref, currentFilePath }) =>
        theforge.getFileContent(path, pid, ref, currentFilePath),
      {
        name: "get_file_content",
        description: "Lee el contenido de un archivo del repositorio indexado.",
        schema: z.object({
          path: z.string(),
          ref: z.string().optional(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ nodeName, currentFilePath }) => theforge.getLegacyImpact(nodeName, pid, currentFilePath),
      {
        name: "get_legacy_impact",
        description: "Impacto en el grafo de código si se modifica un símbolo/nodo.",
        schema: z.object({
          nodeName: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ query, limit }) => theforge.semanticSearch(query, pid, limit),
      {
        name: "semantic_search",
        description: "Busca componentes, funciones y archivos por palabra clave en el grafo indexado.",
        schema: z.object({
          query: z.string(),
          projectId: projectIdField(),
          limit: z.number().optional(),
        }),
      },
    ),
    tool(
      async ({ path, currentFilePath }) =>
        theforge.getFunctionsInFile(path, pid, currentFilePath),
      {
        name: "get_functions_in_file",
        description: "Lista funciones y componentes definidos en un archivo.",
        schema: z.object({
          path: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ symbol, currentFilePath }) =>
        theforge.getDefinitions(symbol, pid, currentFilePath),
      {
        name: "get_definitions",
        description: "Ubicación exacta (archivo, líneas) de una clase o función.",
        schema: z.object({
          symbol: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ symbol, currentFilePath }) =>
        theforge.getReferences(symbol, pid, currentFilePath),
      {
        name: "get_references",
        description: "Todos los usos de un símbolo en el codebase (impacto de cambios).",
        schema: z.object({
          symbol: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async () => {
        const raw = await theforge.getC4Model(pid);
        const t = raw.trim();
        if (!t) {
          return (
            "(vacío) Modelo C4 no disponible: revisa THEFORGE_MCP_URL, que el proceso MCP tenga JWT hacia el API Nest " +
            "(ARIADNE_API_BEARER / ARIADNE_API_JWT en Ariadne) y que el proyecto esté indexado."
          );
        }
        return t;
      },
      {
        name: "get_c4_model",
        description:
          "Modelo C4 agregado (sistemas, contenedores, relaciones COMMUNICATES_WITH) desde GraphService vía MCP. Úsalo para topología de alto nivel, límites entre sistemas y dependencias antes de proponer cambios arquitectónicos.",
        schema: z.object({}),
      },
    ),
  ];
}

/**
 * Subconjunto TheForge (MCP) para el **Arquitecto MDD** en flujo legacy: contrato e impacto antes de fijar §3 y §4.
 * Se inyecta solo si `isLegacyProject` y `theforgeProjectId` están en el estado del grafo.
 */
export function getMddArchitectTheForgeTools(theforge: TheForgeService, theforgeProjectId: string): StructuredToolInterface[] {
  const pid = theforgeProjectId.trim();
  return [
    tool(
      async () => {
        const raw = await theforge.getC4Model(pid);
        const t = raw.trim();
        if (!t) {
          return (
            "(vacío) C4 no disponible vía MCP — validar JWT Nest en el servidor Ariadne o índice del proyecto."
          );
        }
        return t;
      },
      {
        name: "get_c4_model",
        description:
          "Modelo C4 del codebase indexado: contenedores y comunicación entre sistemas. Consulta antes de redactar §2 (Arquitectura) o límites entre servicios en un proyecto legacy.",
        schema: z.object({}),
      },
    ),
    tool(
      async ({ componentName, currentFilePath }) =>
        theforge.getContractSpecs(componentName.trim(), pid, currentFilePath),
      {
        name: "get_contract_specs",
        description:
          "Obtiene props, firma o contrato de un símbolo/componente en el código indexado (TheForge). Usa esta herramienta antes de documentar en §3 o §4 cualquier entidad, servicio o tipo exportado que exista en el repo legacy. Si la respuesta indica NOT_FOUND_IN_GRAPH, vacío o sin datos útiles, NO inventes props ni firmas: añade en el MDD un ítem bajo «Bloqueantes de negocio» y deja explícito que falta validación humana o índice.",
        schema: z.object({
          componentName: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ nodeName, currentFilePath }) => theforge.getLegacyImpact(nodeName.trim(), pid, currentFilePath),
      {
        name: "get_legacy_impact",
        description:
          "Impacto en el grafo si se toca un nodo/símbolo. Para cada entidad o módulo legacy citado en modelo o API, valida que el impacto sea coherente con el cambio descrito.",
        schema: z.object({
          nodeName: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
  ];
}
