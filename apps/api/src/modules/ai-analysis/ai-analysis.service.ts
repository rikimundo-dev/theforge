import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PreferencesService } from "../ai/preferences.service.js";
import { Command, isGraphInterrupt } from "@langchain/langgraph";
import { createDbgaGraph } from "./graph/dbga-graph.js";
import { createMddGraph, createMddGraphWithManager } from "./graph/mdd-graph.js";
import { defaultDBGAState, type DBGAState } from "./state/index.js";
import { defaultMDDState, type MDDState, type MDDStateType } from "./state/index.js";
import { CheckpointerService } from "./checkpoint/checkpointer.service.js";
import { EstimationService } from "./estimation/estimation.service.js";
import { stateToMarkdown, getAgentLabel } from "./state/state-to-markdown.js";
import type { MddStructured } from "./state/mdd-structured.schema.js";
import { mddStructuredToMarkdown } from "./render/mdd-structured-to-markdown.js";
import {
  extractContextSectionBody,
  extractSections2To5Content,
  hydrateStructuredFromDraft,
  logSection3Debug,
  normalizeMddFormat,
  replaceContextWhenOnlyMetadata,
  replaceSection1BodyFromAnyHeading,
  replaceSections2To5InDraft,
  sanitizeContextKeyValueAndObject,
  sanitizeContextSection,
} from "./utils/mdd-sanitize.js";
import { GraphMemoryService } from "./graph-memory/graph-memory.service.js";
import { injectMddDiagrams, suggestMddDiagrams } from "./utils/mdd-diagram-suggestions.js";
import { markdownToMddStructured } from "./utils/mdd-markdown-to-structured.js";
import { HumanMessage } from "@langchain/core/messages";
import { createDbgaLLM } from "./llm/create-dbga-llm.js";
import { CONTEXT_SYNTHESIZER_PROMPT } from "./prompts/load-prompts.js";
import { createMddIntegrationNode } from "./nodes/mdd-integration.node.js";
import { createMddSecurityNode } from "./nodes/mdd-security.node.js";
import { createMddSoftwareArchitectNode } from "./nodes/mdd-software-architect.node.js";
import { getMddArchitectTools } from "./tools/tool-registry.js";

import type { PrecisionBreakdown } from "./estimation/estimation.types.js";

function hasStructuredContent(mdd: MddStructured | null | undefined): boolean {
  if (!mdd || typeof mdd !== "object") return false;
  const keys = Object.keys(mdd) as (keyof MddStructured)[];
  return keys.some((k) => {
    const v = mdd[k];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return Object.keys(v as object).length > 0;
  });
}

/**
 * Fuente del markdown a enviar. Se prefiere mddDraft cuando es sustancial para no reconstruir desde
 * mddStructured (que podría tener §3 desactualizado). Luego sanitize, normalize e inyección de diagramas.
 */
function prepareMddForOutput(
  input: { mddStructured?: MddStructured; mddDraft?: string } | string,
): string {
  let raw: string;
  if (typeof input === "string") {
    raw = input;
  } else if ((input.mddDraft ?? "").trim().length > 500) {
    raw = (input.mddDraft ?? "").trim();
  } else if (hasStructuredContent(input.mddStructured)) {
    const hydrated = hydrateStructuredFromDraft(input.mddStructured, input.mddDraft ?? "");
    raw = mddStructuredToMarkdown(hydrated);
  } else {
    raw = (input.mddDraft ?? "").trim();
  }
  const sanitized =
    replaceContextWhenOnlyMetadata(sanitizeContextKeyValueAndObject(sanitizeContextSection(raw)));
  const normalized = normalizeMddFormat(sanitized);
  return injectMddDiagrams(normalized, suggestMddDiagrams(normalized));
}

export type StreamProgressEvent =
  | { type: "progress"; agent: string; message: string }
  | {
    type: "done";
    markdown: string;
    precision?: number;
    status?: "red" | "yellow" | "green";
    auditorFeedback?: string;
    precisionBreakdown?: PrecisionBreakdown;
    auditTrail?: string[];
  }
  | { type: "error"; message: string; replanning?: boolean };

/** Eventos del flujo MDD con Manager; interrupt puede ser reply (conversación) o questions (entrevista). */
export type StreamMddManagerEvent =
  | StreamProgressEvent
  | { type: "draft"; markdown: string }
  | {
    type: "interrupt";
    threadId: string;
    reply?: string;
    questions?: string[];
    /** Plan para aprobación (HITL 4.4): pasos con step_id, task_description, node. */
    plan?: Array<{ step_id: string; task_description: string; node: string }>;
    /** Mensaje que acompaña al plan (ej. "¿Ejecutar este plan?") */
    planMessage?: string;
    markdown?: string;
    precision?: number;
    status?: "red" | "yellow" | "green";
    precisionBreakdown?: PrecisionBreakdown;
    auditorFeedback?: string;
    auditTrail?: string[];
  };

/**
 * Service for the AI Agentic DBGA (Domain Benchmark & Gap Analysis) pipeline.
 * Orchestrates LangGraph agents; long-running work should return JobId or stream (Step 4).
 * Con checkpointer y projectId, el estado se persiste por thread_id y se puede retomar Fase 0.
 * Inyecta preferencias arquitectónicas (memoria semántica) cuando hay projectId.
 */
/** Guarda lastStepFailed por thread_id cuando un nodo falla; se inyecta al reanudar para que el Manager re-planifique. */
const lastStepFailedByThread = new Map<string, { node: string; error: string }>();

@Injectable()
export class AiAnalysisService {
  private readonly logger = new Logger(AiAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkpointerService: CheckpointerService,
    private readonly preferences: PreferencesService,
    private readonly estimationService: EstimationService,
    private readonly graphMemory: GraphMemoryService,
  ) { }

