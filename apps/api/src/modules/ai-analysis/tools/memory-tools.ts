import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { GraphMemoryService } from "../graph-memory/graph-memory.service.js";

export function createGraphMemoryTools(graphMemory: GraphMemoryService) {
    /**
     * Herramienta para consultar el Grafo de Intención.
     * Realiza una búsqueda híbrida (vectorial + travesía) para encontrar precedentes técnicos.
     */
    const queryIntentGraphTool = new DynamicStructuredTool({
        name: "query_intent_graph",
        description: `Consulta la memoria semántica (Grafo de Intención) de The Forge para encontrar proyectos previos, 
modelos de datos y contratos de API similares a la petición actual. 
Úsala cuando inicies un proyecto o necesites inspiración técnica basada en lo que el usuario ya ha construido antes.`,
        schema: z.object({
            query: z.string().describe("La intención o requisito del usuario a buscar (ej: 'sistema de autenticación con MFA', 'catálogo de productos')"),
            limit: z.number().optional().default(3).describe("Número máximo de resultados similares a recuperar"),
        }),
        func: async ({ query, limit }) => {
            try {
                const results = await graphMemory.searchSimilarProjects(query, limit);
                if (!results || results.length === 0) {
                    return "No se encontraron proyectos previos similares en la memoria semántica.";
                }

                const formatted = results.map((r: any) => {
                    return `Proyecto: ${r.title} (ID: ${r.id})
- Score de Similitud: ${Math.round(r.score * 100)}%
- Tablas SQL relacionadas: ${r.tables.join(", ") || "Ninguna"}
- Endpoints de API relacionados: ${r.endpoints.join(", ") || "Ninguno"}
---`;
                }).join("\n");

                return `Se encontraron los siguientes precedentes en el Grafo de Intención:\n\n${formatted}\n\nUsa esta información para sugerir una arquitectura consistente con el historial del usuario.`;
            } catch (err) {
                return `Error consultando el grafo: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });

    return [queryIntentGraphTool];
}
