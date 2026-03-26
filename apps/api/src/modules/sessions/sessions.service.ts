import { Injectable, NotFoundException } from "@nestjs/common";
import type { Session } from "@theforge/database";
import { getRequestUserId } from "../../common/request-user.store.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AiService } from "../ai/ai.service.js";
import { PreferencesService } from "../ai/preferences.service.js";
import { ChatResponseParserService } from "./chat-response-parser.service.js";
import {
  createSessionSchema,
  appendChatSchema,
  contextStepEnum,
  type AppendChatDto,
  type ChatMessage,
} from "@theforge/shared-types";

function filterChatByTab(log: ChatMessage[], tab: string): ChatMessage[] {
  return log.filter((m) => (m.tab ?? "mdd") === tab);
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly preferences: PreferencesService,
    private readonly parser: ChatResponseParserService,
  ) { }

  private sessionScope(sessionId: string) {
    return { id: sessionId, userId: getRequestUserId() };
  }

  async create(data: { projectId: string; contextStep?: string; chatLog?: ChatMessage[] }) {
    const parsed = createSessionSchema.parse(data);
    const userId = getRequestUserId();
    const project = await this.prisma.project.findFirst({
      where: { id: parsed.projectId, userId },
    });
    if (!project) throw new NotFoundException("Project not found");
    return this.prisma.session.create({
      data: {
        userId,
        projectId: parsed.projectId,
        contextStep: parsed.contextStep,
        chatLog: (parsed.chatLog ?? []) as object,
      },
    });
  }

  async findByProject(projectId: string) {
    return this.prisma.session.findMany({
      where: { projectId, userId: getRequestUserId() },
      orderBy: { updatedAt: "desc" },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.session.findFirst({
      where: this.sessionScope(id),
      include: { project: true },
    });
    if (!session) throw new NotFoundException("Session not found");
    return session;
  }

  async clearChat(sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    if (!session) throw new NotFoundException("Session not found");
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { chatLog: [] as object },
    });
    return this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
  }

  async appendMessage(sessionId: string, data: AppendChatDto) {
    const parsed = appendChatSchema.parse(data);
    const session = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    if (!session) throw new NotFoundException("Session not found");

    const chatLog = session.chatLog as ChatMessage[];
    const updated = [...chatLog, parsed];

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { chatLog: updated as object },
    });

    return this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
  }

  async chat(
    sessionId: string,
    userMessage: string,
    options?: {
      currentMddContent?: string;
      currentDbgaContent?: string;
      currentUxUiGuideContent?: string;
      currentBlueprintContent?: string;
      activeTab?: string;
      /** Override system prompt (ej. modo legacy con TheForge). */
      systemPrompt?: string;
      /** Etapa activa del Workshop: se guarda en cada mensaje user/assistant del par. */
      stageId?: string;
      /** Fase 0 (benchmark): instrucciones de entrevista proactiva + contexto HITL de complejidad */
      complexityInterviewContext?: string;
    },
  ): Promise<{
    session: Session | null;
    mddContent?: string | null;
    uxUiGuideContent?: string | null;
    dbgaContent?: string | null;
    specContent?: string | null;
    blueprintContent?: string | null;
    apiContractsContent?: string | null;
    logicFlowsContent?: string | null;
    tasksContent?: string | null;
    infraContent?: string | null;
  }> {
    const session = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    if (!session) throw new NotFoundException("Session not found");

    const fullLog = (session.chatLog as ChatMessage[]) ?? [];
    const history = filterChatByTab(fullLog, options?.activeTab ?? "mdd");
    const activeTab = options?.activeTab ?? "mdd";
    const ts = () => new Date().toISOString();
    console.log(`[Chat] ${ts()} → Enviando mensaje al LLM:`, {
      activeTab,
      userMessagePreview: userMessage.slice(0, 200) + (userMessage.length > 200 ? "…" : ""),
      historyLength: history.length,
    });
    const learningHistory = await this.preferences.getPreferencesForContext(session.projectId, 5);
    let response: string;
    try {
      response = await this.ai.generateResponse(userMessage, history, {
        currentMddContent: options?.currentMddContent,
        currentDbgaContent: options?.currentDbgaContent,
        currentUxUiGuideContent: options?.currentUxUiGuideContent,
        currentBlueprintContent: options?.currentBlueprintContent,
        activeTab: options?.activeTab,
        learningHistory: learningHistory || undefined,
        systemPrompt: options?.systemPrompt,
        complexityInterviewContext: options?.complexityInterviewContext,
      });
    } catch (err) {
      console.error("[Chat] ai.generateResponse error:", err);
      throw err;
    }
    const safeResponse = typeof response === "string" ? response : "";
    console.log(`[Chat] ${ts()} ← Respuesta del LLM recibida:`, {
      length: safeResponse.length,
      preview: safeResponse.slice(0, 300) + (safeResponse.length > 300 ? "…" : ""),
      isEmpty: !safeResponse.trim(),
    });
    if (!safeResponse.trim()) {
      throw new Error(
        "La IA no generó texto (respuesta vacía o bloqueada). Intenta de nuevo o reformula el mensaje.",
      );
    }
    const mddSplit = this.parser.splitMddAndChat(safeResponse);
    const uxSplit = this.parser.splitUxUiGuideAndChat(safeResponse);
    const dbgaSplit = this.parser.splitDbgaAndChat(safeResponse);
    const specSplit = this.parser.splitDocAndChat(safeResponse, "SPEC");
    const blueSplit = this.parser.splitDocAndChat(safeResponse, "BLUEPRINT");
    const apiSplit = this.parser.splitDocAndChat(safeResponse, "API");
    const flowsSplit = this.parser.splitDocAndChat(safeResponse, "FLOWS");
    const tasksSplit = this.parser.splitDocAndChat(safeResponse, "TASKS");
    const infraSplit = this.parser.splitDocAndChat(safeResponse, "INFRA");

    const hasMdd = mddSplit !== null;
    let hasUx = uxSplit !== null;
    const hasDbga = dbgaSplit !== null;
    const hasSpec = specSplit !== null;
    const hasBlue = blueSplit !== null;
    const hasApi = apiSplit !== null;
    const hasFlows = flowsSplit !== null;
    const hasTasks = tasksSplit !== null;
    const hasInfra = infraSplit !== null;

    let uxDocPart: string | undefined = hasUx ? uxSplit!.docPart : undefined;
    const dbgaDocPart: string | undefined = hasDbga ? dbgaSplit!.docPart : undefined;

    let rawChat = safeResponse;
    if (hasMdd) rawChat = mddSplit!.chatPart;
    else if (hasUx) rawChat = uxSplit!.chatPart;
    else if (hasDbga) rawChat = dbgaSplit!.chatPart;
    else if (hasSpec) rawChat = specSplit!.chatPart;
    else if (hasBlue) rawChat = blueSplit!.chatPart;
    else if (hasApi) rawChat = apiSplit!.chatPart;
    else if (hasFlows) rawChat = flowsSplit!.chatPart;
    else if (hasTasks) rawChat = tasksSplit!.chatPart;
    else if (hasInfra) rawChat = infraSplit!.chatPart;

    // Fallback: tab ux-ui-guide sin delimitador ---FIN_UX_UI--- pero respuesta con "# Guía UX/UI" → documento + opcional separador (---) + texto para chat
    const isUxTab = (options?.activeTab ?? "mdd").trim() === "ux-ui-guide";
    const looksLikeUxGuide =
      safeResponse.length > 200 &&
      (/#\s*Guía\s*UX\/UI/i.test(safeResponse) || /^#?\s*Guía\s*UX\/UI/im.test(safeResponse));
    if (isUxTab && !hasUx && looksLikeUxGuide) {
      hasUx = true;
      const trimmed = safeResponse.trim();
      const docStartMatch = trimmed.match(/#\s*Guía\s*UX\/UI/i);
      const docStartIdx = docStartMatch?.index ?? 0;
      const hasIntro = docStartIdx > 0 && trimmed.slice(0, docStartIdx).trim().length > 0;
      let docSection = docStartIdx > 0 ? trimmed.slice(docStartIdx) : trimmed;
      const chatParts: string[] = [];
      if (hasIntro) chatParts.push(trimmed.slice(0, docStartIdx).trim());
      const hrMatch = docSection.match(/\n\s*[-*_]{3,}\s*\n/);
      if (hrMatch && hrMatch.index != null) {
        uxDocPart = docSection.slice(0, hrMatch.index).trim();
        const afterHr = docSection.slice(hrMatch.index + hrMatch[0].length).trim();
        if (afterHr.length > 0) chatParts.push(afterHr);
      } else {
        uxDocPart = docSection.trim();
      }
      rawChat = chatParts.length > 0 ? chatParts.join("\n\n") : "Guía UX/UI generada. Revisa el panel del documento.";
      console.log("[Chat] fallback: uxUiGuideContent length:", uxDocPart?.length ?? 0, "chat length:", rawChat.length);
    }

    const assistantContent = this.parser.stripChatLabel(rawChat);

    const tab = options?.activeTab ?? "mdd";
    const stageId = options?.stageId?.trim();
    const userMsg = { role: "user" as const, content: userMessage, tab };
    const asstMsg = { role: "assistant" as const, content: assistantContent, tab };
    const updated = [
      ...fullLog,
      stageId ? { ...userMsg, stageId } : userMsg,
      stageId ? { ...asstMsg, stageId } : asstMsg,
    ];

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { chatLog: updated as object },
    });

    console.log(`[Chat] ${ts()} → Cliente recibirá:`, {
      chatPartLength: assistantContent.length,
      mddPartLength: hasMdd ? mddSplit!.mddPart.length : 0,
      uxDocPartLength: uxDocPart?.length ?? 0,
      dbgaDocPartLength: dbgaDocPart?.length ?? 0,
      infraLength: hasInfra ? infraSplit!.docPart.length : 0,
    });

    const updatedSession = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    const cleanedMddPart = hasMdd ? this.parser.cleanDocumentContent(mddSplit!.mddPart) : "";
    const finalMdd = hasMdd ? this.parser.mergeMddSectionOrUseFull(options?.currentMddContent, cleanedMddPart) : undefined;
    return {
      session: updatedSession,
      mddContent: finalMdd && finalMdd.length > 0 ? finalMdd : undefined,
      uxUiGuideContent: uxDocPart ? this.parser.cleanDocumentContent(uxDocPart) : undefined,
      dbgaContent: dbgaDocPart ? this.parser.cleanDocumentContent(dbgaDocPart) : undefined,
      specContent: hasSpec ? this.parser.cleanDocumentContent(specSplit!.docPart) : undefined,
      blueprintContent: hasBlue ? this.parser.cleanDocumentContent(blueSplit!.docPart) : undefined,
      apiContractsContent: hasApi ? this.parser.cleanDocumentContent(apiSplit!.docPart) : undefined,
      logicFlowsContent: hasFlows ? this.parser.cleanDocumentContent(flowsSplit!.docPart) : undefined,
      tasksContent: hasTasks ? this.parser.cleanDocumentContent(tasksSplit!.docPart) : undefined,
      infraContent: hasInfra ? this.parser.cleanDocumentContent(infraSplit!.docPart) : undefined,
    };
  }

  /**
   * Streaming chat: yields chunks, then a final "done" with session and optional doc updates.
   */
  async *chatStream(
    sessionId: string,
    userMessage: string,
    options?: {
      currentMddContent?: string;
      currentDbgaContent?: string;
      currentUxUiGuideContent?: string;
      currentBlueprintContent?: string;
      currentSpecContent?: string;
      activeTab?: string;
      systemPrompt?: string;
      stageId?: string;
      complexityInterviewContext?: string;
    },
  ): AsyncGenerator<
    | { type: "chunk"; content: string }
    | {
      type: "done";
      session: Session | null;
      mddContent?: string | null;
      uxUiGuideContent?: string | null;
      dbgaContent?: string | null;
      specContent?: string | null;
      blueprintContent?: string | null;
      apiContractsContent?: string | null;
      logicFlowsContent?: string | null;
      tasksContent?: string | null;
      infraContent?: string | null;
    }
  > {
    const session = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    if (!session) throw new NotFoundException("Session not found");

    const fullLog = (session.chatLog as ChatMessage[]) ?? [];
    const history = filterChatByTab(fullLog, options?.activeTab ?? "mdd");
    const activeTab = options?.activeTab ?? "mdd";
    const tab = activeTab;
    const stageId = options?.stageId?.trim();
    const userEntry = stageId
      ? { role: "user" as const, content: userMessage, tab, stageId }
      : { role: "user" as const, content: userMessage, tab };

    const learningHistory = await this.preferences.getPreferencesForContext(session.projectId, 5);
    let stream: AsyncIterable<string>;
    try {
      stream = await this.ai.generateResponseStream(userMessage, history, {
        currentMddContent: options?.currentMddContent,
        currentDbgaContent: options?.currentDbgaContent,
        currentUxUiGuideContent: options?.currentUxUiGuideContent,
        currentBlueprintContent: options?.currentBlueprintContent,
        currentSpecContent: options?.currentSpecContent,
        activeTab: options?.activeTab,
        learningHistory: learningHistory || undefined,
        systemPrompt: options?.systemPrompt,
        complexityInterviewContext: options?.complexityInterviewContext,
      });
    } catch (err) {
      console.error("[ChatStream] ai.generateResponseStream error:", err);
      throw err;
    }

    let buffer = "";
    for await (const chunk of stream) {
      buffer += chunk;
      yield { type: "chunk", content: chunk };
    }

    const safeResponse = buffer.trim();
    if (!safeResponse) {
      throw new Error(
        "La IA no generó texto (respuesta vacía o bloqueada). Intenta de nuevo o reformula el mensaje.",
      );
    }

    const mddSplit = this.parser.splitMddAndChat(safeResponse);
    const uxSplit = this.parser.splitUxUiGuideAndChat(safeResponse);
    const dbgaSplit = this.parser.splitDbgaAndChat(safeResponse);
    const specSplit = this.parser.splitDocAndChat(safeResponse, "SPEC");
    const blueSplit = this.parser.splitDocAndChat(safeResponse, "BLUEPRINT");
    const apiSplit = this.parser.splitDocAndChat(safeResponse, "API");
    const flowsSplit = this.parser.splitDocAndChat(safeResponse, "FLOWS");
    const tasksSplit = this.parser.splitDocAndChat(safeResponse, "TASKS");
    const infraSplit = this.parser.splitDocAndChat(safeResponse, "INFRA");

    const hasMdd = mddSplit !== null;
    let hasUx = uxSplit !== null;
    const hasDbga = dbgaSplit !== null;
    const hasSpec = specSplit !== null;
    const hasBlue = blueSplit !== null;
    const hasApi = apiSplit !== null;
    const hasFlows = flowsSplit !== null;
    const hasTasks = tasksSplit !== null;
    const hasInfra = infraSplit !== null;

    let uxDocPart: string | undefined = hasUx ? uxSplit!.docPart : undefined;
    const dbgaDocPart: string | undefined = hasDbga ? dbgaSplit!.docPart : undefined;

    let rawChat = safeResponse;
    if (hasMdd) rawChat = mddSplit!.chatPart;
    else if (hasUx) rawChat = uxSplit!.chatPart;
    else if (hasDbga) rawChat = dbgaSplit!.chatPart;
    else if (hasSpec) rawChat = specSplit!.chatPart;
    else if (hasBlue) rawChat = blueSplit!.chatPart;
    else if (hasApi) rawChat = apiSplit!.chatPart;
    else if (hasFlows) rawChat = flowsSplit!.chatPart;
    else if (hasTasks) rawChat = tasksSplit!.chatPart;
    else if (hasInfra) rawChat = infraSplit!.chatPart;

    const isUxTab = (options?.activeTab ?? "mdd").trim() === "ux-ui-guide";
    const looksLikeUxGuide =
      safeResponse.length > 200 &&
      (/#\s*Guía\s*UX\/UI/i.test(safeResponse) || /^#?\s*Guía\s*UX\/UI/im.test(safeResponse));
    if (isUxTab && !hasUx && looksLikeUxGuide) {
      hasUx = true;
      const trimmed = safeResponse.trim();
      const docStartMatch = trimmed.match(/#\s*Guía\s*UX\/UI/i);
      const docStartIdx = docStartMatch?.index ?? 0;
      let docSection = docStartIdx > 0 ? trimmed.slice(docStartIdx) : trimmed;
      const hrMatch = docSection.match(/\n\s*[-*_]{3,}\s*\n/);
      if (hrMatch && hrMatch.index != null) {
        uxDocPart = docSection.slice(0, hrMatch.index).trim();
        const afterHr = docSection.slice(hrMatch.index + hrMatch[0].length).trim();
        rawChat = afterHr.length > 0 ? afterHr : "Guía UX/UI generada. Revisa el panel del documento.";
      } else {
        uxDocPart = docSection.trim();
      }
    }

    const assistantContent = this.parser.stripChatLabel(rawChat);
    const assistantEntry = stageId
      ? { role: "assistant" as const, content: assistantContent, tab, stageId }
      : { role: "assistant" as const, content: assistantContent, tab };
    const updated = [...fullLog, userEntry, assistantEntry];
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { chatLog: updated as object },
    });

    const updatedSession = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    const cleanedMddPart = hasMdd ? this.parser.cleanDocumentContent(mddSplit!.mddPart) : "";
    const finalMdd = hasMdd ? this.parser.mergeMddSectionOrUseFull(options?.currentMddContent, cleanedMddPart) : undefined;
    yield {
      type: "done",
      session: updatedSession,
      mddContent: finalMdd && finalMdd.length > 0 ? finalMdd : undefined,
      uxUiGuideContent: uxDocPart ? this.parser.cleanDocumentContent(uxDocPart) : undefined,
      dbgaContent: dbgaDocPart ? this.parser.cleanDocumentContent(dbgaDocPart) : undefined,
      specContent: hasSpec ? this.parser.cleanDocumentContent(specSplit!.docPart) : undefined,
      blueprintContent: hasBlue ? this.parser.cleanDocumentContent(blueSplit!.docPart) : undefined,
      apiContractsContent: hasApi ? this.parser.cleanDocumentContent(apiSplit!.docPart) : undefined,
      logicFlowsContent: hasFlows ? this.parser.cleanDocumentContent(flowsSplit!.docPart) : undefined,
      tasksContent: hasTasks ? this.parser.cleanDocumentContent(tasksSplit!.docPart) : undefined,
      infraContent: hasInfra ? this.parser.cleanDocumentContent(infraSplit!.docPart) : undefined,
    };
  }


  /**
   * Genera mensaje de bienvenida (y primera pregunta si no hay contenido, o continuación si ya hay MDD/historial)
   * y lo persiste como primer mensaje del asistente. No añade mensaje de usuario.
   */
  async generateWelcome(
    sessionId: string,
    context: {
      projectName?: string;
      mddContent?: string | null;
      dbgaContent?: string | null;
      uxUiGuideContent?: string | null;
      chatLog?: ChatMessage[];
      activeTab?: string;
      stageId?: string;
    },
  ) {
    const session = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    if (!session) throw new NotFoundException("Session not found");

    const chatLogForTab = (context.chatLog ?? []) as ChatMessage[];
    const mddContent = (context.mddContent ?? "").trim();
    const dbgaContent = (context.dbgaContent ?? "").trim();
    const uxUiGuideContent = (context.uxUiGuideContent ?? "").trim();
    const activeTab = (context.activeTab ?? "mdd").trim().toLowerCase();
    const isBenchmarkTab = activeTab === "benchmark";
    const isUxUiGuideTab = activeTab === "ux-ui-guide";

    const activeTabHint = context.activeTab?.trim()
      ? ` El usuario tiene abierto el tab "${context.activeTab}": adapta tu mensaje EXCLUSIVAMENTE a ese documento (Paso 0 = Benchmark & Gap Analysis; MDD = Master Design Document; etc.).`
      : "";

    let syntheticPrompt: string;

    if (isBenchmarkTab) {
      const hasBenchmarkContent = chatLogForTab.length > 0 || dbgaContent.length > 0;
      // Paso 0 sin contenido: no añadimos burbuja conversacional; el front muestra "Escribe un mensaje para continuar..."
      if (!hasBenchmarkContent) {
        return session;
      }
      syntheticPrompt = chatLogForTab.length > 0
        ? `El usuario está en el tab **Paso 0 (Benchmark & Gap Analysis)**. Ya hay conversación en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Historial de chat de este tab (últimos mensajes):
${chatLogForTab.slice(-10).map((m) => `[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`).join("\n")}

Retoma el hilo del Benchmark & Gap Analysis: saluda brevemente y propón la siguiente pregunta o paso para refinar el benchmark o las brechas. Responde en un solo mensaje. NO hables de MDD, arquitectura ni despliegue a menos que el usuario lo pida en este tab.`
        : `El usuario está en el tab **Paso 0 (Benchmark & Gap Analysis)**. Ya tiene un Benchmark generado pero no hay mensajes en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Benchmark & Gap Analysis del usuario:
---
${dbgaContent.slice(0, 4000)}${dbgaContent.length > 4000 ? "\n…" : ""}
---

Saluda y pregunta si quiere revisar/ajustar el benchmark o pasar a construir el MDD. Responde en un solo mensaje. Enfócate solo en Paso 0 (benchmark y brechas).`;
    } else if (isUxUiGuideTab) {
      const hasUxContent = chatLogForTab.length > 0 || uxUiGuideContent.length > 0;
      syntheticPrompt = hasUxContent
        ? chatLogForTab.length > 0
          ? `El usuario está en el tab **Guía UX/UI**. Ya hay conversación en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Historial de chat de este tab (últimos mensajes):
${chatLogForTab.slice(-10).map((m) => `[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`).join("\n")}

Retoma el hilo de la Guía UX/UI: saluda brevemente y propón la siguiente pregunta (marca, colores, prioridades, accesibilidad, etc.) o genera el documento si ya tienes suficiente información (terminando con ---FIN_UX_UI---). Responde en un solo mensaje.`
          : `El usuario está en el tab **Guía UX/UI**. Ya tiene un documento UX/UI generado pero no hay mensajes en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Guía UX/UI actual (fragmento):
---
${uxUiGuideContent.slice(0, 2000)}${uxUiGuideContent.length > 2000 ? "\n…" : ""}
---

Saluda y pregunta si quiere revisar/ajustar la guía o añadir más criterios. Responde en un solo mensaje.`
        : `El usuario está en el tab **Guía UX/UI**. No hay documento ni historial en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Según tu rol (Guía UX/UI): saluda al usuario y lanza la primera pregunta para construir la Guía UX/UI: ¿tienen equipo UX/UI o la IA/dev elegirán estilos? ¿Marca, colores, tipografía? ¿Prioridades (accesibilidad, móvil primero)? Responde en un solo mensaje.`;
    } else {
      const hasContent = chatLogForTab.length > 0 || mddContent.length > 0;
      syntheticPrompt = hasContent
        ? `El usuario acaba de abrir el Workshop. Ya hay contenido en la sesión (tab: ${activeTab}).
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Historial de chat (últimos mensajes de este tab):
${chatLogForTab.slice(-10).map((m) => `[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`).join("\n")}

MDD actual (fragmento):
${mddContent.slice(0, 1500)}${mddContent.length > 1500 ? "\n…" : ""}

Analiza lo que llevan y continúa la entrevista para este documento: saluda brevemente, retoma el hilo y propón la siguiente pregunta o paso. Responde en un solo mensaje.`
        : dbgaContent.length > 0
          ? `El usuario acaba de abrir el Workshop. No hay documento MDD ni historial de chat en este tab, pero tiene un **Domain Benchmark & Gap Analysis** que debe servir como contexto base para redactar el MDD.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Benchmark & Gap Analysis del usuario (úsalo como referencia de industria, checklist y brechas para guiar la entrevista):
---
${dbgaContent.slice(0, 4000)}${dbgaContent.length > 4000 ? "\n…" : ""}
---

Según tu rol (INICIO DE SESIÓN): saluda al usuario, reconoce que ya tienen un Benchmark y lanza la primera pregunta o instrucción para comenzar a construir el MDD a partir de ese contexto. Responde en un solo mensaje.`
          : `El usuario acaba de abrir el Workshop. No hay documento MDD ni historial de chat.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Según tu rol (INICIO DE SESIÓN en tus instrucciones): saluda al usuario y lanza la primera pregunta o instrucción para comenzar la entrevista y construir el MDD. Responde en un solo mensaje.`;
    }

    const response = await this.ai.generateResponse(syntheticPrompt, []);
    const mddSplit = this.parser.splitMddAndChat(response);
    const uxSplit = this.parser.splitUxUiGuideAndChat(response);
    const rawChat = mddSplit !== null ? mddSplit.chatPart : uxSplit !== null ? uxSplit.chatPart : response;
    const contentToAppend = this.parser.stripChatLabel(rawChat);
    const sid = context.stageId?.trim();
    return this.appendMessage(
      sessionId,
      sid
        ? { role: "assistant", content: contentToAppend, tab: context.activeTab, stageId: sid }
        : { role: "assistant", content: contentToAppend, tab: context.activeTab },
    );
  }

  async updateContextStep(sessionId: string, contextStep: string) {
    const step = contextStepEnum.includes(contextStep as (typeof contextStepEnum)[number])
      ? contextStep
      : "CONTEXT";
    const r = await this.prisma.session.updateMany({
      where: this.sessionScope(sessionId),
      data: { contextStep: step },
    });
    if (r.count === 0) throw new NotFoundException("Session not found");
    const row = await this.prisma.session.findFirst({
      where: this.sessionScope(sessionId),
    });
    if (!row) throw new NotFoundException("Session not found");
    return row;
  }
}
