import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { Logger } from "@nestjs/common";
import { createDbgaLLM } from "../ai-analysis/llm/create-dbga-llm.js";
import type { AIFactory } from "../ai/ai.factory.js";
import { getStagedDiscoveryTheForgeTools } from "../ai-analysis/tools/agent-theforge-tools.js";
import type { AskCodebaseOptions } from "../theforge/theforge.service.js";
import type { TheForgeService } from "../theforge/theforge.service.js";
import type { AgentSupervisorService } from "../agent-supervisor/agent-supervisor.service.js";
import { hydrateStagedDiscoveryMddPrompt, loadStagedDiscoveryMddPrompt } from "./staged-discovery-mdd.loader.js";
import { buildAriadneRepositoriesCatalogMarkdown } from "./staged-discovery-catalog.util.js";

export type StagedDiscoveryMode = "initial" | "change";

export interface RunLegacyStagedDiscoveryMddOptions {
  aiFactory: AIFactory;
  userId: string;
  theforge: TheForgeService;
  /** Para resolver ruta Supervisor (LEGACY + theforgeProjectId de etapa). */
  projectId: string;
  /** Fallback si la etapa no tiene `theforgeProjectId`. */
  theforgeProjectId: string;
  agentSupervisor: AgentSupervisorService;
  mode: StagedDiscoveryMode;
  /** Solo modo `change`: descripción del cambio para priorizar Fase 2–3. */
  changeDescription?: string;
  /** Opciones MCP por petición (p. ej. doc. partida con `responseMode` desde la UI). */
  askCodebaseOptions?: AskCodebaseOptions;
  logger?: Pick<Logger, "warn" | "log" | "debug">;
}

function envPositiveInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildHumanInstruction(mode: StagedDiscoveryMode, changeDescription?: string): string {
  let s =
    "Ejecuta las fases **0 → 1 → 2 → 3** en orden estricto. No te saltes fases. " +
    "**Fase 0:** interpreta el catálogo MCP del system prompt (repos y roles); como mucho **una** `ask_codebase` solo para inventario/roles si hace falta. **Sin** búsquedas masivas ni lecturas masivas de archivos. " +
    "**Fase 1:** arquitectura de alto nivel entre repos (una `ask_codebase` acotada o una `semantic_search` muy específica si aplica). " +
    "**Fase 2:** profundiza **por tópicos o repos**, una cosa a la vez: `semantic_search` focalizada y `get_file_content` solo donde la evidencia lo exija. " +
    "**Fase 3:** MDD Markdown completo con las 7 secciones. " +
    "**IMPORTANTE — Para evitar ciclos:** En Fase 3, produce el MDD **sin llamar más herramientas**. " +
    "Si ya ejecutaste herramientas en Fase 2 y tienes evidencia suficiente, salta a Fase 3 directamente. " +
    "No repitas la misma tool_call ni la misma búsqueda semántica. " +
    "Máximo 6 rondas de tool_calls en total; si llegas a ese límite, fuerza la salida con lo que tengas. " +
    "Tu respuesta final debe ser ÚNICAMENTE el documento Markdown del MDD (sin preámbulos ni comentarios meta).";
  if (mode === "initial") {
    s +=
      "\n\n**Modo etapa inicial (AS-IS):** En **§1 Contexto** describe el sistema **tal como existe hoy**. " +
      "PROHIBIDO como propósito: modificar, incorporar funcionalidades pendientes del BRD/MVP, alcance de cambio o objetivos futuros. " +
      "En **§3 Modelo de Datos** documenta **cada entidad** indexada en tablas (Entidad | Origen | Atributos); " +
      "PROHIBIDO resumir con «Otras entidades significativas» o listas por comas. " +
      "Las lagunas de evidencia van como «Brechas de información», no como meta de modificación.";
  }
  if (mode === "change") {
    s +=
      "\n\n**Modo cambio (contexto para otro paso de redacción):** En Fase 3 mantén las **7 secciones canónicas** y cita rutas/archivos, " +
      "pero sé **conciso** en narrativa: prioriza hechos verificables, tablas de endpoints/entidades y «Brechas de información» donde falte evidencia. " +
      "No repitas especulación; el coordinador redactará después el MDD de cambio definitivo.";
  }
  if (mode === "change" && changeDescription?.trim()) {
    s +=
      `\n\n**Foco del cambio (prioriza evidencia relacionada en Fase 2 y 3):**\n---\n${changeDescription.trim().slice(0, 4000)}\n---`;
  }
  return s;
}

