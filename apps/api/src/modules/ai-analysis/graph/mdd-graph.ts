import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph/web";
import type { LivePrecisionCalculator } from "../estimation/estimation.types.js";
import { createMddAskInitialTopicNode } from "../nodes/mdd-ask-initial-topic.node.js";
import { createMddClarifierNode } from "../nodes/mdd-clarifier.node.js";
import { createMddSoftwareArchitectNode } from "../nodes/mdd-software-architect.node.js";
import { createMddArchitectCriticNode } from "../nodes/mdd-architect-critic.node.js";
import { createMddFormatterNode } from "../nodes/mdd-formatter.node.js";
import { createMddDiagramInjectorNode } from "../nodes/mdd-diagram-injector.node.js";
import { createMddSecurityNode } from "../nodes/mdd-security.node.js";
import { createMddIntegrationNode } from "../nodes/mdd-integration.node.js";
import { createMddLlmFormatterNode } from "../nodes/mdd-llm-formatter.node.js";
import { createMddAuditorNode } from "../nodes/mdd-auditor.node.js";
import { createMddManagerNode, type MddManagerToolDeps } from "../nodes/mdd-manager.node.js";
import { createMddPlanApprovalNode } from "../nodes/mdd-plan-approval.node.js";
import { createMddExecutorNode } from "../nodes/mdd-executor.node.js";
import { createMddMergeSection1Node } from "../nodes/mdd-merge-section1.node.js";
import { createMddGraphPopulatorNode } from "../nodes/mdd-graph-populator.node.js";
import { createMddCrossConsistencyNode } from "../nodes/mdd-cross-consistency.node.js";
import { createMddBlackboardNode } from "../nodes/mdd-blackboard.node.js";
import { GraphMemoryService } from "../graph-memory/graph-memory.service.js";
import { createDbgaLLM, createMddAuditorLLM } from "../llm/create-dbga-llm.js";
import type { AIFactory } from "../../ai/ai.factory.js";
import { getMddAuditorTools, getMddArchitectTools } from "../tools/tool-registry.js";
import type { TheForgeService } from "../../theforge/theforge.service.js";
import { MDDStateAnnotation, type MDDStateType } from "../state/index.js";
import type { NodeCacheService } from "../checkpoint/node-cache.service.js";
import {
  clarifierInput,
  softwareArchitectInput,
  securityInput,
  integrationInput,
  llmFormatterInput,
  crossConsistencyInput,
} from "../checkpoint/node-input-hash.js";

const MAX_MDD_ITERATIONS = 2;

// ---------------------------------------------------------------------------
// Cache wrapper — wraps an LLM node function so it checks the in-memory
// cache before executing.  On a cache hit the LLM call is skipped entirely.
// ---------------------------------------------------------------------------

type NodeFn = (state: MDDStateType) => Promise<Partial<MDDStateType>>;
type InputHashFn = (state: MDDStateType) => Record<string, unknown>;

function wrapCache(
  cache: NodeCacheService | null,
  nodeName: string,
  getInput: InputHashFn,
  nodeFn: NodeFn,
): NodeFn {
  if (!cache) return nodeFn;
  return async (state: MDDStateType): Promise<Partial<MDDStateType>> => {
    const projectId = state.projectId;
    const key = cache.key(nodeName, projectId, getInput(state));
    const cached = cache.get(key);
    if (cached !== undefined) {
      console.log(`[MDD:Cache] HIT ${nodeName} (key=${key})`);
      return cached;
    }
    const result = await nodeFn(state);
    cache.set(key, result);
    return result;
  };
}

/** Opciones al compilar el grafo MDD (p. ej. TheForge MCP para herramientas del Arquitecto en legacy). */
export type MddGraphCompileOptions = {
  theforge?: TheForgeService | null;
  /** Cache por nodo para evitar re-ejecutar LLM si el input no cambió. */
  nodeCache?: NodeCacheService | null;
};

/**
 * Builds and compiles the MDD StateGraph (one-shot, no Manager).
 * Flow: … → Auditor → (score < 85 && iteration < MAX ? Manager asigna gaps a agentes : END).
 * Los agentes generan contenido; el formateador (sin LLM) normaliza mddDraft; Redactor eliminado (documento unificado por merge + render).
 */
