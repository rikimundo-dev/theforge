import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ChatImagePart, ChatMessage } from "@theforge/shared-types";
import {
  PROJECTS_ORCHESTRATOR_PORT,
  type IOrchestratorProjectsPort,
} from "../projects/projects-service.port.js";
import { SessionsService } from "../sessions/sessions.service.js";
import {
  THEFORGE_ORCHESTRATOR_PORT,
  type IOrchestratorTheForgePort,
} from "../theforge/theforge-service.port.js";
import { LEGACY_DOCUMENTATION_PROMPT } from "../ai/prompts/legacy-documentation-prompt.js";
import { AgentSupervisorService } from "../agent-supervisor/agent-supervisor.service.js";
import type { SupervisorRouteResult } from "../agent-supervisor/agent-supervisor.types.js";
import { SddIngestorService } from "../ai-analysis/sdd-ingestor.service.js";
import { AgentEvaluatorService } from "../agent-supervisor/agent-evaluator.service.js";
import { EpisodicMemoryKind } from "@theforge/database";
import { uxGuideLlmOptions } from "../ai/ux-guide-llm-context.js";

function filterChatByTab(log: ChatMessage[], tab: string): ChatMessage[] {
  return log.filter((m) => (m.tab ?? "mdd") === tab);
}

function mddForRouteStage(
  project: { mddContent?: string | null; stages?: { id: string; mddContent: string | null }[] },
  routeStageId: string,
): string | null | undefined {
  const st = project.stages?.find((s) => s.id === routeStageId);
  return st?.mddContent ?? project.mddContent;
}

function stageBrdContent(
  project: { stages?: { id: string; brdContent: string | null }[] | null },
  routeStageId: string,
): string | null | undefined {
  const st = project.stages?.find((s) => s.id === routeStageId);
  return st?.brdContent ?? undefined;
}