/**
 * Grafo ReAct ligero: muchas rondas tool-calling para Plan-and-Execute (descubrimiento escalonado).
 */
async function runStagedDiscoveryToolLoop(
  llm: BaseChatModel,
  tools: StructuredToolInterface[],
  systemText: string,
  humanText: string,
  maxRounds: number,
  maxOutputChars: number,
): Promise<string> {
  if (!tools.length) return "";
  const bindTools = (llm as { bindTools?: (t: StructuredToolInterface[]) => { invoke: (m: unknown) => Promise<AIMessage> } })
    .bindTools;
  if (typeof bindTools !== "function") return "";
  const modelWithTools = bindTools.call(llm, tools);
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemText),
    new HumanMessage(humanText),
  ];
  let ai = (await modelWithTools.invoke(messages)) as AIMessage;

  for (let round = 0; round < maxRounds; round++) {
    if (!ai.tool_calls?.length) break;
    messages.push(ai);
    for (const tc of ai.tool_calls) {
      const name = tc.name;
      const args = (tc.args ?? {}) as Record<string, unknown>;
      const tool = tools.find((t) => t.name === name);
      let out: string;
      try {
        out = tool ? await tool.invoke(args) : `Tool desconocida: ${name}`;
      } catch (e) {
        out = `Error en tool ${name}: ${e instanceof Error ? e.message : String(e)}`;
      }
      const id = tc.id ?? `call_${name}_${round}`;
      messages.push(
        new ToolMessage({
          content: typeof out === "string" ? out : JSON.stringify(out),
          tool_call_id: id,
        }),
      );
    }
    ai = (await modelWithTools.invoke(messages)) as AIMessage;
  }
  const lastText = typeof ai.content === "string" ? ai.content : JSON.stringify(ai.content);
  return lastText.slice(0, maxOutputChars);
}

/**
 * Descubrimiento escalonado vía LLM + herramientas TheForge (`ask_codebase`, `semantic_search`, `get_file_content`).
 * Resuelve `theforgeProjectId` con **AgentSupervisor** (etapa legacy).
 */
export async function runLegacyStagedDiscoveryMddAgent(opts: RunLegacyStagedDiscoveryMddOptions): Promise<string> {
  const { aiFactory, userId, theforge, projectId, theforgeProjectId, agentSupervisor, mode, changeDescription, askCodebaseOptions, logger } = opts;
  if (!theforge.isConfigured()) return "";

  let tfPid = theforgeProjectId.trim();
  try {
    const route = await agentSupervisor.resolveRoute(projectId);
    if (route.flow !== "LEGACY") {
      logger?.warn?.(
        `runLegacyStagedDiscoveryMddAgent: Supervisor flow=${route.flow} (esperado LEGACY); se usa theforgeProjectId del proyecto.`,
      );
    }
    const fromStage = route.theforgeProjectId?.trim();
    if (fromStage) tfPid = fromStage;
  } catch (e) {
    logger?.warn?.(`runLegacyStagedDiscoveryMddAgent: resolveRoute falló: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!tfPid) {
    logger?.warn?.(
      "runLegacyStagedDiscoveryMddAgent: sin theforgeProjectId resuelto (Supervisor/proyecto); no se puede llamar al MCP Ariadne.",
    );
    return "";
  }

  const rawPrompt = loadStagedDiscoveryMddPrompt();
  if (!rawPrompt) {
    logger?.warn?.("runLegacyStagedDiscoveryMddAgent: staged-discovery-mdd-prompt.md vacío o no encontrado.");
    return "";
  }
  const reposCatalog = await buildAriadneRepositoriesCatalogMarkdown(theforge, tfPid);
  const system = hydrateStagedDiscoveryMddPrompt(rawPrompt, tfPid, reposCatalog);

  const tools = getStagedDiscoveryTheForgeTools(theforge, tfPid, askCodebaseOptions);
  const maxRounds = envPositiveInt("LEGACY_STAGED_DISCOVERY_MAX_TOOL_ROUNDS", 8);
  const maxOut = envPositiveInt("LEGACY_STAGED_DISCOVERY_OUTPUT_MAX_CHARS", 96000);

  try {
    const llm = await createDbgaLLM(aiFactory, userId);
    const human = buildHumanInstruction(mode, changeDescription);
    return await runStagedDiscoveryToolLoop(llm, tools, system, human, maxRounds, maxOut);
  } catch (e) {
    logger?.warn?.(`runLegacyStagedDiscoveryMddAgent: ${e instanceof Error ? e.message : String(e)}`);
    return "";
  }
}