  /** Devuelve el threadId del flujo MDD para el proyecto, si existe (para rehidratar al reabrir la app). */
  async getMddThreadId(projectId: string): Promise<string | null> {
    if (!projectId?.trim()) return null;
    const row = await this.prisma.agentStateCheckpoint.findUnique({
      where: { projectId: projectId.trim() },
      select: { threadId: true },
    });
    return row?.threadId ?? null;
  }

  /** Borra el checkpoint del proyecto cuando el flujo MDD termina (done), para que el siguiente mensaje arranque limpio. */
  async clearMddCheckpoint(projectId: string): Promise<void> {
    if (!projectId?.trim()) return;
    await this.prisma.agentStateCheckpoint.deleteMany({ where: { projectId: projectId.trim() } });
  }

  /**
   * Revisión de consistencia del MDD: re-deriva diagramas desde el contenido (ER desde SQL, etc.)
   * y devuelve el documento actualizado. No llama a LLMs; solo reglas determinísticas.
   */
  async reviewMddConsistency(projectId: string, mddContentOverride?: string): Promise<string> {
    const content =
      mddContentOverride != null && mddContentOverride.length > 0
        ? mddContentOverride
        : (await this.estimationService.getMddContentForProject(projectId)) ?? "";
    const draft = (content || "").trim();
    if (draft.length < 200) return draft;
    return prepareMddForOutput(draft);
  }

  /**
   * Starts the DBGA analysis for a raw user idea.
   * Si se pasa projectId, se usa o crea un thread_id por proyecto para persistir estado (retomar después).
   */
  async startAnalysis(idea: string, projectId?: string): Promise<DBGAState> {
    const checkpointer = await this.checkpointerService.getCheckpointer();
    const graph = createDbgaGraph(checkpointer ?? undefined);

    let threadId: string;
    if (projectId?.trim()) {
      const row = await this.prisma.agentStateCheckpoint.upsert({
        where: { projectId: projectId.trim() },
        create: {
          threadId: randomUUID(),
          projectId: projectId.trim(),
        },
        update: {},
      });
      threadId = row.threadId;
    } else {
      threadId = randomUUID();
    }

    const userPreferences = await this.preferences.getPreferencesForContext(
      projectId?.trim() ?? undefined,
      5,
    );

    const initialState: DBGAState = {
      ...defaultDBGAState,
      rawIdea: idea.trim(),
      status: "idle",
      userPreferences: userPreferences || undefined,
    };
    const config = checkpointer
      ? { configurable: { thread_id: threadId } as Record<string, string> }
      : undefined;
    const finalState = await graph.invoke(initialState, config);
    return finalState as DBGAState;
  }

  /**
   * Streams the DBGA analysis: emite eventos de progreso (qué agente trabaja) y al final el markdown.
   * Usa graph.stream con streamMode "values" para obtener estado completo tras cada paso.
   */
  async *streamAnalysis(
    idea: string,
    projectId?: string,
  ): AsyncGenerator<StreamProgressEvent> {
    const checkpointer = await this.checkpointerService.getCheckpointer();
    const graph = createDbgaGraph(checkpointer ?? undefined);

    let threadId: string;
    if (projectId?.trim()) {
      const row = await this.prisma.agentStateCheckpoint.upsert({
        where: { projectId: projectId.trim() },
        create: {
          threadId: randomUUID(),
          projectId: projectId.trim(),
        },
        update: {},
      });
      threadId = row.threadId;
    } else {
      threadId = randomUUID();
    }

    const userPreferences = await this.preferences.getPreferencesForContext(
      projectId?.trim() ?? undefined,
      5,
    );

    const initialState: DBGAState = {
      ...defaultDBGAState,
      rawIdea: idea.trim(),
      status: "idle",
      userPreferences: userPreferences || undefined,
    };
    const config = checkpointer
      ? { configurable: { thread_id: threadId } as Record<string, string> }
      : undefined;

    const order: Array<{ node: string; message: string }> = [
      { node: "scout", message: "Buscando competidores y referencias de mercado..." },
      { node: "auditor", message: "Analizando tech stack de los competidores..." },
      { node: "critic", message: "Validando calidad de la investigación..." },
      { node: "synthesis", message: "Generando documento de Gap Analysis..." },
    ];

    let lastState: Record<string, unknown> = {};
    let stepIndex = 0;

    try {
      const stream = await graph.stream(initialState, {
        ...config,
        streamMode: "values",
      });

      for await (const chunk of stream) {
        // LangGraph streamMode "values" yields [namespace, "values", state] or plain state
        const raw = chunk as unknown;
        const state: Record<string, unknown> =
          Array.isArray(raw) && raw[1] === "values" && raw[2] != null
            ? (raw[2] as Record<string, unknown>)
            : (raw as Record<string, unknown>) ?? {};
        const prev = lastState;
        lastState = state;

        const hadCompetitors = Array.isArray(prev.competitors) && (prev.competitors as unknown[]).length > 0;
        const hasCompetitors = Array.isArray(state.competitors) && (state.competitors as unknown[]).length > 0;
        const hadTech = Array.isArray(prev.techStackInsights) && (prev.techStackInsights as unknown[]).length > 0;
        const hasTech = Array.isArray(state.techStackInsights) && (state.techStackInsights as unknown[]).length > 0;
        const hasDecision = state.criticDecision != null;
        const hadDecision = prev.criticDecision != null;
        const hasGap = typeof state.gapAnalysis === "string" && (state.gapAnalysis as string).trim().length > 0;
        const hadGap = typeof prev.gapAnalysis === "string" && (prev.gapAnalysis as string).trim().length > 0;

        if (!hadCompetitors && hasCompetitors) {
          yield { type: "progress", agent: getAgentLabel("scout"), message: order[0].message };
        }
        if (!hadTech && hasTech) {
          yield { type: "progress", agent: getAgentLabel("auditor"), message: order[1].message };
        }
        if (!hadDecision && hasDecision) {
          yield { type: "progress", agent: getAgentLabel("critic"), message: order[2].message };
        }
        if (!hadGap && hasGap) {
          yield { type: "progress", agent: getAgentLabel("synthesis"), message: order[3].message };
        }

        stepIndex += 1;
      }

      const finalState = lastState as DBGAState;
      const markdown = stateToMarkdown(finalState);
      yield { type: "done", markdown };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error en el análisis";
      yield { type: "error", message };
    }
  }

