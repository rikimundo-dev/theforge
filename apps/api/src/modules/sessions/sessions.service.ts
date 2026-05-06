import { Injectable, NotFoundException } from "@nestjs/common";
import type { Session } from "@theforge/database";
import { getRequestUserId } from "../../common/request-user.store.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { AiService } from "../ai/ai.service.js";
import type { GenerateResponseOptions, ChatMessage as LlmChatMessage } from "../ai/interfaces/llm-provider.interface.js";
import { PreferencesService } from "../ai/preferences.service.js";
import { ChatResponseParserService } from "./chat-response-parser.service.js";
import {
  createSessionSchema,
  appendChatSchema,
  contextStepEnum,
  type AppendChatDto,
  type ChatMessage,
  type ChatImagePart,
} from "@theforge/shared-types";

function filterChatByTab(log: ChatMessage[], tab: string): ChatMessage[] {
  return log.filter((m) => (m.tab ?? "mdd") === tab);
}

function sessionHistoryToLlm(history: ChatMessage[]): LlmChatMessage[] {
  return history.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.role === "user" && m.images != null && m.images.length > 0 ? { images: m.images } : {}),
  }));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Gemini / Vertex suelen devolver 429 con mensaje "Resource exhausted" o status en el error. */
function isGeminiRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err && (err as { status?: number }).status === 429) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /429|Too Many Requests|Resource exhausted/i.test(msg);
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
      currentSpecContent?: string;
      currentBrdContent?: string;
      currentToBeManualContent?: string;
      activeTab?: string;
      /** Override system prompt (ej. modo legacy con TheForge). */
      systemPrompt?: string;
      /** Etapa activa del Workshop: se guarda en cada mensaje user/assistant del par. */
      stageId?: string;
      /** Fase 0 (benchmark): instrucciones de entrevista proactiva + contexto HITL de complejidad */
      complexityInterviewContext?: string;
      /** Guía UX/UI: NEW → bloque Google Stitch para el producto; LEGACY → prohibido. */
      projectTypeForUxGuide?: GenerateResponseOptions["projectTypeForUxGuide"];
      uxGuideAdditionalDocs?: GenerateResponseOptions["uxGuideAdditionalDocs"];
      /** Imágenes del turno actual (solo usuario). */
      userImages?: ChatImagePart[];
    },
  ): Promise<{
    session: Session | null;
    mddContent?: string | null;
    uxUiGuideContent?: string | null;
    dbgaContent?: string | null;
    specContent?: string | null;
    brdContent?: string | null;
    toBeManualContent?: string | null;
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
    const llmHistory = sessionHistoryToLlm(history);
    const promptForModel =
      userMessage.trim() ||
      (options?.userImages?.length
        ? "(El usuario envió solo imágenes; usa el contenido visual en el contexto del documento activo.)"
        : "");
    let response: string;
    try {
      response = await this.ai.generateResponse(promptForModel, llmHistory, {
        currentMddContent: options?.currentMddContent,
        currentDbgaContent: options?.currentDbgaContent,
        currentUxUiGuideContent: options?.currentUxUiGuideContent,
        currentBlueprintContent: options?.currentBlueprintContent,
        currentSpecContent: options?.currentSpecContent,
        currentBrdContent: options?.currentBrdContent,
        currentToBeManualContent: options?.currentToBeManualContent,
        activeTab: options?.activeTab,
        learningHistory: learningHistory || undefined,
        systemPrompt: options?.systemPrompt,
        complexityInterviewContext: options?.complexityInterviewContext,
        projectTypeForUxGuide: options?.projectTypeForUxGuide,
        uxGuideAdditionalDocs: options?.uxGuideAdditionalDocs,
        userMessageImages: options?.userImages,
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
    const brdSplit = this.parser.splitDocAndChat(safeResponse, "BRD");
    const tobeSplit = this.parser.splitDocAndChat(safeResponse, "TOBE");
    const blueSplit = this.parser.splitDocAndChat(safeResponse, "BLUEPRINT");
    const apiSplit = this.parser.splitDocAndChat(safeResponse, "API");
    const flowsSplit = this.parser.splitDocAndChat(safeResponse, "FLOWS");
    const tasksSplit = this.parser.splitDocAndChat(safeResponse, "TASKS");
    const infraSplit = this.parser.splitDocAndChat(safeResponse, "INFRA");

    const hasMdd = mddSplit !== null;
    let hasUx = uxSplit !== null;
    const hasDbga = dbgaSplit !== null;
    const hasSpec = specSplit !== null;
    const hasBrd = brdSplit !== null;
    const hasTobe = tobeSplit !== null;
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
    else if (hasBrd) rawChat = brdSplit!.chatPart;
    else if (hasTobe) rawChat = tobeSplit!.chatPart;
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
    const userContentForLog =
      userMessage.trim() || (options?.userImages?.length ? "(Imagen adjunta)" : userMessage);
    const userMsgBase = {
      role: "user" as const,
      content: userContentForLog,
      tab,
      ...(options?.userImages?.length ? { images: options.userImages } : {}),
    };
    const userMsg = stageId ? { ...userMsgBase, stageId } : userMsgBase;
    const asstMsg = { role: "assistant" as const, content: assistantContent, tab };
    const updated = [...fullLog, userMsg, stageId ? { ...asstMsg, stageId } : asstMsg];

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
      brdContent: hasBrd ? this.parser.cleanDocumentContent(brdSplit!.docPart) : undefined,
      toBeManualContent: hasTobe ? this.parser.cleanDocumentContent(tobeSplit!.docPart) : undefined,
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
      currentBrdContent?: string;
      currentToBeManualContent?: string;
      activeTab?: string;
      systemPrompt?: string;
      stageId?: string;
      complexityInterviewContext?: string;
      projectTypeForUxGuide?: GenerateResponseOptions["projectTypeForUxGuide"];
      uxGuideAdditionalDocs?: GenerateResponseOptions["uxGuideAdditionalDocs"];
      userImages?: ChatImagePart[];
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
      brdContent?: string | null;
      toBeManualContent?: string | null;
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
    const userContentForLog =
      userMessage.trim() || (options?.userImages?.length ? "(Imagen adjunta)" : userMessage);
    const userEntryBase = {
      role: "user" as const,
      content: userContentForLog,
      tab,
      ...(options?.userImages?.length ? { images: options.userImages } : {}),
    };
    const userEntry = stageId ? { ...userEntryBase, stageId } : userEntryBase;

    const learningHistory = await this.preferences.getPreferencesForContext(session.projectId, 5);
    const llmHistory = sessionHistoryToLlm(history);
    const promptForModel =
      userMessage.trim() ||
      (options?.userImages?.length
        ? "(El usuario envió solo imágenes; usa el contenido visual en el contexto del documento activo.)"
        : "");
    let stream: AsyncIterable<string>;
    try {
      stream = await this.ai.generateResponseStream(promptForModel, llmHistory, {
        currentMddContent: options?.currentMddContent,
        currentDbgaContent: options?.currentDbgaContent,
        currentUxUiGuideContent: options?.currentUxUiGuideContent,
        currentBlueprintContent: options?.currentBlueprintContent,
        currentSpecContent: options?.currentSpecContent,
        currentBrdContent: options?.currentBrdContent,
        currentToBeManualContent: options?.currentToBeManualContent,
        activeTab: options?.activeTab,
        learningHistory: learningHistory || undefined,
        systemPrompt: options?.systemPrompt,
        complexityInterviewContext: options?.complexityInterviewContext,
        projectTypeForUxGuide: options?.projectTypeForUxGuide,
        uxGuideAdditionalDocs: options?.uxGuideAdditionalDocs,
        userMessageImages: options?.userImages,
      });
    } catch (err) {
      console.error("[ChatStream] ai.generateResponseStream error:", err);
      throw err;
    }

    const DOC_DELIMITER_RE = /-{2,}\s*FIN_(?:MDD|UX_UI|DBGA|SPEC|BRD|TOBE|BLUEPRINT|API|FLOWS|TASKS|INFRA)\s*-{2,}/i;
    let buffer = "";
    let documentChunksDone = false;
    for await (const chunk of stream) {
      buffer += chunk;
      if (documentChunksDone) {
        // Already past the delimiter — yield normally
        yield { type: "chunk", content: chunk };
      } else if (DOC_DELIMITER_RE.test(buffer)) {
        // Delimiter found — stop buffering document content, yield chat part
        documentChunksDone = true;
        const match = buffer.match(DOC_DELIMITER_RE);
        if (match) {
          const idx = buffer.indexOf(match[0]);
          const afterDelim = buffer.slice(idx + match[0].length);
          if (afterDelim.trim()) {
            yield { type: "chunk", content: afterDelim };
          }
        }
      }
      // Before the delimiter: silent buffer (document content, not chat)
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
    const brdSplit = this.parser.splitDocAndChat(safeResponse, "BRD");
    const tobeSplit = this.parser.splitDocAndChat(safeResponse, "TOBE");
    const blueSplit = this.parser.splitDocAndChat(safeResponse, "BLUEPRINT");
    const apiSplit = this.parser.splitDocAndChat(safeResponse, "API");
    const flowsSplit = this.parser.splitDocAndChat(safeResponse, "FLOWS");
    const tasksSplit = this.parser.splitDocAndChat(safeResponse, "TASKS");
    const infraSplit = this.parser.splitDocAndChat(safeResponse, "INFRA");

    const hasMdd = mddSplit !== null;
    let hasUx = uxSplit !== null;
    const hasDbga = dbgaSplit !== null;
    const hasSpec = specSplit !== null;
    const hasBrd = brdSplit !== null;
    const hasTobe = tobeSplit !== null;
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
    else if (hasBrd) rawChat = brdSplit!.chatPart;
    else if (hasTobe) rawChat = tobeSplit!.chatPart;
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
      brdContent: hasBrd ? this.parser.cleanDocumentContent(brdSplit!.docPart) : undefined,
      toBeManualContent: hasTobe ? this.parser.cleanDocumentContent(tobeSplit!.docPart) : undefined,
      blueprintContent: hasBlue ? this.parser.cleanDocumentContent(blueSplit!.docPart) : undefined,
      apiContractsContent: hasApi ? this.parser.cleanDocumentContent(apiSplit!.docPart) : undefined,
      logicFlowsContent: hasFlows ? this.parser.cleanDocumentContent(flowsSplit!.docPart) : undefined,
      tasksContent: hasTasks ? this.parser.cleanDocumentContent(tasksSplit!.docPart) : undefined,
      infraContent: hasInfra ? this.parser.cleanDocumentContent(infraSplit!.docPart) : undefined,
    };
  }

  /** Reintentos con backoff ante 429 (welcome disparado al cambiar de tab puede encadenar peticiones). */
  private async invokeWelcomeLlmWithRetries(
    syntheticPrompt: string,
    activeTab?: string,
  ): Promise<string> {
    const opts: GenerateResponseOptions = {
      activeTab: activeTab?.trim() || undefined,
      welcomeBrief: true,
    };
    const maxAttempts = 4;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.ai.generateResponse(syntheticPrompt, [], opts);
      } catch (e) {
        lastErr = e;
        if (!isGeminiRateLimitError(e) || attempt === maxAttempts - 1) {
          throw e;
        }
        const backoffMs = 700 * 2 ** attempt + Math.floor(Math.random() * 400);
        console.warn(
          `[SessionsService.generateWelcome] LLM 429, reintento ${attempt + 2}/${maxAttempts} en ${backoffMs}ms`,
        );
        await sleepMs(backoffMs);
      }
    }
    throw lastErr;
  }

  private static fallbackWelcomeAfterRateLimit(activeTabNorm: string, projectName?: string): string {
    const name = projectName?.trim();
    const p = name ? ` **${name}**` : "";
    const tail =
      "\n\n_El proveedor de IA devolvió límite temporal de uso; se reintentó varias veces._ Escribe aquí cuando quieras y seguimos, o edita en el panel y usa **Guardar**.";
    if (activeTabNorm === "brd") {
      return `Hola${p}. En esta pestaña trabajamos el **BRD de la etapa**: problema, objetivos, alcance, riesgos (markdown en el panel + **Guardar** / **Aprobar BRD**).${tail}`;
    }
    if (activeTabNorm === "to-be") {
      return `Hola${p}. En **Manual To-Be** describes cómo debe **comportarse** el producto o el cambio (flujos, reglas, pantallas). El panel tiene **Guardar** / **Aprobar To-Be**; aquí refinamos por chat.${tail}`;
    }
    if (activeTabNorm === "ux-ui-guide") {
      return `Hola${p}. Trabajaremos la **Guía UX/UI** (estilo, tokens, accesibilidad, etc.).${tail}`;
    }
    if (activeTabNorm === "benchmark") {
      return `Hola${p}. En **Paso 0** refinamos el benchmark y las brechas.${tail}`;
    }
    return `Hola${p}. Continuamos cuando quieras con el documento activo.${tail}`;
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
      /** BRD de la etapa (tab brd). */
      brdContent?: string | null;
      /** Manual To-Be de la etapa (tab to-be). */
      toBeManualContent?: string | null;
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
    const brdStageContent = (context.brdContent ?? "").trim();
    const toBeStageContent = (context.toBeManualContent ?? "").trim();
    const activeTab = (context.activeTab ?? "mdd").trim().toLowerCase();
    const isBenchmarkTab = activeTab === "benchmark";
    const isUxUiGuideTab = activeTab === "ux-ui-guide";
    const isBrdTab = activeTab === "brd";
    const isToBeTab = activeTab === "to-be";

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
    } else if (isBrdTab) {
      syntheticPrompt =
        chatLogForTab.length > 0
          ? `El usuario está en el tab **BRD** (etapa del Workshop). Ya hay conversación en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Historial de chat de este tab (últimos mensajes):
${chatLogForTab.slice(-10).map((m) => `[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`).join("\n")}

Retoma el hilo: saluda brevemente y propón la siguiente pregunta o mejora al BRD. Si actualizas el documento, termina el bloque markdown con \`---FIN_BRD---\` y un mensaje breve después. Responde en un solo mensaje.`
          : brdStageContent.length > 0
            ? `El usuario está en el tab **BRD**. Hay un borrador guardado pero aún no hay mensajes en el chat de este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

BRD actual (fragmento):
---
${brdStageContent.slice(0, 3500)}${brdStageContent.length > 3500 ? "\n…" : ""}
---

Saluda y pregunta si quiere refinar alcance, KPIs o riesgos. Responde en un solo mensaje.`
            : dbgaContent.length > 0
              ? `El usuario está en el tab **BRD**. No hay BRD aún ni historial en este tab; sí hay **Domain Benchmark & Gap Analysis** como insumo.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Benchmark (fragmento):
---
${dbgaContent.slice(0, 3500)}${dbgaContent.length > 3500 ? "\n…" : ""}
---

Saluda y propón construir el BRD a partir del benchmark (objetivos, alcance, exclusiones). Si entregas un borrador, termina con \`---FIN_BRD---\`. Responde en un solo mensaje.`
              : `El usuario está en el tab **BRD**. No hay BRD ni benchmark en contexto todavía.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Saluda y lanza 1–2 preguntas clave para iniciar el BRD (problema de negocio, usuarios, éxito medible). Responde en un solo mensaje.`;
    } else if (isToBeTab) {
      syntheticPrompt =
        chatLogForTab.length > 0
          ? `El usuario está en el tab **Manual To-Be** (etapa). Ya hay conversación en este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Historial de chat de este tab (últimos mensajes):
${chatLogForTab.slice(-10).map((m) => `[${m.role}]: ${m.content.slice(0, 200)}${m.content.length > 200 ? "…" : ""}`).join("\n")}

Retoma el hilo: saluda brevemente y propón la siguiente pregunta o mejora al To-Be. Si actualizas el documento, termina el markdown con \`---FIN_TOBE---\` y un mensaje breve después. Responde en un solo mensaje.`
          : toBeStageContent.length > 0
            ? `El usuario está en el tab **Manual To-Be**. Hay borrador guardado pero no hay mensajes en el chat de este tab.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Manual To-Be actual (fragmento):
---
${toBeStageContent.slice(0, 3500)}${toBeStageContent.length > 3500 ? "\n…" : ""}
---

Saluda y pregunta si quiere detallar flujos, reglas o casos borde. Responde en un solo mensaje.`
            : brdStageContent.length > 0 || dbgaContent.length > 0
              ? `El usuario está en el tab **Manual To-Be**. Aún no hay To-Be; usa el BRD de la etapa y/o el benchmark como contexto.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}
${brdStageContent.length > 0 ? `\nBRD (fragmento):\n---\n${brdStageContent.slice(0, 2500)}${brdStageContent.length > 2500 ? "\n…" : ""}\n---\n` : ""}${dbgaContent.length > 0 ? `\nBenchmark (fragmento):\n---\n${dbgaContent.slice(0, 2500)}${dbgaContent.length > 2500 ? "\n…" : ""}\n---\n` : ""}
Saluda y propón redactar el Manual To-Be alineado a ese contexto. Si entregas borrador, termina con \`---FIN_TOBE---\`. Responde en un solo mensaje.`
              : `El usuario está en el tab **Manual To-Be**. No hay To-Be ni BRD/benchmark en contexto.
Proyecto: ${context.projectName ?? "Sin nombre"}${activeTabHint}

Saluda y pregunta qué comportamiento deseado o reglas de negocio deben quedar documentados primero. Responde en un solo mensaje.`;
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

    /** Guía meta para que el primer mensaje (welcome) no sea genérico ante “¿cómo se llena?” u omisión del usuario. */
    const brdWelcomeExtras = `
[Instrucciones adicionales para tu respuesta única:]
- Incluye una **mini-guía** (3–5 frases): qué es el BRD de etapa en The Forge, bloques típicos en markdown (problema, objetivos/KPIs, alcance, actores, riesgos), que el **panel** es editable con **Guardar** / **Aprobar BRD**, y que **aquí** refináis por chat.
- Si el usuario pregunta explícitamente cómo rellenarlo, sé **concreto**; no pidas “área o proceso genérico” si ya hay **Benchmark** o **BRD** en el contexto de este prompt: **ancla** en ese texto.
- Solo si entregas un **borrador BRD completo** nuevo desde el chat, termina el markdown con la línea exacta \`---FIN_BRD---\`. Si solo orientas o conversas, **sin** delimitador.`;

    const toBeWelcomeExtras = `
[Instrucciones adicionales para tu respuesta única:]
- Incluye una **mini-guía** (3–5 frases): el **Manual To-Be** describe el comportamiento y reglas **deseadas** (flujos, if/then, pantallas, estados vacío/carga/error); el **BRD** fija problema y alcance de negocio; el **MDD** es el diseño técnico. El usuario edita en el **panel** (**Guardar** / **Aprobar To-Be**) y aquí itera contigo.
- Si pregunta cómo rellenarlo, sé **concreto**; si hay **BRD** o **Benchmark** arriba, úsalos para proponer **un primer flujo o sección** a documentar, no preguntas genéricas desconectadas.
- Solo si entregas un **borrador To-Be completo** nuevo desde el chat, termina el markdown con \`---FIN_TOBE---\`. Si solo orientas o conversas, **sin** delimitador.`;

    if (isBrdTab) {
      syntheticPrompt += brdWelcomeExtras;
    } else if (isToBeTab) {
      syntheticPrompt += toBeWelcomeExtras;
    }

    const activeTabForLlm = context.activeTab?.trim() || undefined;
    let response: string;
    try {
      response = await this.invokeWelcomeLlmWithRetries(syntheticPrompt, activeTabForLlm);
    } catch (err) {
      if (isGeminiRateLimitError(err)) {
        const at = (context.activeTab ?? "mdd").trim().toLowerCase();
        console.warn(
          "[SessionsService.generateWelcome] LLM 429 tras reintentos; mensaje estático de bienvenida.",
        );
        response = SessionsService.fallbackWelcomeAfterRateLimit(at, context.projectName);
      } else {
        throw err;
      }
    }
    const mddSplit = this.parser.splitMddAndChat(response);
    const uxSplit = this.parser.splitUxUiGuideAndChat(response);
    const brdWelcomeSplit = this.parser.splitDocAndChat(response, "BRD");
    const tobeWelcomeSplit = this.parser.splitDocAndChat(response, "TOBE");
    const rawChat =
      mddSplit !== null
        ? mddSplit.chatPart
        : uxSplit !== null
          ? uxSplit.chatPart
          : brdWelcomeSplit !== null
            ? brdWelcomeSplit.chatPart
            : tobeWelcomeSplit !== null
              ? tobeWelcomeSplit.chatPart
              : response;
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
