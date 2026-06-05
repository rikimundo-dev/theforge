import { Logger } from "@nestjs/common";
import { GraphMemoryService } from "../graph-memory/graph-memory.service.js";
import { MDDStateType } from "../state/index.js";
import { hydrateStructuredFromDraft } from "../utils/mdd-sanitize.js";
import { extractAndLogAdrs } from "../utils/mdd-adr-logger.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const logger = new Logger("MDD:GraphPopulator");

/**
 * Nodo GraphPopulator: Sincroniza el MDD actual (mddDraft) al grafo semántico (FalkorDB).
 * Persiste entidades y extrae Decisiones Arquitectónicas (ADRs).
 */
export function createMddGraphPopulatorNode(llm: BaseChatModel, graphMemory: GraphMemoryService) {
    return async (state: MDDStateType): Promise<Partial<MDDStateType>> => {
        const projectId = state.projectId || "legacy_project";

        // Intentamos hidratar el estado estructurado desde el draft actual
        const structured = hydrateStructuredFromDraft(
            state.mddStructured || {},
            state.mddDraft || ""
        );

        try {
            // 1. Sincronización determinista (Tablas, Endpoints)
            await graphMemory.syncMddToGraph(projectId, state.activeStageId, structured);

            // 2. Extracción semántica de ADRs (LLM) — fire-and-forget: no bloquea entrega del doc
            if (state.mddDraft && state.mddDraft.length > 500) {
                void extractAndLogAdrs(llm, graphMemory, projectId, state.mddDraft).catch((err) => {
                    logger.error(`Error extrayendo ADRs: ${err instanceof Error ? err.message : String(err)}`);
                });
            }

            logger.log(`MDD sincronizado exitosamente al grafo para proyecto ${projectId}`);
        } catch (err) {
            logger.error(`Error al sincronizar MDD al grafo: ${err instanceof Error ? err.message : String(err)}`);
        }

        return {
            mddStructured: structured, // Devolvemos el estructurado actualizado
        };
    };
}