  /**
   * Streams the MDD (Master Design Document) pipeline: Clarificador → Security → Integration → Auditor.
   * Si el Auditor da score < 85%, el Manager asigna gaps a los agentes; >= 85% cede al usuario (máx. iteraciones según config).
   * Emite eventos progress por nodo y al final done con el markdown del MDD.
   */
  async *streamMddAnalysis(
    dbgaContent: string,
    projectId?: string,
  ): AsyncGenerator<StreamProgressEvent> {
    const graph = createMddGraph(this.graphMemory);
    const initialState: MDDState = {
      ...defaultMDDState,
      dbgaContent: dbgaContent.trim() || "(Sin Benchmark. El usuario no tiene un documento de Benchmark; genera un MDD base con contexto, alcance y requisitos que el usuario podrá refinar.)",
      projectId: projectId?.trim(),
    };

    const mddOrder: Array<{ node: string; message: string }> = [
      { node: "clarifier", message: "Clarificando alcance y requisitos..." },
      { node: "software_architect", message: "Definiendo schema SQL y contratos de API..." },
      { node: "architect_critic", message: "Verificando §3 y §4 frente a la directiva..." },
      { node: "format_after_architect", message: "Formateando documento..." },
      { node: "security", message: "Definiendo arquitectura de seguridad..." },
      { node: "integration", message: "Definiendo integraciones..." },
      { node: "format_after_redactor", message: "Formateando documento..." },
      { node: "diagram_injector", message: "Añadiendo diagramas Mermaid..." },
      { node: "auditor", message: "Evaluando calidad del MDD..." },
    ];

    let lastState: MDDState = initialState;

    try {
      const stream = await graph.stream(initialState, {
        streamMode: ["updates", "values"] as const,
      });

      for await (const raw of stream) {
        const [mode, data] = Array.isArray(raw) ? (raw as [string, unknown]) : ["values", raw];
        if (mode === "updates" && data && typeof data === "object" && !Array.isArray(data)) {
          const nodeName = Object.keys(data as Record<string, unknown>)[0];
          if (nodeName) {
            const entry = mddOrder.find((e) => e.node === nodeName);
            const label = nodeName === "auditor" ? getAgentLabel("auditor", "mdd") : getAgentLabel(nodeName);
            yield { type: "progress", agent: label, message: entry?.message ?? nodeName };
          }
        }
        if (mode === "values" && data && typeof data === "object") {
          lastState = data as MDDState;
          if (projectId?.trim() && (lastState.mddDraft ?? "").trim()) {
            this.estimationService.setLiveDraft(projectId.trim(), lastState.mddDraft ?? "");
            if (lastState.auditorGaps) this.estimationService.setAuditorGaps(projectId.trim(), lastState.auditorGaps);
          }
        }
      }

      const raw = (lastState.mddDraft || "").trim() || "# Master Design Document\n\n(Sin contenido generado.)";
      const markdown = prepareMddForOutput({
        mddStructured: lastState.mddStructured,
        mddDraft: raw || lastState.mddDraft,
      });
      logSection3Debug("final (stream done)", markdown);
      if (projectId?.trim()) this.estimationService.clearLiveDraft(projectId.trim());
      yield { type: "done", markdown };
    } catch (err) {
      if (projectId?.trim()) this.estimationService.clearLiveDraft(projectId.trim());
      const message = err instanceof Error ? err.message : "Error en el flujo MDD";
      yield { type: "error", message };
    }
  }