@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly sessions: SessionsService,
    @Inject(PROJECTS_ORCHESTRATOR_PORT) private readonly projects: IOrchestratorProjectsPort,
    @Inject(THEFORGE_ORCHESTRATOR_PORT) private readonly theforge: IOrchestratorTheForgePort,
    private readonly agentSupervisor: AgentSupervisorService,
    private readonly sddIngestor: SddIngestorService,
    private readonly agentEvaluator: AgentEvaluatorService,
  ) { }

  private scheduleSddIngest(projectId: string, ingestMdd: boolean): void {
    if (!ingestMdd) return;
    void this.sddIngestor.ingestProjectMdd(projectId).catch((err) => {
      console.error("[Orchestrator] SDD ingest failed:", err);
    });
  }

  /** Sufijo de prompt con rechazos/reflexión recientes (legacy / SDD). */
  private async episodicPromptSuffix(stageId: string): Promise<string> {
    const eps = await this.agentSupervisor.getRecentEpisodicMemory(stageId, 12);
    const lines = eps.filter(
      (e) =>
        e.kind === EpisodicMemoryKind.EVALUATOR_REJECTION ||
        e.kind === EpisodicMemoryKind.REFLEXION_FEEDBACK,
    );
    if (!lines.length) return "";
    const body = lines
      .map((e) => e.content.trim().slice(0, 2000))
      .join("\n---\n")
      .slice(0, 8000);
    return `\n\n[Memoria episódica — correcciones exigidas por el evaluador; no repitas el mismo error]\n${body}`;
  }

  /**
   * Instrucciones Fase 0 (DBGA) + contexto HITL si hay `complexityPending` (no aplica nivel hasta confirmación).
   */
  private buildComplexityInterviewContext(project: {
    complexityPending?: unknown;
    dbgaContent?: string | null;
  }): string {
    const chunks: string[] = [];
    chunks.push(
      `ENTREVISTA PROACTIVA (Fase 0 / Benchmark / DBGA):
- Si el alcance **no es evidente** en el DBGA o en los mensajes, formula **1 o 2 preguntas clave** para clarificar la escala (ej.: ¿corrección rápida, integración de un módulo, o sistema central desde cero?).
- No asumas complejidad sin señales claras; prioriza preguntas breves y concretas.`,
    );
    const raw = project.complexityPending;
    if (raw != null && typeof raw === "object" && "level" in raw) {
      const p = raw as { level?: string; planSummary?: string; reason?: string };
      chunks.push(
        `HITL — PROPUESTA DE COMPLEJIDAD PENDIENTE (el nivel **no** queda aplicado al proyecto hasta confirmación explícita, p. ej. "sí", "de acuerdo", "ejecuta este plan"):
- Nivel propuesto: **${p.level ?? "?"}**
- Plan sugerido: ${p.planSummary ?? ""}
- Motivo: ${p.reason ?? ""}
**Instrucción:** Propón en el chat esta clasificación y el plan (ej.: "Basado en tu requerimiento, clasifico esto como Baja Complejidad (LOW). Para ser ágiles, propongo generar únicamente Historias de Usuario y Tasks. ¿Estás de acuerdo o prefieres un diseño estructurado?"). **No** digas que el nivel ya está fijado ni que se ejecutará generación hasta que el usuario confirme explícitamente.`,
      );
    }
    return chunks.join("\n\n");
  }

  private async maybeEvaluatorCritique(
    projectId: string,
    route: SupervisorRouteResult,
    userMessage: string,
  ): Promise<string | undefined> {
    if (process.env.AGENT_EVALUATOR_LEGACY !== "true") return undefined;
    if (route.flow !== "LEGACY" || !route.theforgeProjectId) return undefined;
    const r = await this.agentEvaluator.evaluateLegacyProposal(projectId, route.stageId, userMessage);
    return r.approved ? undefined : r.critique;
  }

  /**
   * Envía un mensaje en la entrevista: obtiene o crea sesión, llama a la IA, persiste y devuelve sesión + proyecto actualizado.
   * Si mddContent viene en la petición (ediciones del usuario), la IA lo recibe como contexto actual del documento.
   */
  async chat(
    projectId: string,
    message: string,
    sessionId?: string,
    mddContentFromClient?: string,
    activeTab?: string,
    uxUiGuideContentFromClient?: string,
    dbgaContentFromClient?: string,
    brdContentFromClient?: string,
    stageIdFromClient?: string,
    userImages: ChatImagePart[] = [],
  ) {
    let project = await this.projects.findOne(projectId);
    const hitlLine = message.trim() || (userImages.length ? "(Imagen adjunta)" : "");
    const hitl = await this.projects.tryConfirmComplexityFromChatMessage(projectId, hitlLine);
    if (hitl.confirmed || hitl.rejected) {
      project = await this.projects.findOne(projectId);
    }

    const route = await this.agentSupervisor.resolveRouteFromProject(project, stageIdFromClient);

    let session;
    if (sessionId) {
      session = await this.sessions.findOne(sessionId);
      if (session.projectId !== projectId) throw new NotFoundException("Session does not belong to project");
    } else {
      const sessions = await this.sessions.findByProject(projectId);
      if (sessions.length > 0) {
        session = await this.sessions.findOne(sessions[0].id);
      } else {
        session = await this.sessions.create({
          projectId,
          contextStep: "CONTEXT",
          chatLog: [],
        });
      }
    }

    const currentMdd =
      mddContentFromClient ?? mddForRouteStage(project, route.stageId) ?? undefined;
    const isBenchmarkTab = activeTab?.trim() === "benchmark";
    const hasComplexityPending =
      project.complexityPending != null && typeof project.complexityPending === "object";
    const complexityInterviewContext =
      isBenchmarkTab || hasComplexityPending
        ? this.buildComplexityInterviewContext(project)
        : undefined;
    const currentDbga =
      isBenchmarkTab && (dbgaContentFromClient ?? project.dbgaContent ?? "")?.trim()
        ? (dbgaContentFromClient ?? project.dbgaContent ?? "").trim()
        : !(currentMdd?.trim()) && (project.dbgaContent?.trim())
          ? project.dbgaContent
          : undefined;
    const currentUxUiGuide =
      uxUiGuideContentFromClient ?? project.uxUiGuideContent ?? undefined;
    const currentBrd =
      stageBrdContent(project, route.stageId) ?? brdContentFromClient ?? undefined;
    if (mddContentFromClient != null && mddContentFromClient.trim().length > 0) {
      await this.projects.update(projectId, { mddContent: mddContentFromClient, stageId: route.stageId });
    }
    if (uxUiGuideContentFromClient != null && uxUiGuideContentFromClient.trim().length > 0) {
      await this.projects.update(projectId, { uxUiGuideContent: uxUiGuideContentFromClient });
    }
    if (brdContentFromClient != null && brdContentFromClient.trim().length > 0) {
      const persistedBrd = stageBrdContent(project, route.stageId);
      // Solo persiste si no hay un valor más reciente en BD
      if (!persistedBrd || persistedBrd !== brdContentFromClient) {
        await this.projects.patchStage(projectId, route.stageId, { brdContent: brdContentFromClient });
      }
    }
    const isUxUiGuide = activeTab?.trim() === "ux-ui-guide";
    let systemPrompt: string | undefined;
    if (route.flow === "LEGACY" && route.theforgeProjectId) {
      const theforgeProjectId = route.theforgeProjectId;
      systemPrompt = LEGACY_DOCUMENTATION_PROMPT;
      systemPrompt += await this.episodicPromptSuffix(route.stageId);
      const theforgeQuery =
        message.trim() ||
        (userImages.length
          ? "El usuario adjuntó imágenes en el chat; resume el contexto útil para documentación."
          : "");
      const theforgeContext = await this.theforge.askCodebase(theforgeQuery, theforgeProjectId);
      if (theforgeContext.trim()) {
        systemPrompt += "\n\n[Contexto TheForge (respuesta a la pregunta del usuario)]\n---\n" + theforgeContext.trim() + "\n---";
      }
    }
    let updatedSession;
    let mddFromResponse: string | null | undefined;
    let uxUiGuideFromResponse: string | null | undefined;
    let dbgaFromResponse: string | null | undefined;
    let phase0FromResponse: string | null | undefined;
    let brdFromResponse: string | null | undefined;
    try {
      const chatResult = await this.sessions.chat(session.id, message, {
        currentMddContent: currentMdd,
        currentDbgaContent: currentDbga,
        currentUxUiGuideContent: currentUxUiGuide,
        currentPhase0SummaryContent: activeTab?.trim() === "phase0"
          ? (dbgaContentFromClient ?? project.phase0SummaryContent ?? "").trim() || undefined
          : undefined,
        currentBlueprintContent: (isUxUiGuide || activeTab?.trim() === "api-contracts") ? (project.blueprintContent ?? undefined) : undefined,
      currentBrdContent: activeTab?.trim() === "brd" ? currentBrd : undefined,
      activeTab,
        systemPrompt,
        stageId: route.stageId,
        complexityInterviewContext,
        userImages,
        ...uxGuideLlmOptions(project),
      });
      updatedSession = chatResult.session;
      mddFromResponse = chatResult.mddContent;
      uxUiGuideFromResponse = chatResult.uxUiGuideContent;
      dbgaFromResponse = chatResult.dbgaContent;
      phase0FromResponse = chatResult.phase0SummaryContent;
      brdFromResponse = chatResult.brdContent;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al generar la respuesta";
      throw new HttpException(
        msg,
        HttpStatus.INTERNAL_SERVER_ERROR,
        { cause: err instanceof Error ? err : undefined },
      );
    }
    if (!updatedSession) throw new NotFoundException("Session not found after chat");
    let updatedProject: Awaited<ReturnType<IOrchestratorProjectsPort["update"]>> | null = null;
    if (mddFromResponse != null && mddFromResponse.length > 0) {
      updatedProject = await this.projects.update(projectId, { mddContent: mddFromResponse, stageId: route.stageId });
    }
    if (uxUiGuideFromResponse != null && uxUiGuideFromResponse.length > 0) {
      console.log("[Orchestrator] persisting uxUiGuideContent (Guía UX/UI) length:", uxUiGuideFromResponse.length);
      updatedProject = await this.projects.update(projectId, { uxUiGuideContent: uxUiGuideFromResponse });
    }
    if (dbgaFromResponse != null && dbgaFromResponse.length > 0) {
      console.log("[Orchestrator] persisting dbgaContent (Benchmark refinado) length:", dbgaFromResponse.length);
      updatedProject = await this.projects.update(projectId, { dbgaContent: dbgaFromResponse });
    }
    if (mddFromResponse == null && dbgaFromResponse == null) {
      // Phase0 document from chat — persist if it came back
      // (only when no higher-priority document was returned)
    }
    if (phase0FromResponse != null && phase0FromResponse.length > 0) {
      console.log("[Orchestrator] persisting phase0SummaryContent length:", phase0FromResponse.length);
      updatedProject = await this.projects.update(projectId, { phase0SummaryContent: phase0FromResponse });
    }
    if (brdFromResponse != null && brdFromResponse.length > 0) {
      await this.projects.patchStage(projectId, route.stageId, { brdContent: brdFromResponse });
      updatedProject = await this.projects.findOne(projectId);
    }
    if (!updatedProject) {
      updatedProject = await this.projects.findOne(projectId);
    }
    const outUx = updatedProject?.uxUiGuideContent ?? null;
    const uxToReturn = (uxUiGuideFromResponse != null && uxUiGuideFromResponse.length > 0)
      ? uxUiGuideFromResponse
      : outUx;
    console.log("[Orchestrator] returning uxUiGuideContent (Guía UX/UI) length:", uxToReturn?.length ?? 0);

    const finalProject = updatedProject ?? (await this.projects.findOne(projectId)) ?? project;
    if (uxToReturn != null && finalProject && "uxUiGuideContent" in finalProject) {
      (finalProject as { uxUiGuideContent: string | null }).uxUiGuideContent = uxToReturn;
    }

    const shouldIngestMdd =
      (mddFromResponse != null && mddFromResponse.length > 0) ||
      (mddContentFromClient != null && mddContentFromClient.trim().length > 0);
    this.scheduleSddIngest(projectId, shouldIngestMdd);
    const evaluatorCritique = await this.maybeEvaluatorCritique(projectId, route, hitlLine);

    return {
      session: updatedSession,
      project: finalProject,
      uxUiGuideContent: uxToReturn ?? undefined,
      evaluatorCritique,
    };
  }

  /**
   * Paridad con `POST /ai-orchestrator/chat`: mismo flujo (HITL, PATCH MDD/UX/DBGA desde body,
   * supervisor, legacy + TheForge, `uxGuideLlmOptions`, persistencia de respuesta, ingest SDD, evaluador).
   * `projectId` se toma de la sesión.
   */
  async chatBySessionId(
    sessionId: string,
    args: {
      message: string;
      userImages?: ChatImagePart[];
      mddContentFromClient?: string;
      activeTab?: string;
      uxUiGuideContentFromClient?: string;
      dbgaContentFromClient?: string;
      phase0SummaryContentFromClient?: string;
      brdContentFromClient?: string;
      stageIdFromClient?: string;
    },
  ) {
    const session = await this.sessions.findOne(sessionId);
    return this.chat(
      session.projectId,
      args.message,
      sessionId,
      args.mddContentFromClient,
      args.activeTab,
      args.uxUiGuideContentFromClient,
      args.dbgaContentFromClient,
      args.brdContentFromClient,
      args.stageIdFromClient,
      args.userImages ?? [],
    );
  }

  /**
   * Streaming chat: same setup as chat(), yields SSE events (chunk then done).
   */
  async *chatStream(
    projectId: string,
    message: string,
    sessionId?: string,
    mddContentFromClient?: string,
    activeTab?: string,
    uxUiGuideContentFromClient?: string,
    dbgaContentFromClient?: string,
    specContentFromClient?: string,
    brdContentFromClient?: string,
    stageIdFromClient?: string,
    userImages: ChatImagePart[] = [],
  ): AsyncGenerator<{ event: string; data: unknown }> {
    let project = await this.projects.findOne(projectId);
    const hitlLineStream = message.trim() || (userImages.length ? "(Imagen adjunta)" : "");
    const hitl = await this.projects.tryConfirmComplexityFromChatMessage(projectId, hitlLineStream);
    if (hitl.confirmed || hitl.rejected) {
      project = await this.projects.findOne(projectId);
    }

    const routeStream = await this.agentSupervisor.resolveRouteFromProject(project, stageIdFromClient);

    let session;
    if (sessionId) {
      session = await this.sessions.findOne(sessionId);
      if (session.projectId !== projectId) throw new NotFoundException("Session does not belong to project");
    } else {
      const sessions = await this.sessions.findByProject(projectId);
      if (sessions.length > 0) {
        session = await this.sessions.findOne(sessions[0].id);
      } else {
        session = await this.sessions.create({
          projectId,
          contextStep: "CONTEXT",
          chatLog: [],
        });
      }
    }

    const currentMdd = mddContentFromClient ?? mddForRouteStage(project, routeStream.stageId) ?? undefined;
    const isBenchmarkTab = activeTab?.trim() === "benchmark";
    const hasComplexityPendingStream =
      project.complexityPending != null && typeof project.complexityPending === "object";
    const complexityInterviewContext =
      isBenchmarkTab || hasComplexityPendingStream
        ? this.buildComplexityInterviewContext(project)
        : undefined;
    const currentDbga =
      isBenchmarkTab && (dbgaContentFromClient ?? project.dbgaContent ?? "")?.trim()
        ? (dbgaContentFromClient ?? project.dbgaContent ?? "").trim()
        : !(currentMdd?.trim()) && (project.dbgaContent?.trim())
          ? project.dbgaContent
          : undefined;
    const currentUxUiGuide = uxUiGuideContentFromClient ?? project.uxUiGuideContent ?? undefined;
    const currentSpec = specContentFromClient ?? (project as { specContent?: string | null }).specContent ?? undefined;
    const currentBrdStream =
      stageBrdContent(project, routeStream.stageId) ?? brdContentFromClient ?? undefined;
    const currentArchitecture = (project as any).architectureContent ?? undefined;
    const currentUseCases = (project as any).useCasesContent ?? undefined;
    const currentUserStories = (project as any).userStoriesContent ?? undefined;
    const currentApiContracts = (project as any).apiContractsContent ?? undefined;
    const currentLogicFlows = (project as any).logicFlowsContent ?? undefined;
    const currentTasks = (project as any).tasksContent ?? undefined;
    const currentInfra = (project as any).infraContent ?? undefined;
    if (mddContentFromClient != null && mddContentFromClient.trim().length > 0) {
      await this.projects.update(projectId, { mddContent: mddContentFromClient, stageId: routeStream.stageId });
    }
    if (uxUiGuideContentFromClient != null && uxUiGuideContentFromClient.trim().length > 0) {
      await this.projects.update(projectId, { uxUiGuideContent: uxUiGuideContentFromClient });
    }
    if (brdContentFromClient != null && brdContentFromClient.trim().length > 0) {
      const persistedBrdStream = stageBrdContent(project, routeStream.stageId);
      if (!persistedBrdStream || persistedBrdStream !== brdContentFromClient) {
        await this.projects.patchStage(projectId, routeStream.stageId, { brdContent: brdContentFromClient });
      }
    }
    const isUxUiGuide = activeTab?.trim() === "ux-ui-guide";
    let systemPromptStream: string | undefined;
    if (routeStream.flow === "LEGACY" && routeStream.theforgeProjectId) {
      const theforgeProjectId = routeStream.theforgeProjectId;
      systemPromptStream = LEGACY_DOCUMENTATION_PROMPT;
      systemPromptStream += await this.episodicPromptSuffix(routeStream.stageId);
      const theforgeQueryStream =
        message.trim() ||
        (userImages.length
          ? "El usuario adjuntó imágenes en el chat; resume el contexto útil para documentación."
          : "");
      const theforgeContext = await this.theforge.askCodebase(theforgeQueryStream, theforgeProjectId);
      if (theforgeContext.trim()) {
        systemPromptStream += "\n\n[Contexto TheForge (respuesta a la pregunta del usuario)]\n---\n" + theforgeContext.trim() + "\n---";
      }
    }

    const stream = this.sessions.chatStream(session.id, message, {
      currentMddContent: currentMdd,
      currentDbgaContent: currentDbga,
      currentUxUiGuideContent: currentUxUiGuide,
      currentPhase0SummaryContent: activeTab?.trim() === "phase0"
        ? (specContentFromClient ?? (project as any).phase0SummaryContent ?? "").trim() || undefined
        : undefined,
      currentBlueprintContent: (isUxUiGuide || activeTab?.trim() === "api-contracts") ? (project.blueprintContent ?? undefined) : undefined,
      currentSpecContent: activeTab?.trim() === "spec" ? currentSpec : undefined,
      currentBrdContent: activeTab?.trim() === "brd" ? currentBrdStream : undefined,
      currentArchitectureContent: activeTab?.trim() === "architecture" ? currentArchitecture : undefined,
      currentUseCasesContent: activeTab?.trim() === "use-cases" ? currentUseCases : undefined,
      currentUserStoriesContent: activeTab?.trim() === "user-stories" ? currentUserStories : undefined,
      currentApiContractsContent: activeTab?.trim() === "api-contracts" ? currentApiContracts : undefined,
      currentLogicFlowsContent: activeTab?.trim() === "logic-flows" ? currentLogicFlows : undefined,
      currentTasksContent: activeTab?.trim() === "tasks" ? currentTasks : undefined,
      currentInfraContent: activeTab?.trim() === "infra" ? currentInfra : undefined,
      activeTab,
      systemPrompt: systemPromptStream,
      stageId: routeStream.stageId,
      complexityInterviewContext,
      userImages,
      ...uxGuideLlmOptions(project),
    });

    for await (const msg of stream) {
      if (msg.type === "chunk") {
        yield { event: "chunk", data: { content: msg.content } };
      } else {
        let updatedProject: Awaited<ReturnType<IOrchestratorProjectsPort["update"]>> | null = null;
        if (msg.mddContent != null && msg.mddContent.length > 0) {
          updatedProject = await this.projects.update(projectId, {
            mddContent: msg.mddContent,
            stageId: routeStream.stageId,
          });
        }
        if (msg.uxUiGuideContent != null && msg.uxUiGuideContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { uxUiGuideContent: msg.uxUiGuideContent });
        }
        if (msg.dbgaContent != null && msg.dbgaContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { dbgaContent: msg.dbgaContent });
        }
        if (msg.specContent != null && msg.specContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { specContent: msg.specContent });
        }
        if (msg.brdContent != null && msg.brdContent.length > 0) {
          await this.projects.patchStage(projectId, routeStream.stageId, { brdContent: msg.brdContent });
          updatedProject = await this.projects.findOne(projectId);
        }
        if (msg.phase0SummaryContent != null && msg.phase0SummaryContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { phase0SummaryContent: msg.phase0SummaryContent });
        }
        if (msg.blueprintContent != null && msg.blueprintContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { blueprintContent: msg.blueprintContent });
        }
        if (msg.apiContractsContent != null && msg.apiContractsContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { apiContractsContent: msg.apiContractsContent });
        }
        if (msg.logicFlowsContent != null && msg.logicFlowsContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { logicFlowsContent: msg.logicFlowsContent });
        }
        if (msg.tasksContent != null && msg.tasksContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { tasksContent: msg.tasksContent });
        }
        if (msg.infraContent != null && msg.infraContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { infraContent: msg.infraContent });
        }
        if (msg.architectureContent != null && msg.architectureContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { architectureContent: msg.architectureContent } as any);
        }
        if (msg.useCasesContent != null && msg.useCasesContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { useCasesContent: msg.useCasesContent } as any);
        }
        if (msg.userStoriesContent != null && msg.userStoriesContent.length > 0) {
          updatedProject = await this.projects.update(projectId, { userStoriesContent: msg.userStoriesContent } as any);
        }
        const finalProject =
          updatedProject ?? (await this.projects.findOne(projectId)) ?? project;
        const uxToReturn =
          msg.uxUiGuideContent != null && msg.uxUiGuideContent.length > 0
            ? msg.uxUiGuideContent
            : finalProject?.uxUiGuideContent ?? null;
        const projectOut = { ...finalProject } as typeof finalProject & { uxUiGuideContent?: string | null };
        if (uxToReturn != null) projectOut.uxUiGuideContent = uxToReturn;
        const shouldIngestMddStream =
          (msg.mddContent != null && msg.mddContent.length > 0) ||
          (mddContentFromClient != null && mddContentFromClient.trim().length > 0);
        this.scheduleSddIngest(projectId, shouldIngestMddStream);
        const evaluatorCritique = await this.maybeEvaluatorCritique(projectId, routeStream, hitlLineStream);
        yield {
          event: "done",
          data: {
            session: msg.session,
            project: projectOut,
            uxUiGuideContent: uxToReturn ?? undefined,
            evaluatorCritique,
          },
        };
      }
    }
  }

  /**
   * Borra el historial de la conversación de la sesión del proyecto. El MDD no se modifica.
   * Devuelve sesión (con chatLog vacío) y proyecto para que el front actualice y pueda pedir welcome de nuevo.
   */
  async clearChat(projectId: string, sessionId?: string) {
    const project = await this.projects.findOne(projectId);

    let session;
    if (sessionId) {
      session = await this.sessions.findOne(sessionId);
      if (session.projectId !== projectId) throw new NotFoundException("Session does not belong to project");
    } else {
      const sessions = await this.sessions.findByProject(projectId);
      if (sessions.length > 0) {
        session = await this.sessions.findOne(sessions[0].id);
      } else {
        return { session: null, project };
      }
    }

    const updatedSession = await this.sessions.clearChat(session.id);
    return {
      session: updatedSession,
      project,
    };
  }

  /**
   * Genera mensaje de bienvenida (y primera pregunta si no hay contenido, o continuación si ya hay MDD/historial).
   * Obtiene o crea sesión, persiste solo el mensaje del asistente y devuelve sesión + proyecto.
   * `stageId` opcional: alinea el contexto MDD del mensaje con la etapa del Workshop (no solo el MDD aplanado del proyecto).
   */
  async welcome(projectId: string, sessionId?: string, activeTab?: string, stageId?: string) {
    const project = await this.projects.findOne(projectId);
    const route = await this.agentSupervisor.resolveRouteFromProject(project, stageId);
    const stageMdd = mddForRouteStage(project, route.stageId) ?? project.mddContent ?? null;

    let session;
    if (sessionId) {
      session = await this.sessions.findOne(sessionId);
      if (session.projectId !== projectId)
        throw new NotFoundException("Session does not belong to project");
    } else {
      const sessions = await this.sessions.findByProject(projectId);
      if (sessions.length > 0) {
        session = await this.sessions.findOne(sessions[0].id);
      } else {
        session = await this.sessions.create({
          projectId,
          contextStep: "CONTEXT",
          chatLog: [],
        });
      }
    }

    const chatLog = ((session.chatLog ?? []) as ChatMessage[]);
    const messagesForTab = filterChatByTab(chatLog, activeTab ?? "mdd");
    if (messagesForTab.length > 0) {
      return { session, project };
    }
    if ((activeTab ?? "mdd").trim().toLowerCase() === "mdd") {
      return { session, project };
    }

    const stageRow = project.stages?.find((s) => s.id === route.stageId);
    const updatedSession = await this.sessions.generateWelcome(session.id, {
      projectName: project.name,
      mddContent: stageMdd,
      dbgaContent: project.dbgaContent,
      uxUiGuideContent: project.uxUiGuideContent,
      brdContent: stageRow?.brdContent ?? undefined,
      chatLog: messagesForTab,
      activeTab,
      stageId: route.stageId,
    });

    const updatedProject = await this.projects.findOne(projectId);

    return {
      session: updatedSession,
      project: updatedProject ?? project,
    };
  }
}
