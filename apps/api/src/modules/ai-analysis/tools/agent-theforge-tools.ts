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
  ];
}