  /**
   * Flujo MDD con Manager (Supervisor): entrevista al usuario (máx. 2 preguntas por ronda),
   * envía contexto a especialistas; termina cuando el Auditor da >= 85% (cede intervención al usuario) o usuario pide parar.
   * Emite "interrupt" con questions y threadId cuando el Manager pide respuestas; luego usar streamMddResume.
   */
  async *streamMddAnalysisWithManager(
    dbgaContent: string,
    projectId: string,
    initialMessage?: string,
    initialMddDraft?: string,
  ): AsyncGenerator<StreamMddManagerEvent> {
    this.logger.log(`[MDD stream/manager] start projectId=${projectId} initialMessage=${initialMessage ? "(presente)" : "(vacío)"} mddDraftLen=${(initialMddDraft ?? "").length}`);

    const checkpointer = await this.checkpointerService.getCheckpointer();
    if (!checkpointer) {
      this.logger.warn("[MDD stream/manager] Checkpointer no disponible");
      yield { type: "error", message: "Checkpointer no disponible; el flujo con Manager requiere persistencia." };
      return;
    }

    yield { type: "progress", agent: "Manager", message: "Procesando tu mensaje..." };

    const row = await this.prisma.agentStateCheckpoint.upsert({
      where: { projectId: projectId.trim() },
      create: { threadId: randomUUID(), projectId: projectId.trim() },
      update: {},
    });
    const threadId = row.threadId;

    const graph = createMddGraphWithManager(checkpointer, this.graphMemory, this.estimationService);
    const existingMdd = (initialMddDraft ?? "").trim();
    const rawInitial = (initialMessage ?? "").trim();
    const looksLikeMddDocument =
      rawInitial.length > 500 &&
      /^#\s*Master\s+Design\s+Document/i.test(rawInitial) &&
      /\n##\s*1\.\s*Contexto/i.test(rawInitial);
    const lastUserMessage = looksLikeMddDocument
      ? undefined
      : (rawInitial || undefined);
    if (looksLikeMddDocument) {
      this.logger.warn("[MDD stream/manager] initialMessage parece el documento MDD (no la petición del usuario); se ignora como lastUserMessage");
    }
    const initialState: MDDState = {
      ...defaultMDDState,
      dbgaContent: dbgaContent.trim() || "(Sin Benchmark. El usuario no tiene un documento de Benchmark; genera un MDD base.)",
      lastUserMessage,
      mddDraft: existingMdd || defaultMDDState.mddDraft,
      projectId: projectId?.trim(),
    };
    const config = { configurable: { thread_id: threadId } as Record<string, string> };

    const mddOrder: Array<{ node: string; message: string }> = [
      { node: "manager", message: "Entrevistando al usuario..." },
      { node: "ask_initial_topic", message: "Preguntando tema o problema del MDD..." },
      { node: "plan_approval", message: "Esperando aprobación del plan..." },
      { node: "executor", message: "Ejecutando plan paso a paso..." },
      { node: "clarifier", message: "Clarificando alcance y requisitos..." },
      { node: "software_architect", message: "Definiendo schema SQL y contratos de API..." },
      { node: "architect_critic", message: "Verificando §3 y §4 frente a la directiva..." },
      { node: "format_after_architect", message: "Formateando documento..." },
      { node: "security", message: "Definiendo arquitectura de seguridad..." },
      { node: "integration", message: "Definiendo integraciones..." },
      { node: "format_after_redactor", message: "Formateando documento..." },
      { node: "diagram_injector", message: "Añadiendo diagramas Mermaid..." },
      { node: "auditor", message: "Evaluando calidad del MDD..." },
    ];

    let lastState: MDDState = initialState;
    let lastNonEmptyDraft = (initialState.mddDraft ?? "").trim() || "";
    const auditTrail: string[] = [];

    try {
      const stream = await graph.stream(initialState, {
        ...config,
        streamMode: ["updates", "values"] as const,
      });

      for await (const raw of stream) {
        const [mode, data] = Array.isArray(raw) ? (raw as [string, unknown]) : ["values", raw];
        if (mode === "updates" && data && typeof data === "object" && !Array.isArray(data)) {
          const dataRecord = data as Record<string, unknown>;
          const nodeName = Object.keys(dataRecord)[0];
          if (nodeName && nodeName !== "__interrupt__") {
            const nodeData = dataRecord[nodeName] as Partial<MDDState> | undefined;
            const draftLen = nodeData?.mddDraft?.length;
            const scopeLen = nodeData?.clarifiedScope?.length;
            const extra = [];
            if (draftLen) extra.push(`draft=${draftLen}`);
            if (scopeLen) extra.push(`scope=${scopeLen}`);
            auditTrail.push(`${nodeName}(${extra.join(" ")})`);
          }
          if (nodeName === "__interrupt__") {
            const interrupts = dataRecord.__interrupt__ as Array<{
              value?: { type?: string; reply?: string; questions?: string[]; plan?: Array<{ step_id: string; task_description: string; node: string }>; message?: string };
            }> | undefined;
            const first = Array.isArray(interrupts) ? interrupts[0] : undefined;
            const value = first?.value;
            let reply = typeof value?.reply === "string" ? value.reply : undefined;
            let questions = Array.isArray(value?.questions) ? value.questions : typeof value?.questions === "string" ? [value.questions] : [];
            if (value?.type === "questions" && questions.length === 0) {
              questions = [
                "¿Cuáles son los objetivos principales del sistema o producto?",
                "¿Qué aplicaciones o sistemas deben integrarse (ej. SSO, APIs)?",
              ];
            }
            const plan = value?.type === "plan_approval" && Array.isArray(value?.plan) ? value.plan : undefined;
            const planMessage = value?.type === "plan_approval" && typeof value?.message === "string" ? value.message : undefined;
            let draftOnInterrupt = prepareMddForOutput({
              mddStructured: lastState?.mddStructured,
              mddDraft: (lastState?.mddDraft ?? "").trim(),
            });
            if (draftOnInterrupt.length < 200 && existingMdd.length >= 200) {
              draftOnInterrupt = prepareMddForOutput(existingMdd);
            }
            const metrics = this.estimationService.calculateLiveMetrics(draftOnInterrupt);
            const precisionBreakdown = this.estimationService.getPrecisionBreakdown(draftOnInterrupt);
            if (reply && /Estamos al \d+%/.test(reply)) {
              reply = reply.replace(/\bEstamos al \d+%/, `Estamos al ${metrics.precision}%`);
            }
            this.logger.log(`[MDD stream/manager] interrupt (from stream) reply=${reply ? "(presente)" : "(no)"} questions=${questions?.length ?? 0} plan=${plan?.length ?? 0} markdownLen=${draftOnInterrupt.length}`);
            yield {
              type: "interrupt",
              threadId,
              reply,
              questions: questions.length > 0 ? questions.slice(0, 2) : undefined,
              plan,
              planMessage,
              markdown: draftOnInterrupt || undefined,
              precision: metrics.precision,
              status: metrics.status,
              precisionBreakdown,
              auditorFeedback: lastState?.auditorFeedback?.trim() || undefined,
              auditTrail,
            };
            return;
          }
          if (nodeName) {
            const entry = mddOrder.find((e) => e.node === nodeName);
            const label = nodeName === "auditor" ? getAgentLabel("auditor", "mdd") : nodeName === "manager" ? "Manager (entrevista)" : getAgentLabel(nodeName);
            this.logger.log(`[MDD stream/manager] progress node=${nodeName} label=${label}`);
            yield { type: "progress", agent: label, message: entry?.message ?? nodeName };
          }
        }
        if (mode === "values" && data && typeof data === "object") {
          lastState = data as MDDState;
          const draft = (lastState.mddDraft ?? "").trim();
          if (draft) {
            lastNonEmptyDraft = draft;
            this.estimationService.setLiveDraft(projectId.trim(), draft);
            if (lastState.auditorGaps) this.estimationService.setAuditorGaps(projectId.trim(), lastState.auditorGaps);
            const prepared = prepareMddForOutput({
              mddStructured: lastState?.mddStructured,
              mddDraft: draft,
            });
            if (prepared.length > 80) yield { type: "draft", markdown: prepared };
          }
        }
      }

      const finalDraft = (lastState?.mddDraft ?? "").trim();
      let rawMarkdown =
        finalDraft ||
        (lastNonEmptyDraft && lastNonEmptyDraft.length > 80 ? lastNonEmptyDraft : "") ||
        "# Master Design Document\n\n(Sin contenido generado.)";
      if (rawMarkdown.length < 200 && existingMdd.length >= 200) {
        rawMarkdown = existingMdd;
      }
      const markdown = prepareMddForOutput({
        mddStructured: lastState?.mddStructured,
        mddDraft: rawMarkdown,
      });
      logSection3Debug("final (stream/manager done)", markdown);
      if (projectId?.trim()) {
        this.estimationService.clearLiveDraft(projectId.trim());
        this.clearMddCheckpoint(projectId.trim()).catch(() => { });
      }
      const metrics = this.estimationService.calculateLiveMetrics(markdown);
      const precisionBreakdown = this.estimationService.getPrecisionBreakdown(markdown);
      this.logger.log(`[MDD stream/manager] done markdownLen=${markdown.length} finalDraftLen=${finalDraft.length} lastNonEmptyLen=${lastNonEmptyDraft.length} auditTrail=${auditTrail.length}`);
      yield {
        type: "done",
        markdown,
        precision: metrics.precision,
        status: metrics.status,
        auditorFeedback: lastState?.auditorFeedback?.trim() || undefined,
        precisionBreakdown,
        auditTrail,
      };
    } catch (err) {
      if (isGraphInterrupt(err) && err.interrupts?.length > 0) {
        const value = err.interrupts[0]?.value as {
          type?: string;
          reply?: string;
          questions?: string[];
          plan?: Array<{ step_id: string; task_description: string; node: string }>;
          message?: string;
        } | undefined;
        let reply = typeof value?.reply === "string" ? value.reply : undefined;
        let questions = Array.isArray(value?.questions) ? value.questions : typeof value?.questions === "string" ? [value.questions] : [];
        if (value?.type === "questions" && questions.length === 0) {
          questions = [
            "¿Cuáles son los objetivos principales del sistema o producto?",
            "¿Qué aplicaciones o sistemas deben integrarse (ej. SSO, APIs)?",
          ];
        }
        const plan = value?.type === "plan_approval" && Array.isArray(value?.plan) ? value.plan : undefined;
        const planMessage = value?.type === "plan_approval" && typeof value?.message === "string" ? value.message : undefined;
        let draftOnInterrupt = prepareMddForOutput({
          mddStructured: lastState?.mddStructured,
          mddDraft: (lastState?.mddDraft ?? "").trim(),
        });
        if (draftOnInterrupt.length < 200 && existingMdd.length >= 200) {
          draftOnInterrupt = prepareMddForOutput(existingMdd);
        }
        const metrics = this.estimationService.calculateLiveMetrics(draftOnInterrupt);
        const precision = metrics.precision;
        const status = metrics.status;
        const precisionBreakdown = this.estimationService.getPrecisionBreakdown(draftOnInterrupt);
        const auditorFeedback = lastState?.auditorFeedback?.trim() || undefined;
        if (reply && /Estamos al \d+%/.test(reply)) {
          reply = reply.replace(/\bEstamos al \d+%/, `Estamos al ${metrics.precision}%`);
        }
        this.logger.log(`[MDD stream/manager] interrupt reply=${reply ? "(presente)" : "(no)"} questions=${questions?.length ?? 0} plan=${plan?.length ?? 0} markdownLen=${draftOnInterrupt.length}`);
        yield {
          type: "interrupt",
          threadId,
          reply,
          questions: questions.length > 0 ? questions.slice(0, 2) : undefined,
          plan,
          planMessage,
          markdown: draftOnInterrupt || undefined,
          precision,
          status,
          precisionBreakdown,
          auditorFeedback,
          auditTrail: [],
        };
        return;
      }
      this.estimationService.clearLiveDraft(projectId.trim());
      const message = err instanceof Error ? err.message : "Error en el flujo MDD con Manager";
      this.logger.error(`[MDD stream/manager] error: ${message}`, err instanceof Error ? err.stack : String(err));
      lastStepFailedByThread.set(threadId, { node: "unknown", error: message });
      yield { type: "error", message: `${message} Reanuda con un mensaje (ej. "reintentar" o "omitir") y el Manager re-planificará.`, replanning: true };
    }
  }