export async function createMddGraph(
  aiFactory: AIFactory,
  userId: string,
  graphMemory: GraphMemoryService,
  options?: MddGraphCompileOptions,
) {
  const llm = await createDbgaLLM(aiFactory, userId);
  const auditorLlm = await createMddAuditorLLM(aiFactory, userId);
  const nodeCache = options?.nodeCache ?? null;

  const clarifierNode = wrapCache(nodeCache, "clarifier", clarifierInput, createMddClarifierNode(llm));
  const softwareArchitectNode = wrapCache(
    nodeCache,
    "software_architect",
    softwareArchitectInput,
    createMddSoftwareArchitectNode(llm, getMddArchitectTools(), {
      theforge: options?.theforge ?? null,
    }),
  );
  const formatterNode = createMddFormatterNode();
  const securityNode = wrapCache(nodeCache, "security", securityInput, createMddSecurityNode(llm));
  const integrationNode = wrapCache(nodeCache, "integration", integrationInput, createMddIntegrationNode(llm));
  const diagramInjectorNode = createMddDiagramInjectorNode();
  const consistencyNode = wrapCache(nodeCache, "cross_consistency", crossConsistencyInput, createMddCrossConsistencyNode(llm));
  const llmFormatterNode = wrapCache(nodeCache, "llm_formatter", llmFormatterInput, createMddLlmFormatterNode(llm));
  const auditorNode = createMddAuditorNode(auditorLlm, getMddAuditorTools(), null);
  const graphPopulatorNode = createMddGraphPopulatorNode(llm, graphMemory);

  function routeAuditor(state: MDDStateType): string {
    if (state.auditorDecision === "clarifier" && (state.mddIteration ?? 0) < MAX_MDD_ITERATIONS) {
      return "clarifier";
    }
    return "graph_populator";
  }

  const builder = new StateGraph(MDDStateAnnotation)
    .addNode("clarifier", clarifierNode)
    .addNode("software_architect", softwareArchitectNode)
    .addNode("format_after_architect", formatterNode)
    .addNode("security", securityNode)
    .addNode("integration", integrationNode)
    .addNode("format_after_redactor", formatterNode)
    .addNode("llm_formatter", llmFormatterNode)
    .addNode("cross_consistency_checker", consistencyNode)
    .addNode("diagram_injector", diagramInjectorNode)
    .addNode("auditor", auditorNode)
    .addNode("graph_populator", graphPopulatorNode)
    .addEdge(START, "clarifier")
    .addEdge("clarifier", "software_architect")
    .addEdge("software_architect", "format_after_architect")
    // Security → Integration secuencial: ambos escriben a mddStructured (LastValue reducer)
    .addEdge("format_after_architect", "security")
    .addEdge("security", "integration")
    .addEdge("integration", "format_after_redactor")
    .addEdge("format_after_redactor", "llm_formatter")
    // [PARALELO] CrossConsistency: solo produce internalDirectives (read-only mddDraft)
    // DiagramInjector inyecta diagramas en mddDraft (code-only, <3s).
    // Auditor usa shortcut code-only (99% casos). Corren en paralelo sin conflicto.
    .addEdge("llm_formatter", "cross_consistency_checker")
    .addEdge("llm_formatter", "diagram_injector")
    .addEdge("cross_consistency_checker", "auditor")
    .addEdge("diagram_injector", "auditor")
    .addConditionalEdges("auditor", routeAuditor, {
      clarifier: "clarifier",
      graph_populator: "graph_populator",
    })
    .addEdge("graph_populator", END);

  return builder.compile();
}

/**
 * Builds and compiles the MDD StateGraph with Manager as Entrevistador de Estados.
 * Caso 1 (Inicio): sin Bench ni MDD → Manager NO delega; ask_initial_topic; al responder → Clarifier → … → Auditor → Manager; si score < 85 → Manager asigna gaps a agentes.
 * Caso 2 (Refinamiento): score < 85% → Manager toma critical_gaps y asigna tareas a agentes para corregir.
 * Caso 3 (Benchmark): existe dbgaContent → delegar de inmediato a especialistas para v1; luego bucle refinamiento.
 * Done cuando Auditor >= 85% (cede intervención al usuario) o usuario pide detenerse. Requiere checkpointer para interrupt/resume.
 */
