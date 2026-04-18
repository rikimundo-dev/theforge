import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { TheForgeService } from "../../theforge/theforge.service.js";

/**
 * Herramientas TheForge (MCP) fijadas a un `theforgeProjectId` — para Coordinador Legacy / ReAct.
 */
export function getLegacyTheForgeAgentTools(theforge: TheForgeService, theforgeProjectId: string): StructuredToolInterface[] {
  const pid = theforgeProjectId;
  return [
    tool(
      async ({ question }) => theforge.askCodebase(question, pid),
      {
        name: "ask_codebase",
        description: "Pregunta en lenguaje natural sobre el código indexado en TheForge (grafo del repo).",
        schema: z.object({ question: z.string() }),
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
      async ({ query, limit }) =>
        theforge.semanticSearch(query, pid, limit ?? 5),
      {
        name: "semantic_search",
        description: "Busca componentes, funciones y archivos por palabra clave en el grafo indexado.",
        schema: z.object({
          query: z.string(),
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