  /**
   * Reanuda el flujo MDD con Manager tras la respuesta del usuario (preguntas o conversación).
   */
  async *streamMddResume(
    projectId: string,
    threadId: string,
    userMessage: string,
    mddContentFromClient?: string,
  ): AsyncGenerator<StreamMddManagerEvent> {
    this.logger.log(`[MDD stream/resume] start projectId=${projectId} threadId=${threadId} userMessageLen=${userMessage?.length ?? 0} mddContentLen=${(mddContentFromClient ?? "").length}`);

    const checkpointer = await this.checkpointerService.getCheckpointer();
    if (!checkpointer) {
      this.logger.warn("[MDD stream/resume] Checkpointer no disponible");
      yield { type: "error", message: "Checkpointer no disponible." };
      return;
    }

    yield { type: "progress", agent: "Manager", message: "Reanudando flujo con tu respuesta..." };

    const graph = createMddGraphWithManager(checkpointer, this.graphMemory, this.estimationService);
    const config = { configurable: { thread_id: threadId } as Record<string, string> };
    const auditTrail: string[] = [];
    const mddOrder: Array<{ node: string; message: string }> = [
      { node: "manager", message: "Entrevistando al usuario..." },
      { node: "ask_initial_topic", message: "Preguntando tema o problema del MDD..." },
      { node: "plan_approval", message: "Esperando aprobación del plan..." },
      { node: "executor", message: "Ejecutando plan paso a paso..." },
      { node: "clarifier", message: "Clarificando alcance y requisitos..." },
      { node: "software_architect", message: "Definiendo schema SQL y contratos de API..." },
      { node: "architect_critic", message: "Verificando §3 y §4 frente a la directiva..." },
      { node: "format_after_architect", message: "Formateando documento..." },
      { node: "security", message: "Definiendo arquitectura de seguridad..." },
      { node: "integration", message: "Definiendo integraciones..." },
      { node: "format_after_redactor", message: "Formateando documento..." },
      { node: "diagram_injector", message: "Añadiendo diagramas Mermaid..." },
      { node: "auditor", message: "Evaluando calidad del MDD..." },
    ];

    let lastState: MDDState | null = null;
    let lastNonEmptyDraft = "";

    const pendingStepFailed = lastStepFailedByThread.get(threadId);
    if (pendingStepFailed) lastStepFailedByThread.delete(threadId);

    try {
      // Resume hace que interrupt() devuelva el valor; pero el estado (lastUserMessage) no se rellena automáticamente.
      // Inyectamos lastUserMessage para que el Manager vea la respuesta al reanudar (acuerdo breve → agente responsable).
      // Si había un fallo de nodo, inyectamos lastStepFailed para que el Manager re-planifique.
      // mddContentFromClient: evita revertir al checkpoint viejo; el front envía el documento actual (ej. con secret_key en mfa_methods).
      const stream = await graph.stream(
        new Command({
          resume: userMessage.trim(),
          update: {
            lastUserMessage: userMessage.trim() || undefined,
            ...(pendingStepFailed ? { lastStepFailed: pendingStepFailed } : {}),
            ...(mddContentFromClient?.trim() && mddContentFromClient.trim().length > 80
              ? { mddDraft: mddContentFromClient.trim() }
              : {}),
            projectId: projectId?.trim(),
          },
        }),
        {
          ...config,
          streamMode: ["updates", "values"] as const,
        },
      );

      for await (const raw of stream) {
        const [mode, data] = Array.isArray(raw) ? (raw as [string, unknown]) : ["values", raw];
        if (mode === "updates" && data && typeof data === "object" && !Array.isArray(data)) {
          const dataRecord = data as Record<string, unknown>;
          const nodeName = Object.keys(dataRecord)[0];
          if (nodeName === "__interrupt__") {
            const interrupts = dataRecord.__interrupt__ as Array<{
              value?: { type?: string; reply?: string; questions?: string[]; plan?: Array<{ step_id: string; task_description: string; node: string }>; message?: string };
            }> | undefined;
            const first = Array.isArray(interrupts) ? interrupts[0] : undefined;
            const value = first?.value;
            let reply = typeof value?.reply === "string" ? value.reply : undefined;
            let questions = Array.isArray(value?.questions) ? value.questions : typeof value?.questions === "string" ? [value.questions] : [];
            if (value?.type === "questions" && questions.length === 0) {
              questions = [
                "¿Cuáles son los objetivos principales del sistema o producto?",
                "¿Qué aplicaciones o sistemas deben integrarse (ej. SSO, APIs)?",
              ];
            }
            const plan = value?.type === "plan_approval" && Array.isArray(value?.plan) ? value.plan : undefined;
            const planMessage = value?.type === "plan_approval" && typeof value?.message === "string" ? value.message : undefined;
            // Usar estado actual del checkpointer para el markdown (evita enviar draft antiguo si el stream emitió updates antes que values)
            let stateForMarkdown = lastState;
            try {
              const snapshot = await graph.getState(config);
              const values = snapshot?.values as MDDState | undefined;
              if (values?.mddDraft?.trim()) stateForMarkdown = values;
            } catch {
              // mantener lastState
            }
            let draftOnInterrupt = prepareMddForOutput({
              mddStructured: stateForMarkdown?.mddStructured,
              mddDraft: (stateForMarkdown?.mddDraft ?? "").trim(),
            });
            const isBroken = draftOnInterrupt.startsWith("## useMermaidForDiagrams") || draftOnInterrupt.startsWith("## leaveUncovered") || (draftOnInterrupt.includes("## document") && !draftOnInterrupt.includes("## 1. Contexto"));
            if (isBroken && lastNonEmptyDraft && lastNonEmptyDraft.length > 80) draftOnInterrupt = prepareMddForOutput(lastNonEmptyDraft.trim());
            const metrics = this.estimationService.calculateLiveMetrics(draftOnInterrupt);
            const precisionBreakdown = this.estimationService.getPrecisionBreakdown(draftOnInterrupt);
            if (reply && /Estamos al \d+%/.test(reply)) {
              reply = reply.replace(/\bEstamos al \d+%/, `Estamos al ${metrics.precision}%`);
            }
            this.logger.log(`[MDD stream/resume] interrupt (from stream) reply=${reply ? "(presente)" : "(no)"} questions=${questions?.length ?? 0} plan=${plan?.length ?? 0} markdownLen=${draftOnInterrupt.length}`);
            yield {
              type: "interrupt",
              threadId,
              reply,
              questions: questions.length > 0 ? questions.slice(0, 2) : undefined,
              plan,
              planMessage,
              markdown: draftOnInterrupt || undefined,
              precision: metrics.precision,
              status: metrics.status,
              precisionBreakdown,
              auditorFeedback: stateForMarkdown?.auditorFeedback?.trim() || undefined,
              auditTrail,
            };
            return;
          }
          if (nodeName) {
            const entry = mddOrder.find((e) => e.node === nodeName);
            const label = nodeName === "auditor" ? getAgentLabel("auditor", "mdd") : nodeName === "manager" ? "Manager (entrevista)" : getAgentLabel(nodeName);

            const nodeData = dataRecord[nodeName] as Partial<MDDState> | undefined;
            const draftLen = nodeData?.mddDraft?.length;
            const scopeLen = nodeData?.clarifiedScope?.length;
            const extra = [];
            if (draftLen) extra.push(`draft=${draftLen}`);
            if (scopeLen) extra.push(`scope=${scopeLen}`);
            auditTrail.push(`${nodeName}(${extra.join(" ")})`);

            this.logger.log(`[MDD stream/resume] progress node=${nodeName} label=${label}`);
            yield { type: "progress", agent: label, message: entry?.message ?? nodeName };
          }
        }
        if (mode === "values" && data && typeof data === "object") {
          lastState = data as MDDState;
          const draft = (lastState.mddDraft ?? "").trim();
          if (draft) {
            lastNonEmptyDraft = draft;
            if (projectId?.trim()) {
              this.estimationService.setLiveDraft(projectId.trim(), draft);
              if (lastState.auditorGaps) this.estimationService.setAuditorGaps(projectId.trim(), lastState.auditorGaps);
            }
            const prepared = prepareMddForOutput({
              mddStructured: lastState?.mddStructured,
              mddDraft: draft,
            });
            if (prepared.length > 80) yield { type: "draft", markdown: prepared };
          }
        }
      }

      if (lastState) {
        const finalDraft = (lastState.mddDraft || "").trim();
        let raw =
          finalDraft ||
          (lastNonEmptyDraft && lastNonEmptyDraft.length > 80 ? lastNonEmptyDraft : "") ||
          "# Master Design Document\n\n(Sin contenido generado.)";
        if (raw.length < 80 && projectId?.trim()) {
          const project = await this.prisma.project.findUnique({
            where: { id: projectId.trim() },
            select: { mddContent: true },
          });
          if (project?.mddContent?.trim() && project.mddContent.trim().length > 80) {
            raw = project.mddContent.trim();
            this.logger.log("[MDD stream/resume] done: draft vacío/corto, usando mddContent del proyecto");
          }
        }
        const isBrokenMetadataDocument =
          raw.startsWith("## useMermaidForDiagrams") ||
          raw.startsWith("## leaveUncovered") ||
          (raw.includes("## document") && !raw.includes("## 1. Contexto"));
        if (isBrokenMetadataDocument && lastNonEmptyDraft && lastNonEmptyDraft.length > 80) {
          raw = lastNonEmptyDraft;
        }
        const markdown = prepareMddForOutput({
          mddStructured: lastState?.mddStructured,
          mddDraft: raw,
        });
        logSection3Debug("final (stream/resume done)", markdown);
        if (projectId?.trim()) {
          this.estimationService.clearLiveDraft(projectId.trim());
          this.clearMddCheckpoint(projectId.trim()).catch(() => { });
        }
        const metrics = this.estimationService.calculateLiveMetrics(markdown);
        const precisionBreakdown = this.estimationService.getPrecisionBreakdown(markdown);
        this.logger.log(`[MDD stream/resume] done markdownLen=${markdown.length} finalDraftLen=${finalDraft.length}`);
        this.logger.log(`[MDD stream/resume] Audit Trail: ${auditTrail.join(" -> ")}`);
        yield {
          type: "done",
          markdown,
          precision: metrics.precision,
          status: metrics.status,
          auditorFeedback: lastState?.auditorFeedback?.trim() || undefined,
          precisionBreakdown,
          auditTrail,
        };
      }
    } catch (err) {
      if (projectId?.trim()) this.estimationService.clearLiveDraft(projectId.trim());
      if (isGraphInterrupt(err) && err.interrupts?.length > 0) {
        const value = err.interrupts[0]?.value as {
          type?: string;
          reply?: string;
          questions?: string[];
          plan?: Array<{ step_id: string; task_description: string; node: string }>;
          message?: string;
        } | undefined;
        let reply = typeof value?.reply === "string" ? value.reply : undefined;
        let questions = Array.isArray(value?.questions) ? value.questions : typeof value?.questions === "string" ? [value.questions] : [];
        if (value?.type === "questions" && questions.length === 0) {
          questions = [
            "¿Cuáles son los objetivos principales del sistema o producto?",
            "¿Qué aplicaciones o sistemas deben integrarse (ej. SSO, APIs)?",
          ];
        }
        const plan = value?.type === "plan_approval" && Array.isArray(value?.plan) ? value.plan : undefined;
        const planMessage = value?.type === "plan_approval" && typeof value?.message === "string" ? value.message : undefined;
        let stateForMarkdown = lastState;
        try {
          const snapshot = await graph.getState(config);
          const values = snapshot?.values as MDDState | undefined;
          if (values?.mddDraft?.trim()) stateForMarkdown = values;
        } catch {
          // mantener lastState
        }
        const draftOnInterrupt = prepareMddForOutput({
          mddStructured: stateForMarkdown?.mddStructured,
          mddDraft: (stateForMarkdown?.mddDraft ?? "").trim(),
        });
        const metrics = this.estimationService.calculateLiveMetrics(draftOnInterrupt);
        const precision = metrics.precision;
        const status = metrics.status;
        const precisionBreakdown = this.estimationService.getPrecisionBreakdown(draftOnInterrupt);
        const auditorFeedback = stateForMarkdown?.auditorFeedback?.trim() || undefined;
        if (reply && /Estamos al \d+%/.test(reply)) {
          reply = reply.replace(/\bEstamos al \d+%/, `Estamos al ${metrics.precision}%`);
        }
        this.logger.log(`[MDD stream/resume] interrupt reply=${reply ? "(presente)" : "(no)"} questions=${questions?.length ?? 0} plan=${plan?.length ?? 0} markdownLen=${draftOnInterrupt.length}`);
        yield {
          type: "interrupt",
          threadId,
          reply,
          questions: questions.length > 0 ? questions.slice(0, 2) : undefined,
          plan,
          planMessage,
          markdown: draftOnInterrupt || undefined,
          precision,
          status,
          precisionBreakdown,
          auditorFeedback,
        };
        return;
      }
      const message = err instanceof Error ? err.message : "Error al reanudar el flujo MDD";
      this.logger.error(`[MDD stream/resume] error: ${message}`, err instanceof Error ? err.stack : String(err));
      yield { type: "error", message };
    }
  }