export async function createMddGraphWithManager(
  aiFactory: AIFactory,
  userId: string,
  checkpointer: BaseCheckpointSaver | null,
  graphMemory: GraphMemoryService,
  precisionCalculator?: LivePrecisionCalculator | null,
  managerToolDeps?: MddManagerToolDeps | null,
  compileOptions?: MddGraphCompileOptions,
) {
  const llm = await createDbgaLLM(aiFactory, userId);
  const auditorLlm = await createMddAuditorLLM(aiFactory, userId);
  const nodeCache = compileOptions?.nodeCache ?? null;
  const managerNode = createMddManagerNode(llm, graphMemory, precisionCalculator, managerToolDeps ?? null);
  const askInitialTopicNode = createMddAskInitialTopicNode();
  const clarifierNode = wrapCache(nodeCache, "clarifier", clarifierInput, createMddClarifierNode(llm));
  const theForgeForArchitect = compileOptions?.theforge ?? managerToolDeps?.theforge ?? null;
  const softwareArchitectNode = wrapCache(
    nodeCache,
    "software_architect",
    softwareArchitectInput,
    createMddSoftwareArchitectNode(llm, getMddArchitectTools(), {
      theforge: theForgeForArchitect,
    }),
  );
  const architectCriticNode = createMddArchitectCriticNode(llm);
  const formatterNode = createMddFormatterNode();
  const securityNode = wrapCache(nodeCache, "security", securityInput, createMddSecurityNode(llm));
  const integrationNode = wrapCache(nodeCache, "integration", integrationInput, createMddIntegrationNode(llm));
  const llmFormatterNode = wrapCache(nodeCache, "llm_formatter", llmFormatterInput, createMddLlmFormatterNode(llm));
  const diagramInjectorNode = createMddDiagramInjectorNode();
  const consistencyNode = wrapCache(nodeCache, "cross_consistency", crossConsistencyInput, createMddCrossConsistencyNode(llm));
  const auditorNode = createMddAuditorNode(
    auditorLlm,
    getMddAuditorTools(),
    precisionCalculator ?? null,
  );
  const blackboardNode = createMddBlackboardNode(llm);
  const graphPopulatorNode = createMddGraphPopulatorNode(llm, graphMemory);

  /** Si hay directiva/requisitos y §3+§4 con contenido y aún no hemos pasado por critic (attempts < 1), ir a architect_critic. */
  function routeAfterSoftwareArchitect(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    const next = nextInSections(state, "software_architect");
    if (next) return next;
    const hasDirective = !!(state.acceptedProposalDirective?.trim());
    const draft = (state.mddDraft ?? "").trim();
    const hasSection3 = /##\s*3\.\s*Modelo\s+(?:de\s+)?datos/i.test(draft) && /\bCREATE\s+TABLE\b/i.test(draft);
    const hasSection4 = /##\s*4\.\s*Contratos\s+de\s+API/i.test(draft);
    const attempts = state.architectCriticAttempts ?? 0;
    if (hasDirective && hasSection3 && hasSection4 && attempts < 1) return "architect_critic";
    return "format_after_architect";
  }

  /** Tras critic: si hay feedback (gap) y solo 1 intento, volver a software_architect; si no, seguir a format. */
  function routeAfterArchitectCritic(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    const hasFeedback = !!(state.architectCriticFeedback?.trim());
    const attempts = state.architectCriticAttempts ?? 0;
    if (hasFeedback && attempts <= 1) return "software_architect";
    return "format_after_architect";
  }

  function routeAfterClarifier(state: MDDStateType): "manager" | "merge_section1_only" | "software_architect" | "executor" {
    if (state.executorControlled === true) return "executor";
    if (state.clarifierJustGeneratedQuestions === true) return "manager";
    if (state.delegateTarget === "clarifier_only") return "merge_section1_only";
    return "software_architect";
  }

  /** Siguiente nodo en sectionsToRun tras currentNode, o null para usar el default del pipeline. */
  function nextInSections(state: MDDStateType, currentNode: string): string | null {
    if (state.delegateTarget !== "sections" || !state.sectionsToRun?.length) return null;
    const idx = state.sectionsToRun.indexOf(currentNode);
    if (idx === -1) return null;
    const next = state.sectionsToRun[idx + 1];
    return next ?? "manager";
  }

  function routeAfterFormatArchitect(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return nextInSections(state, "format_after_architect") ?? "security";
  }
  function routeAfterSecurity(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return nextInSections(state, "security") ?? "integration";
  }
  function routeAfterIntegration(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return nextInSections(state, "integration") ?? "format_after_redactor";
  }
  function routeAfterFormatRedactor(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return nextInSections(state, "format_after_redactor") ?? "llm_formatter";
  }
  function routeAfterConsistency(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return nextInSections(state, "cross_consistency_checker") ?? "diagram_injector";
  }
  function routeAfterDiagram(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return nextInSections(state, "diagram_injector") ?? "auditor";
  }
  function routeAfterAuditor(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    if (state.auditorDecision === "blackboard") return "blackboard";
    return "graph_populator";
  }
  function routeAfterBlackboard(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return state.sectionsToRun?.[0] || "manager";
  }
  function routeAfterGraphPopulator(state: MDDStateType): string {
    if (state.executorControlled === true) return "executor";
    return "manager";
  }
  function routeAfterMergeSection1(state: MDDStateType): "executor" | typeof END {
    if (state.executorControlled === true) return "executor";
    return END;
  }

  const mergeSection1Node = createMddMergeSection1Node();

  const managerEnds = [
    "clarifier",
    END,
    "manager",
    "ask_initial_topic",
    "plan_approval",
    "executor",
    "auditor",
    "software_architect",
    "architect_critic",
    "format_after_architect",
    "security",
    "integration",
    "llm_formatter",
    "cross_consistency_checker",
    "graph_populator",
    "blackboard",
  ] as const;

  const planApprovalNode = createMddPlanApprovalNode();
  const executorNode = createMddExecutorNode();
  const executorEnds = [
    "clarifier",
    "merge_section1_only",
    "software_architect",
    "architect_critic",
    "format_after_architect",
    "security",
    "integration",
    "format_after_redactor",
    "cross_consistency_checker",
    "diagram_injector",
    "auditor",
    "graph_populator",
    "blackboard",
    "manager",
  ] as const;

  const builder = new StateGraph(MDDStateAnnotation)
    .addNode("manager", managerNode, { ends: [...managerEnds] })
    .addNode("ask_initial_topic", askInitialTopicNode, { ends: ["clarifier"] })
    .addNode("plan_approval", planApprovalNode, { ends: ["manager"] })
    .addNode("executor", executorNode, { ends: [...executorEnds] })
    .addNode("clarifier", clarifierNode)
    .addNode("merge_section1_only", mergeSection1Node)
    .addNode("software_architect", softwareArchitectNode)
    .addNode("architect_critic", architectCriticNode)
    .addNode("format_after_architect", formatterNode)
    .addNode("security", securityNode)
    .addNode("integration", integrationNode)
    .addNode("format_after_redactor", formatterNode)
    .addNode("llm_formatter", llmFormatterNode)
    .addNode("cross_consistency_checker", consistencyNode)
    .addNode("diagram_injector", diagramInjectorNode)
    .addNode("auditor", auditorNode)
    .addNode("blackboard", blackboardNode)
    .addNode("graph_populator", graphPopulatorNode)
    .addEdge(START, "manager")
    .addConditionalEdges("clarifier", routeAfterClarifier, {
      manager: "manager",
      merge_section1_only: "merge_section1_only",
      software_architect: "software_architect",
      executor: "executor",
    })
    .addConditionalEdges("merge_section1_only", routeAfterMergeSection1, {
      executor: "executor",
      [END]: END,
    })
    .addConditionalEdges("software_architect", routeAfterSoftwareArchitect, {
      architect_critic: "architect_critic",
      format_after_architect: "format_after_architect",
      security: "security",
      integration: "integration",
      cross_consistency_checker: "cross_consistency_checker",
      format_after_redactor: "format_after_redactor",
      diagram_injector: "diagram_injector",
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addConditionalEdges("architect_critic", routeAfterArchitectCritic, {
      software_architect: "software_architect",
      format_after_architect: "format_after_architect",
    })
    .addConditionalEdges("format_after_architect", routeAfterFormatArchitect, {
      security: "security",
      integration: "integration",
      cross_consistency_checker: "cross_consistency_checker",
      format_after_redactor: "format_after_redactor",
      diagram_injector: "diagram_injector",
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addConditionalEdges("security", routeAfterSecurity, {
      integration: "integration",
      cross_consistency_checker: "cross_consistency_checker",
      format_after_redactor: "format_after_redactor",
      diagram_injector: "diagram_injector",
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addConditionalEdges("integration", routeAfterIntegration, {
      llm_formatter: "llm_formatter",
      format_after_redactor: "format_after_redactor",
      cross_consistency_checker: "cross_consistency_checker",
      diagram_injector: "diagram_injector",
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addConditionalEdges("format_after_redactor", routeAfterFormatRedactor, {
      llm_formatter: "llm_formatter",
      cross_consistency_checker: "cross_consistency_checker",
      diagram_injector: "diagram_injector",
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addEdge("llm_formatter", "cross_consistency_checker")
    .addConditionalEdges("cross_consistency_checker", routeAfterConsistency, {
      diagram_injector: "diagram_injector",
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addConditionalEdges("diagram_injector", routeAfterDiagram, {
      auditor: "auditor",
      manager: "manager",
      executor: "executor",
    })
    .addConditionalEdges("auditor", routeAfterAuditor, {
      executor: "executor",
      blackboard: "blackboard",
      graph_populator: "graph_populator",
    })
    .addConditionalEdges("blackboard", routeAfterBlackboard, {
      executor: "executor",
      manager: "manager",
      software_architect: "software_architect",
      security: "security",
      integration: "integration",
    })
    .addConditionalEdges("graph_populator", routeAfterGraphPopulator, {
      executor: "executor",
      manager: "manager",
    });

  return builder.compile(checkpointer ? { checkpointer } : undefined);
}
