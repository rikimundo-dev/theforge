import { tool } from "@langchain/core/tools";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { getLegacySemanticSearchLimit } from "../../theforge/theforge-evidence-context.util.js";
import type { AskCodebaseOptions } from "../../theforge/theforge.service.js";
import { TheForgeService } from "../../theforge/theforge.service.js";

/**
 * Herramientas TheForge (MCP) fijadas a un `theforgeProjectId` — para Coordinador Legacy / ReAct.
 */
/**
 * Solo `ask_codebase`, `semantic_search`, `get_file_content` — descubrimiento escalonado MDD legacy (Plan-and-Execute).
 */
/**
 * Evita que el LLM pase `limit` bajo (p. ej. 20) en `semantic_search` y reciba índices casi vacíos.
 * Suelo = `LEGACY_STAGED_DISCOVERY_SEMANTIC_FLOOR` o, si no está, `LEGACY_SEMANTIC_SEARCH_LIMIT`.
 */
function stagedDiscoverySemanticSearchLimit(requested: number | undefined): number {
  const defaultL = getLegacySemanticSearchLimit();
  const envFloor = parseInt(process.env.LEGACY_STAGED_DISCOVERY_SEMANTIC_FLOOR ?? "", 10);
  const floor = Number.isFinite(envFloor) && envFloor > 0 ? envFloor : defaultL;
  const raw = typeof requested === "number" && requested > 0 ? requested : defaultL;
  return Math.max(raw, floor);
}

export function getStagedDiscoveryTheForgeTools(
  theforge: TheForgeService,
  theforgeProjectId: string,
  askCodebaseOpts?: AskCodebaseOptions,
): StructuredToolInterface[] {
  const pid = theforgeProjectId.trim();
  /** El MCP Ariadne exige `projectId` en cada llamada; el modelo debe repetir el UUID canónico (anti–tool-args vacíos). La API sigue usando `pid` resuelto por Supervisor/proyecto. */
  const projectIdField = () =>
    z.literal(pid).describe(
      "Identificador de proyecto en Ariadne (theforgeProjectId). Debe ser exactamente el UUID del system prompt.",
    );
  return [
    tool(
      async ({ question }) => theforge.askCodebase(question, pid, askCodebaseOpts),
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
      async ({ query, limit }) => theforge.semanticSearch(query, pid, stagedDiscoverySemanticSearchLimit(limit)),
      {
        name: "semantic_search",
        description:
          "Fase 2 (no al inicio): búsqueda semántica **corta y específica** por repo/tema ya identificado (ej. entidades de X, rutas de Y). " +
          "Evita varias consultas genéricas en paralelo antes de haber cerrado roles de repos y arquitectura de alto nivel. " +
          "Prefiere **omitir** `limit` (The Forge aplica el mínimo del despliegue); no lo bajes artificialmente.",
        schema: z.object({
          query: z.string(),
          projectId: projectIdField(),
          limit: z.number().optional().describe("Opcional; si lo omites se usa el límite seguro del API. No uses valores bajos (<40)."),
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
    tool(
      async ({ componentName, currentFilePath }) =>
        theforge.getContractSpecs(componentName.trim(), pid, currentFilePath),
      {
        name: "get_contract_specs",
        description:
          "Fase 2: **props y contrato exactos** de un componente UI/React ya identificado (grafo MCP, determinista). " +
          "Úsalo antes de documentar interfaces de front o To-Be de pantallas; **no** sustituye Fase 0–1. " +
          "Si devuelve vacío o NOT_FOUND_IN_GRAPH, no inventes props.",
        schema: z.object({
          componentName: z.string().describe("Nombre del componente o símbolo UI en el índice"),
          projectId: projectIdField(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ symbolName, currentFilePath }) =>
        theforge.getImplementationDetails(symbolName.trim(), pid, currentFilePath),
      {
        name: "get_implementation_details",
        description:
          "Fase 2: **firma, tipos y endpoints** que usa un símbolo backend (función, clase, handler) vía grafo MCP. " +
          "Prefiere esto frente a `semantic_search` cuando ya tienes el nombre exacto del símbolo y necesitas precisión para §3–§4 o manual To-Be.",
        schema: z.object({
          symbolName: z
            .string()
            .describe("Nombre del símbolo en el índice (clase, función, método exportado)"),
          projectId: projectIdField(),
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
      async ({ componentName, currentFilePath }) =>
        theforge.getContractSpecs(componentName.trim(), pid, currentFilePath),
      {
        name: "get_contract_specs",
        description:
          "Props y contrato de un componente UI en el índice (grafo). Úsalo cuando necesites la interfaz exacta antes de proponer cambios de front o To-Be.",
        schema: z.object({
          componentName: z.string(),
          projectId: projectIdField(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
    tool(
      async ({ symbolName, currentFilePath }) =>
        theforge.getImplementationDetails(symbolName.trim(), pid, currentFilePath),
      {
        name: "get_implementation_details",
        description:
          "Firma, tipos y endpoints asociados a un símbolo backend (determinista vía grafo). Prefiere esto a `semantic_search` cuando ya conoces el nombre del símbolo.",
        schema: z.object({
          symbolName: z.string(),
          projectId: projectIdField(),
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
    tool(
      async ({ symbolName, currentFilePath }) =>
        theforge.getImplementationDetails(symbolName.trim(), pid, currentFilePath),
      {
        name: "get_implementation_details",
        description:
          "Extracción determinista de firma, tipos y endpoints de un símbolo backend. Úsalo junto a `get_contract_specs` cuando documentes §3–§4 o manual To-Be y ya tengas el nombre en el índice.",
        schema: z.object({
          symbolName: z.string(),
          currentFilePath: z.string().optional(),
        }),
      },
    ),
  ];
}