  /**
   * Regenera solo una sección del MDD (2–7) usando el resto del documento como contexto.
   * Entrada alternativa: comandos / en el chat (ej. /infraestructura). No reemplaza el flujo
   * con Manager (streamMddAnalysisWithManager / streamMddResume): si el usuario escribe texto
   * normal, el frontend sigue usando manager/resume; este método solo se invoca cuando el
   * cliente envía explícitamente section 2–7 (regenerate-section). NDJSON: progress | done | error.
   */
  async *streamMddRegenerateSection(
    projectId: string,
    section: number,
    mddContentFromClient?: string,
  ): AsyncGenerator<StreamMddManagerEvent> {
    const pid = projectId?.trim();
    if (!pid) {
      yield { type: "error", message: "projectId es requerido" };
      return;
    }
    if (section < 1 || section > 7) {
      yield { type: "error", message: "section debe ser 1–7" };
      return;
    }
    let mddContent = typeof mddContentFromClient === "string" ? mddContentFromClient.trim() : "";
    if (mddContent.length < 100) {
      const project = await this.prisma.project.findUnique({
        where: { id: pid },
        select: { mddContent: true },
      });
      mddContent = (project?.mddContent ?? "").trim();
    }
    if (mddContent.length < 100) {
      yield { type: "error", message: "No hay MDD suficiente para regenerar una sección. Genera o edita el MDD antes." };
      return;
    }

    const llm = createDbgaLLM();
    const agentLabel =
      section === 1
        ? "Contexto (sintetizador)"
        : section === 7
          ? "Integración"
          : section === 6
            ? "Seguridad"
            : "Arquitecto de Software";

    yield { type: "progress", agent: agentLabel, message: `Regenerando §${section}...` };

    try {
      if (section === 1) {
        const prompt = `${CONTEXT_SYNTHESIZER_PROMPT}\n\n---\n\n**Documento MDD (usa las secciones 2–7 para sintetizar la sección 1):**\n\n${mddContent}`;
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const text = (typeof response.content === "string" ? response.content : "").trim();
        let newBody = (text && extractContextSectionBody(text)) || text || "(Contexto sintetizado desde el documento.)";
        const firstOtherSection = newBody.search(/\n##\s+(?:2|3|4|5|6|7)[.\s]/);
        if (firstOtherSection !== -1) {
          newBody = newBody.slice(0, firstOtherSection).trim();
        }
        const headingFragmentLine = /^\s*(?:y|and)\s+alcance\s*(?:del\s+)?mdd\s*\.?\s*$/i;
        newBody = newBody
          .split(/\r?\n/)
          .filter((line) => !headingFragmentLine.test(line.trim()))
          .join("\n")
          .replace(/^\s*[\r\n]+/, "")
          .replace(/^```[\w]*\s*\n?/, "")
          .replace(/\n?```\s*$/, "")
          .trim() || newBody;
        const finalDraft = replaceSection1BodyFromAnyHeading(mddContent, newBody);
        const markdown = prepareMddForOutput(finalDraft);
        const metrics = this.estimationService.calculateLiveMetrics(markdown);
        yield {
          type: "done",
          markdown,
          precision: metrics.precision,
          status: metrics.status,
          precisionBreakdown: this.estimationService.getPrecisionBreakdown(markdown),
        };
        return;
      }

      const structured = markdownToMddStructured(mddContent);
      const state: MDDState = {
        ...defaultMDDState,
        dbgaContent: "(Regenerando sección desde documento actual.)",
        clarifiedScope: structured?.contextoAlcance ?? "",
        mddStructured: structured ?? undefined,
        mddDraft: mddContent,
      };

      if (section === 7) {
        const integrationNode = createMddIntegrationNode(llm);
        const result = await integrationNode(state as MDDStateType);
        const finalDraft = (result.mddDraft ?? mddContent).trim();
        const markdown = prepareMddForOutput({ mddStructured: result.mddStructured, mddDraft: finalDraft });
        const metrics = this.estimationService.calculateLiveMetrics(markdown);
        yield {
          type: "done",
          markdown,
          precision: metrics.precision,
          status: metrics.status,
          precisionBreakdown: this.estimationService.getPrecisionBreakdown(markdown),
        };
        return;
      }
      if (section === 6) {
        const securityNode = createMddSecurityNode(llm);
        const result = await securityNode(state as MDDStateType);
        const finalDraft = (result.mddDraft ?? mddContent).trim();
        const markdown = prepareMddForOutput({ mddStructured: result.mddStructured, mddDraft: finalDraft });
        const metrics = this.estimationService.calculateLiveMetrics(markdown);
        yield {
          type: "done",
          markdown,
          precision: metrics.precision,
          status: metrics.status,
          precisionBreakdown: this.estimationService.getPrecisionBreakdown(markdown),
        };
        return;
      }
      if (section >= 2 && section <= 5) {
        const softwareArchitectNode = createMddSoftwareArchitectNode(llm, getMddArchitectTools());
        const result = await softwareArchitectNode(state as MDDStateType);
        const architectDraft = (result.mddDraft ?? "").trim();
        const content25 = extractSections2To5Content(architectDraft);
        const finalDraft =
          content25 != null
            ? replaceSections2To5InDraft(mddContent, content25)
            : architectDraft || mddContent;
        const markdown = prepareMddForOutput({ mddStructured: result.mddStructured, mddDraft: finalDraft });
        const metrics = this.estimationService.calculateLiveMetrics(markdown);
        yield {
          type: "done",
          markdown,
          precision: metrics.precision,
          status: metrics.status,
          precisionBreakdown: this.estimationService.getPrecisionBreakdown(markdown),
        };
        return;
      }
      yield { type: "error", message: "Sección no soportada para regeneración." };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[MDD regenerate-section] error: ${message}`, err instanceof Error ? err.stack : undefined);
      yield { type: "error", message: `Error al regenerar §${section}: ${message}` };
    }
  }

  /**
   * Obtiene las decisiones arquitectónicas (ADRs) guardadas en el grafo para un proyecto.
   */
  async getProjectDecisions(projectId: string) {
    return this.graphMemory.getDecisionsByProject(projectId);
  }
}
