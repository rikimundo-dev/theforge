import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph/web";
import { DBGAStateAnnotation, type DBGAStateType } from "../state/index.js";
import { createScoutNode } from "../nodes/scout.node.js";
import { createAuditorNode } from "../nodes/auditor.node.js";
import { createCriticNode } from "../nodes/critic.node.js";
import { createSynthesisNode } from "../nodes/synthesis.node.js";
import { getScoutTools, getAuditorTools } from "../tools/tool-registry.js";
import { createDbgaLLM } from "../llm/create-dbga-llm.js";
import { routeDbgaAfterCritic } from "./dbga-critic-routing.js";

/**
 * Builds and compiles the DBGA StateGraph.
 * Edges: Scout → Auditor → Critic → (Scout | Synthesis) → END.
 * Scout uses Tavily + scrape_url (Cheerio); Auditor uses scrape_url.
 * LLM: OpenRouter (mismo runtime que el adapter principal).
 * Si se pasa checkpointer, el estado se persiste por thread_id (retomar Fase 0).
 */
export function createDbgaGraph(checkpointer?: BaseCheckpointSaver | null) {
  const llm = createDbgaLLM();

  const scoutTools = getScoutTools();
  const auditorTools = getAuditorTools();
  const scoutNode = createScoutNode(llm, scoutTools);
  const auditorNode = createAuditorNode(llm, auditorTools);
  const criticNode = createCriticNode(llm);
  const synthesisNode = createSynthesisNode(llm);

  function routeCritic(state: DBGAStateType): string {
    return routeDbgaAfterCritic(state);
  }

  const builder = new StateGraph(DBGAStateAnnotation)
    .addNode("scout", scoutNode)
    .addNode("auditor", auditorNode)
    .addNode("critic", criticNode)
    .addNode("synthesis", synthesisNode)
    .addEdge(START, "scout")
    .addEdge("scout", "auditor")
    .addEdge("auditor", "critic")
    .addConditionalEdges("critic", routeCritic, {
      scout: "scout",
      synthesis: "synthesis",
    })
    .addEdge("synthesis", END);

  return builder.compile(
    checkpointer ? { checkpointer } : undefined,
  );
}
