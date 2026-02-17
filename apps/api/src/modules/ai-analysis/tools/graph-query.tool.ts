import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphMemoryService } from "../graph-memory/graph-memory.service.js";

/**
 * Tool para buscar en el grafo de memoria (FalkorDB).
 * Permite encontrar proyectos similares y decisiones arquitectónicas (ADRs) basadas en la intención.
 */
export function createQueryIntentGraphTool(graphMemory: GraphMemoryService) {
    return tool(
        async ({ query, limit = 3 }) => {
            try {
                const [projects, decisions] = await Promise.all([
                    graphMemory.searchSimilarProjects(query, limit),
                    graphMemory.searchSimilarDecisions(query, limit)
                ]);

                let result = "";

                if (projects && projects.length > 0) {
                    result += "### Proyectos Similares Encontrados:\n";
                    for (const p of projects as any[]) {
                        result += `- **${p.title}** (Score: ${p.score.toFixed(2)})\n`;
                        if (p.tables && p.tables.length > 0) result += `  - Tablas: ${p.tables.join(", ")}\n`;
                        if (p.endpoints && p.endpoints.length > 0) result += `  - Endpoints: ${p.endpoints.join(", ")}\n`;
                    }
                    result += "\n";
                }

                if (decisions && decisions.length > 0) {
                    result += "### Decisiones Arquitectónicas (ADRs) Relevantes:\n";
                    for (const d of decisions as any[]) {
                        result += `#### ${d.title} (Proyecto: ${d.projectTitle}, Score: ${d.score.toFixed(2)})\n`;
                        result += `- **Estado**: ${d.status}\n`;
                        result += `- **Contexto**: ${d.context}\n`;
                        result += `- **Consecuencia**: ${d.consequence}\n\n`;
                    }
                }

                if (!result) return "No se encontraron proyectos o decisiones similares para esa consulta.";

                return result;
            } catch (err) {
                return `Error consultando el grafo: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
        {
            name: "query_intent_graph",
            description: "Busca proyectos pasados y decisiones arquitectónicas (ADRs) en la memoria del sistema basadas en una descripción o intención técnica.",
            schema: z.object({
                query: z.string().describe("La descripción técnica o intención a buscar (ej: 'auth con MFA y JWT', 'limpieza de base de datos')"),
                limit: z.number().optional().default(3).describe("Número máximo de resultados por categoría"),
            }),
        }
    );
}
