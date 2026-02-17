import type { StructuredToolInterface } from "@langchain/core/tools";
import { createTavilySearchTool } from "./tavily.tool.js";
import { createScrapeUrlTool } from "./scrape-cheerio.tool.js";
import {
  createValidateMddStructureTool,
  createFormatSection3EndpointsTool,
  createSuggestMddDiagramsTool,
} from "./mdd-tools.js";
import {
  createValidateSqlTool,
  createValidateJsonPayloadsTool,
} from "./linter-tools.js";
import { createQueryIntentGraphTool } from "./graph-query.tool.js";
import { GraphMemoryService } from "../graph-memory/graph-memory.service.js";

/**
 * Tools for the Scout (Market Scout) agent: search + scrape.
 * Scout uses these to find competitors and verify URLs.
 */
export function getScoutTools(): StructuredToolInterface[] {
  const tavily = createTavilySearchTool();
  const scrapeUrl = createScrapeUrlTool();
  return [tavily, scrapeUrl];
}

/**
 * Tools for the Auditor (Tech Auditor) agent: scrape competitor URLs.
 * Auditor uses scrape_url to get page content/metadata and infer tech stack.
 */
export function getAuditorTools(): StructuredToolInterface[] {
  return [createScrapeUrlTool()];
}

/**
 * Tools for MDD Auditor: validación de estructura del MDD (sección 3 con payloads, secciones, TechnicalMetadata).
 */
export function getMddAuditorTools(): StructuredToolInterface[] {
  return [
    createValidateMddStructureTool(),
    createValidateSqlTool(),
    createValidateJsonPayloadsTool(),
  ];
}

/**
 * Tools for MDD Software Architect: formatear sección 3 (Contratos de API) con endpoints en markdown.
 */
export function getMddArchitectTools(): StructuredToolInterface[] {
  return [createFormatSection3EndpointsTool()];
}

/**
 * Tools for MDD Redactor: validación de estructura para saber qué corregir.
 */
export function getMddRedactorTools(): StructuredToolInterface[] {
  return [
    createValidateMddStructureTool(),
    createValidateSqlTool(),
    createValidateJsonPayloadsTool(),
  ];
}

/**
 * Tools para detectar puntos del MDD donde enriquecer con diagramas Mermaid (ER, estados, flujo).
 */
export function getMddDiagramTools(): StructuredToolInterface[] {
  return [createSuggestMddDiagramsTool()];
}

/**
 * Tools para el Manager: búsqueda en grafo semántico.
 */
export function getManagerTools(graphMemory: GraphMemoryService): StructuredToolInterface[] {
  return [createQueryIntentGraphTool(graphMemory)];
}
