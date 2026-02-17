import { create } from "zustand";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

const cleanDoc = (text: string | null) => {
  if (!text) return null;
  let c = text.trim();
  const firstHash = c.match(/^#|(?<=\n)#/);
  if (firstHash && firstHash.index !== undefined) {
    c = c.slice(firstHash.index).trim();
  }
  return c.replace(/^\s*```(?:markdown)?\s*/i, "").replace(/\s*```\s*$/i, "") || null;
};

export type Status = "ROJO" | "AMARILLO" | "VERDE";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tab?: string;
}

export interface Estimation {
  id: string;
  projectId: string;
  totalHours: number;
  totalMxn: number;
  teamStructure: Record<string, number>;
}

/** Métricas en vivo del EstimationService (Semáforo + nómina interna y precio mercado). */
export interface LiveMetricsResult {
  precision: number;
  totalMXN: number;
  totalMXNMarket: number;
  totalHours: number;
  roles: { architect: number; back: number; front: number };
  rolesHours: { architect: number; back: number; front: number };
  status: "red" | "yellow" | "green";
}

/** Calificación por sección/agente (0–100) en el evento done del stream MDD. */
export interface PrecisionBreakdown {
  contexto: number;
  modeloDatos: number;
  apiContracts: number;
  frontend: number;
  seguridad: number;
  integracion: number;
  /** Motivo de la calificación por sección (por qué se obtuvo ese %). */
  sectionReasons?: Partial<Record<"contexto" | "modeloDatos" | "apiContracts" | "frontend" | "seguridad" | "integracion", string>>;
}

/** Resultado de conformance (Blueprint/Infra vs MDD). */
export interface ConformanceResult {
  ok: boolean;
  gaps: string[];
}

/** Resultado de conformance API vs MDD. */
export interface ApiConformanceResult {
  ok: boolean;
  missingInApi: string[];
  extraInApi: string[];
}

export interface Project {
  id: string;
  name: string;
  status: Status;
  precisionScore: number;
  hasUxTeam: boolean;
  dbgaContent: string | null;
  specContent: string | null;
  mddContent: string | null;
  phase0SummaryContent: string | null;
  uxUiGuideContent: string | null;
  blueprintContent: string | null;
  tasksContent: string | null;
  apiContractsContent: string | null;
  logicFlowsContent: string | null;
  architectureContent: string | null;
  useCasesContent: string | null;
  userStoriesContent: string | null;
  infraContent: string | null;
  estimation: Estimation | null;
}

export interface Session {
  id: string;
  projectId: string;
  chatLog: ChatMessage[];
  contextStep: string;
  updatedAt: string;
}

interface WorkshopState {
  projectId: string | null;
  project: Project | null;
  session: Session | null;
  /** Contenido del MDD (Constitución del proyecto en SDD; gobierna Blueprint, Contratos, Infra). */
  mddContent: string;
  uxUiGuideContent: string | null;
  dbgaContent: string | null;
  specContent: string | null;
  phase0SummaryContent: string | null;
  blueprintContent: string | null;
  tasksContent: string | null;
  apiContractsContent: string | null;
  logicFlowsContent: string | null;
  architectureContent: string | null;
  useCasesContent: string | null;
  userStoriesContent: string | null;
  infraContent: string | null;
  /** Conformance (SDD Fase 2): Blueprint/API/Flujos/Infra vs MDD */
  conformance: {
    blueprint: ConformanceResult;
    api: ApiConformanceResult;
    logicFlows: ConformanceResult;
    infra: ConformanceResult;
  } | null;
  /** HITL (Fase 4): vista previa antes de persistir */
  pendingDeliverablePreview: { kind: "blueprint" | "api" | "infra" | "architecture" | "use-cases" | "user-stories"; content: string } | null;
  loading: boolean;
  /** Razón del loading para mostrar mensajes específicos (ej. deep research tarda más) */
  loadingReason: "benchmark" | "mdd" | "phase0-deep-research" | null;
  /** Mensaje de usuario en curso (streaming); se muestra hasta recibir "done" */
  streamingUserMessage: string | null;
  /** Contenido del asistente que llega por stream; se concatena hasta "done" */
  streamingContent: string | null;
  /** Tab del mensaje en streaming (para filtrar por tab) */
  streamingTab: string | null;
  /** Progreso de agentes DBGA (Benchmark): qué agente trabaja y qué hace */
  agentProgress: Array<{ agent: string; message: string }>;
  /** Métricas en vivo (Semáforo + estimación) desde GET /ai-analysis/estimation */
  liveMetrics: LiveMetricsResult | null;
  /** ThreadId del flujo Manager (MDD); cuando está definido, el siguiente mensaje en tab MDD va a resume */
  managerThreadId: string | null;
  /** true mientras se ejecuta persistAndReviewMdd (grabar + revisión de consistencia) */
  mddReviewing: boolean;
  synced: boolean;
  error: string | null;
  /** Logs de auditoría del último stream MDD */
  auditTrail: string[] | null;
  /** Desglose de calificación del último stream MDD */
  precisionBreakdown: PrecisionBreakdown | null;
  /** Feedback del auditor (para mostrar en UI fuera del chat) */
  auditorFeedback: string | null;
  /** Plan pendiente de aprobación (HITL 4.4): pasos a ejecutar; el usuario puede Ejecutar o Modificar */
  pendingPlanApproval: {
    plan: Array<{ step_id: string; task_description: string; node: string; goal?: string }>;
    planMessage: string;
  } | null;
  /** true tras generar MDD desde Benchmark (one-shot); mostrar banner de revisión en panel MDD */
  mddJustGeneratedFromBenchmark: boolean;
  /** Decisiones Arquitectónicas (ADRs) asociadas al proyecto */
  adrs: any[] | null;

  setProjectId: (id: string | null) => void;
  setProject: (p: Project | null) => void;
  setSession: (s: Session | null) => void;
  setMddContent: (content: string) => void;
  setUxUiGuideContent: (content: string | null) => void;
  persistUxUiGuideContent: (content: string) => Promise<void>;
  setLoading: (v: boolean) => void;
  setSynced: (v: boolean) => void;
  setError: (e: string | null) => void;

  fetchProject: (projectId: string) => Promise<Project | null>;
  fetchWelcome: (projectId: string, activeTab?: string) => Promise<void>;
  clearChat: (projectId: string, activeTab?: string) => Promise<void>;
  /** options.regenerateSection (1–7): regenerar solo esa sección del MDD (comando / en chat). §1 = solo sintetizador de contexto. */
  sendMessage: (message: string, activeTab?: string, options?: { regenerateSection?: number }) => Promise<void>;
  updateMddContent: (content: string) => void;
  persistMddContent: (content: string, options?: { force?: boolean }) => Promise<void>;
  revertMddContent: () => void;
  persistAndReviewMdd: () => Promise<void>;
  setBlueprintContent: (content: string | null) => void;
  persistBlueprintContent: (content: string) => Promise<void>;
  generateBlueprint: (projectId: string, options?: { preview?: boolean; gapsFeedback?: string }) => Promise<Project | null>;
  setApiContractsContent: (content: string | null) => void;
  persistApiContractsContent: (content: string) => Promise<void>;
  generateApiContracts: (projectId: string, options?: { preview?: boolean; gapsFeedback?: string }) => Promise<Project | null>;
  setLogicFlowsContent: (content: string | null) => void;
  persistLogicFlowsContent: (content: string) => Promise<void>;
  generateLogicFlows: (projectId: string, options?: { gapsFeedback?: string }) => Promise<Project | null>;
  setInfraContent: (content: string | null) => void;
  persistInfraContent: (content: string) => Promise<void>;
  generateInfra: (projectId: string, options?: { preview?: boolean; gapsFeedback?: string }) => Promise<Project | null>;

  setArchitectureContent: (content: string | null) => void;
  persistArchitectureContent: (content: string) => Promise<void>;
  generateArchitecture: (projectId: string, options?: { preview?: boolean }) => Promise<Project | null>;

  setUseCasesContent: (content: string | null) => void;
  persistUseCasesContent: (content: string) => Promise<void>;
  generateUseCases: (projectId: string, options?: { preview?: boolean }) => Promise<Project | null>;

  setUserStoriesContent: (content: string | null) => void;
  persistUserStoriesContent: (content: string) => Promise<void>;
  generateUserStories: (projectId: string, options?: { preview?: boolean }) => Promise<Project | null>;
  setSpecContent: (content: string | null) => void;
  persistSpecContent: (content: string) => Promise<void>;
  generateSpec: (projectId: string) => Promise<Project | null>;
  setTasksContent: (content: string | null) => void;
  persistTasksContent: (content: string) => Promise<void>;
  generateTasks: (projectId: string) => Promise<Project | null>;
  fetchConformance: (projectId: string, options?: { useLlm?: boolean }) => Promise<void>;
  verifyDeliverable: (projectId: string, deliverable: "blueprint" | "api" | "infra" | "architecture" | "use-cases" | "user-stories") => Promise<string>;
  setPendingDeliverablePreview: (v: { kind: "blueprint" | "api" | "infra" | "architecture" | "use-cases" | "user-stories"; content: string } | null) => void;
  confirmDeliverable: () => Promise<void>;
  discardDeliverable: () => void;
  setDbgaContent: (content: string | null) => void;
  persistDbgaContent: (content: string) => Promise<void>;
  clearDbgaContent: (projectId: string) => Promise<void>;
  generateBenchmark: (projectId: string, userIdea: string, urls?: string[]) => Promise<Project | null>;
  generateMddFromBenchmark: (projectId: string) => Promise<Project | null>;
  clearMddJustGeneratedFromBenchmark: () => void;
  setAgentProgress: (progress: Array<{ agent: string; message: string }>) => void;
  setPhase0SummaryContent: (content: string | null) => void;
  persistPhase0SummaryContent: (content: string) => Promise<void>;
  phase0DeepResearch: (
    projectId: string,
    opts: { userIdea?: string; urls?: string[]; includeBenchmark?: boolean },
  ) => Promise<Project | null>;
  clearPhase0SummaryContent: (projectId: string) => Promise<void>;
  fetchEstimation: (projectId: string) => Promise<LiveMetricsResult | null>;
  fetchAdrs: (projectId: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  projectId: null as string | null,
  project: null as Project | null,
  session: null as Session | null,
  mddContent: "",
  uxUiGuideContent: null as string | null,
  dbgaContent: null as string | null,
  specContent: null as string | null,
  phase0SummaryContent: null as string | null,
  blueprintContent: null as string | null,
  tasksContent: null as string | null,
  apiContractsContent: null as string | null,
  logicFlowsContent: null as string | null,
  architectureContent: null as string | null,
  useCasesContent: null as string | null,
  userStoriesContent: null as string | null,
  infraContent: null as string | null,
  conformance: null as {
    blueprint: ConformanceResult;
    api: ApiConformanceResult;
    logicFlows: ConformanceResult;
    infra: ConformanceResult;
  } | null,
  pendingDeliverablePreview: null as { kind: "blueprint" | "api" | "infra" | "architecture" | "use-cases" | "user-stories"; content: string } | null,
  loading: false,
  loadingReason: null as "benchmark" | "phase0-deep-research" | null,
  streamingUserMessage: null as string | null,
  streamingContent: null as string | null,
  streamingTab: null as string | null,
  agentProgress: [] as Array<{ agent: string; message: string }>,
  liveMetrics: null as LiveMetricsResult | null,
  managerThreadId: null as string | null,
  mddReviewing: false,
  synced: true,
  error: null as string | null,
  auditTrail: null as string[] | null,
  precisionBreakdown: null as PrecisionBreakdown | null,
  auditorFeedback: null as string | null,
  pendingPlanApproval: null as {
    plan: Array<{ step_id: string; task_description: string; node: string; goal?: string }>;
    planMessage: string;
  } | null,
  mddJustGeneratedFromBenchmark: false,
  adrs: null as any[] | null,
};

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  ...initialState,

  setProjectId: (id) => set({ projectId: id }),
  setProject: (p) =>
    set({
      project: p,
      mddContent: p?.mddContent ?? "",
      uxUiGuideContent: p?.uxUiGuideContent ?? null,
      dbgaContent: p?.dbgaContent ?? null,
      phase0SummaryContent: p?.phase0SummaryContent ?? null,
      blueprintContent: p?.blueprintContent ?? null,
      apiContractsContent: p?.apiContractsContent ?? null,
      logicFlowsContent: p?.logicFlowsContent ?? null,
      architectureContent: p?.architectureContent ?? null,
      useCasesContent: p?.useCasesContent ?? null,
      userStoriesContent: p?.userStoriesContent ?? null,
      infraContent: p?.infraContent ?? null,
    }),
  setSession: (s) => set({ session: s }),
  setMddContent: (content) => set({ mddContent: content }),
  setLoading: (v) => set({ loading: v }),
  setSynced: (v) => set({ synced: v }),
  setError: (e) => set({ error: e }),

  fetchProject: async (projectId) => {
    try {
      set({ session: null, managerThreadId: null });
      const r = await fetch(`${API_BASE}/projects/${projectId}`);
      if (!r.ok) throw new Error("Proyecto no encontrado");
      const data: Project = await r.json();
      set({
        project: data,
        mddContent: cleanDoc(data.mddContent) ?? "",
        uxUiGuideContent: cleanDoc(data.uxUiGuideContent ?? null),
        dbgaContent: cleanDoc(data.dbgaContent ?? null),
        specContent: cleanDoc(data.specContent ?? null),
        phase0SummaryContent: data.phase0SummaryContent ?? null,
        blueprintContent: cleanDoc(data.blueprintContent ?? null),
        tasksContent: cleanDoc(data.tasksContent ?? null),
        apiContractsContent: cleanDoc(data.apiContractsContent ?? null),
        logicFlowsContent: cleanDoc(data.logicFlowsContent ?? null),
        architectureContent: cleanDoc(data.architectureContent ?? null),
        useCasesContent: cleanDoc(data.useCasesContent ?? null),
        userStoriesContent: cleanDoc(data.userStoriesContent ?? null),
        infraContent: cleanDoc(data.infraContent ?? null),
        error: null,
      });
      const sessionsRes = await fetch(`${API_BASE}/sessions/project/${projectId}`);
      if (sessionsRes.ok) {
        const sessions: Session[] = await sessionsRes.json();
        set({ session: sessions.length > 0 ? sessions[0] : null });
      }
      const threadRes = await fetch(`${API_BASE}/ai-analysis/mdd/thread?projectId=${encodeURIComponent(projectId)}`).catch(() => null);
      if (threadRes?.ok) {
        const threadData = (await threadRes.json()) as { threadId?: string | null };
        if (threadData.threadId) {
          set({ managerThreadId: threadData.threadId });
        }
      }
      get().fetchEstimation(projectId).catch(() => { });
      get().fetchAdrs(projectId).catch(() => { });
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar proyecto";
      set({ error: msg });
      return null;
    }
  },

  fetchWelcome: async (projectId, activeTab) => {
    const { session } = get();
    if (!projectId?.trim()) return;
    set({ loading: true, error: null });
    try {
      const r = await fetch(`${API_BASE}/ai-orchestrator/welcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId: session?.id,
          activeTab: activeTab ?? undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al cargar bienvenida");
      }
      const data: { session: Session; project: Project } = await r.json();
      set({
        session: data.session,
        project: data.project,
        mddContent: cleanDoc(data.project.mddContent ?? null) ?? get().mddContent,
        uxUiGuideContent: cleanDoc(data.project.uxUiGuideContent ?? null),
        dbgaContent: cleanDoc(data.project.dbgaContent ?? null),
        specContent: cleanDoc(data.project.specContent ?? null),
        phase0SummaryContent: data.project.phase0SummaryContent ?? null,
        blueprintContent: cleanDoc(data.project.blueprintContent ?? null),
        tasksContent: cleanDoc(data.project.tasksContent ?? null),
        apiContractsContent: cleanDoc(data.project.apiContractsContent ?? null),
        logicFlowsContent: cleanDoc(data.project.logicFlowsContent ?? null),
        architectureContent: cleanDoc(data.project.architectureContent ?? null),
        useCasesContent: cleanDoc(data.project.useCasesContent ?? null),
        userStoriesContent: cleanDoc(data.project.userStoriesContent ?? null),
        infraContent: cleanDoc(data.project.infraContent ?? null),
        synced: true,
        error: null,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al cargar bienvenida",
        synced: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  clearChat: async (projectId, activeTab) => {
    const { session } = get();
    if (!projectId?.trim()) return;
    set({ loading: true, error: null, managerThreadId: null });
    try {
      const r = await fetch(`${API_BASE}/ai-orchestrator/clear-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sessionId: session?.id }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al borrar historial");
      }
      const data: { session: Session | null; project: Project } = await r.json();
      set({ session: data.session, project: data.project, error: null, managerThreadId: null });
      if (data.session) {
        await get().fetchWelcome(projectId, activeTab);
      }
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Error al borrar historial",
      });
    } finally {
      set({ loading: false });
    }
  },

  sendMessage: async (message, activeTab, options) => {
    const { projectId, session } = get();
    if (!projectId?.trim() || !message.trim()) return;
    const tab = activeTab ?? "mdd";
    const msg = message.trim();
    const regenerateSection = options?.regenerateSection;

    // Comandos /: solo si el cliente pide regenerar una sección (2–7). Resto del tiempo → Manager/resume.
    if (tab === "mdd" && session?.id && typeof regenerateSection === "number" && regenerateSection >= 1 && regenerateSection <= 7) {
      set({
        loading: true,
        loadingReason: "mdd",
        error: null,
        synced: false,
        agentProgress: [{ agent: "Regenerando sección", message: `§${regenerateSection}...` }],
      });
      try {
        const appendRes = await fetch(`${API_BASE}/sessions/${session.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: msg, tab: "mdd" }),
        });
        if (appendRes.ok) {
          const updatedSession = (await appendRes.json()) as Session;
          set({ session: updatedSession });
        }
        const mddContent = (get().mddContent ?? get().project?.mddContent ?? "").trim();
        const r = await fetch(`${API_BASE}/ai-analysis/mdd/stream/regenerate-section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, section: regenerateSection, mddContent: mddContent || undefined }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Error al regenerar sección");
        }
        const reader = r.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed) as { type: string; agent?: string; markdown?: string; message?: string; precision?: number; status?: string; precisionBreakdown?: PrecisionBreakdown };
                if (event.type === "progress" && event.agent != null && event.message != null) {
                  set((s) => ({ agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }] }));
                } else if (event.type === "done" && event.markdown != null && event.markdown.trim().length > 80) {
                  set({ mddContent: event.markdown });
                  const { persistMddContent, fetchProject, fetchEstimation, fetchConformance } = get();
                  await persistMddContent(event.markdown, { force: true });
                  await fetchProject(projectId);
                  fetchEstimation(projectId).catch(() => { });
                  fetchConformance(projectId).catch(() => { });
                  const current = get();
                  set({
                    project: current.project ? { ...current.project, mddContent: event.markdown } : null,
                    loading: false,
                    loadingReason: null,
                    agentProgress: [],
                  });
                  const assistantRes = await fetch(`${API_BASE}/sessions/${session.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ role: "assistant", content: `Sección §${regenerateSection} regenerada. Revisa el documento en el panel central.`, tab: "mdd" }),
                  });
                  if (assistantRes.ok) {
                    const sess = (await assistantRes.json()) as Session;
                    set({ session: sess });
                  }
                  return;
                } else if (event.type === "error" && event.message) {
                  set({ error: event.message, loading: false, loadingReason: null, agentProgress: [] });
                  return;
                }
              } catch {
                // ignore parse
              }
            }
          }
        }
        set({ loading: false, loadingReason: null, agentProgress: [] });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Error al regenerar sección",
          loading: false,
          loadingReason: null,
          agentProgress: [],
        });
      }
      return;
    }

    if (tab === "mdd" && session?.id) {
      const managerThreadId = get().managerThreadId;
      const wantsManager = true;

      const looksLikeMddDocument =
        msg.length > 500 &&
        /^#\s*Master\s+Design\s+Document/i.test(msg) &&
        /\n##\s*1\.\s*Contexto/i.test(msg);
      const messageToSend = looksLikeMddDocument ? "" : msg;
      const messageForApi =
        messageToSend ||
        (managerThreadId != null ? "sí" : "Quiero refinar el MDD según los requisitos que indiqué.");
      if (looksLikeMddDocument) {
        console.warn("[Workshop] El mensaje parece el documento MDD, no la petición del usuario; se envía texto por defecto al API.");
      }

      if (wantsManager) {
        set({
          loading: true,
          loadingReason: "mdd",
          error: null,
          synced: false,
          agentProgress: [],
          streamingUserMessage: looksLikeMddDocument ? messageForApi : msg,
          pendingPlanApproval: null,
          mddJustGeneratedFromBenchmark: false,
        });
        try {
          if (!looksLikeMddDocument) {
            const appendRes = await fetch(`${API_BASE}/sessions/${session.id}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "user", content: msg, tab: "mdd" }),
            });
            if (!appendRes.ok) throw new Error("Error al enviar mensaje");
            const updatedSession = (await appendRes.json()) as Session;
            set({ session: updatedSession });
          }
          set({ streamingUserMessage: null });

          const url =
            managerThreadId != null
              ? `${API_BASE}/ai-analysis/mdd/stream/resume`
              : `${API_BASE}/ai-analysis/mdd/stream/manager`;
          const body =
            managerThreadId != null
              ? {
                projectId,
                threadId: managerThreadId,
                userMessage: messageForApi,
                mddContent: (get().mddContent ?? get().project?.mddContent ?? "").trim() || undefined,
              }
              : {
                projectId,
                dbgaContent: (get().dbgaContent ?? get().project?.dbgaContent ?? "").trim() || undefined,
                initialMessage: messageForApi,
                mddContent: (get().mddContent ?? get().project?.mddContent ?? "").trim() || undefined,
              };
          const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            throw new Error(err.message ?? "Error en el flujo MDD");
          }
          const reader = r.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                  const event = JSON.parse(trimmed) as {
                    type: string;
                    agent?: string;
                    message?: string;
                    reply?: string;
                    questions?: string[];
                    threadId?: string;
                    markdown?: string;
                    precision?: number;
                    status?: "red" | "yellow" | "green";
                    precisionBreakdown?: PrecisionBreakdown;
                    auditorFeedback?: string;
                    auditTrail?: string[];
                    /** Plan para aprobación (HITL 4.4) */
                    plan?: Array<{ step_id: string; task_description: string; node: string }>;
                    planMessage?: string;
                  };
                  if (event.type === "progress" && event.agent != null && event.message != null) {
                    set((s) => ({
                      agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }],
                    }));
                  } else if (event.type === "draft" && event.markdown != null && event.markdown.trim().length > 80) {
                    set({ mddContent: event.markdown });
                  } else if (event.type === "interrupt") {
                    set({
                      managerThreadId: event.threadId ?? get().managerThreadId ?? null,
                      pendingPlanApproval:
                        Array.isArray(event.plan) && event.plan.length > 0
                          ? { plan: event.plan, planMessage: event.planMessage ?? "¿Ejecutar este plan?" }
                          : null,
                    });
                    if (event.markdown != null && event.markdown.trim().length > 80) {
                      set({ mddContent: event.markdown });
                      const { persistMddContent, fetchProject, fetchEstimation } = get();
                      await persistMddContent(event.markdown);
                      const errBeforeFetch = get().error;
                      await fetchProject(projectId);
                      if (errBeforeFetch) set({ error: errBeforeFetch });
                      await fetchEstimation(projectId);
                      const current = get();
                      set({
                        mddContent: event.markdown,
                        project: current.project ? { ...current.project, mddContent: event.markdown } : null,
                      });
                    }
                    // No sobrescribir mddContent con markdown vacío (auditar puede venir de checkpoint sin draft)

                    const precisionBreakdown = event.precisionBreakdown;
                    const auditorFeedback = event.auditorFeedback;
                    const auditTrail = event.auditTrail;

                    // Actualizar estado para el semáforo/modal, NO enviar al chat
                    if (precisionBreakdown || auditTrail || auditorFeedback) {
                      set({
                        precisionBreakdown: precisionBreakdown ?? get().precisionBreakdown,
                        auditTrail: auditTrail ?? get().auditTrail,
                        auditorFeedback: auditorFeedback ?? get().auditorFeedback
                      });
                    }

                    // Calculamos clarifierContent siempre (plan_approval usa planMessage)
                    const clarifierContent =
                      Array.isArray(event.plan) && event.plan.length > 0 && event.planMessage
                        ? event.planMessage
                        : event.reply != null && event.reply !== ""
                          ? event.reply
                          : Array.isArray(event.questions) && event.questions.length > 0
                            ? event.questions.join("\n\n")
                            : "Responde en el chat para continuar con la entrevista (objetivos del sistema, integraciones, etc.).";

                    // Ya NO enviamos auditContent al chat explícitamente, solo clarifierContent
                    const messagesToPost: string[] = [clarifierContent];
                    let sess = get().session;
                    for (const content of messagesToPost) {
                      const appendAssistant = await fetch(`${API_BASE}/sessions/${session.id}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ role: "assistant", content, tab: "mdd" }),
                      });
                      if (appendAssistant.ok) {
                        sess = (await appendAssistant.json()) as Session;
                        set({ session: sess });
                      }
                    }
                    set({ loading: false, loadingReason: null, agentProgress: [], streamingUserMessage: null, streamingContent: null });
                    return;
                  } else if (event.type === "done" && event.markdown != null) {
                    set({ managerThreadId: null, pendingPlanApproval: null });
                    const markdownOk = event.markdown.trim().length > 80;
                    if (markdownOk) set({ mddContent: event.markdown });

                    const precisionBreakdown = (event as any).precisionBreakdown;
                    const auditTrail = (event as any).auditTrail;
                    const auditorFeedback = (event as any).auditorFeedback;

                    if (precisionBreakdown || auditTrail || auditorFeedback) {
                      set({
                        precisionBreakdown: precisionBreakdown ?? get().precisionBreakdown,
                        auditTrail: auditTrail ?? get().auditTrail,
                        auditorFeedback: auditorFeedback ?? get().auditorFeedback
                      });
                    }

                    const { persistMddContent, fetchProject, fetchEstimation } = get();
                    if (markdownOk) await persistMddContent(event.markdown);
                    const errorBeforeFetch = get().error;
                    await fetchProject(projectId);
                    if (errorBeforeFetch) set({ error: errorBeforeFetch });
                    await fetchEstimation(projectId);
                    if (markdownOk) {
                      const current = get();
                      set({
                        mddContent: event.markdown,
                        project: current.project ? { ...current.project, mddContent: event.markdown } : null,
                      });
                    }

                    const assistantContent = "MDD generado. Revisa el documento en el panel central.";
                    const assistantRes = await fetch(`${API_BASE}/sessions/${session.id}/messages`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        role: "assistant",
                        content: assistantContent,
                        tab: "mdd",
                      }),
                    });
                    if (assistantRes.ok) {
                      const sess = (await assistantRes.json()) as Session;
                      set({ session: sess });
                    }
                    set({ loading: false, loadingReason: null, agentProgress: [], streamingUserMessage: null, streamingContent: null, pendingPlanApproval: null });
                    return;
                  } else if (event.type === "error" && event.message) {
                    set({ managerThreadId: null, pendingPlanApproval: null, error: String(event.message), loading: false, loadingReason: null, agentProgress: [], streamingUserMessage: null, streamingContent: null });
                    return;
                  }
                } catch (_) {
                  // ignore
                }
              }
            }
          }
        } catch (e) {
          set({
            managerThreadId: null,
            pendingPlanApproval: null,
            error: e instanceof Error ? e.message : "Error en el flujo MDD",
            loading: false,
            loadingReason: null,
            agentProgress: [],
            streamingUserMessage: null,
          });
        }
      }

      set({
        loading: true,
        error: null,
        synced: false,
        streamingUserMessage: msg,
        streamingContent: "",
        streamingTab: tab,
      });
      try {
        const body: Record<string, unknown> = {
          projectId,
          sessionId: session?.id,
          message: msg,
          mddContent: get().mddContent || undefined,
          uxUiGuideContent: get().uxUiGuideContent ?? undefined,
          activeTab: tab,
        };
        if (activeTab === "benchmark") {
          const dbga = get().dbgaContent ?? get().project?.dbgaContent ?? null;
          if (dbga != null) body.dbgaContent = dbga;
        }
        const r = await fetch(`${API_BASE}/ai-orchestrator/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Error en la entrevista");
        }
        const reader = r.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        if (!reader) throw new Error("No se pudo leer el stream");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const block of lines) {
            let event = "";
            let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
            }
            if (!event || !dataStr) continue;
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "chunk" && typeof data.content === "string") {
                set((s) => ({ streamingContent: (s.streamingContent ?? "") + data.content }));
              } else if (event === "done") {
                const sess = data.session as Session | undefined;
                const proj = data.project as Project | undefined;
                const uxFromApi = (data.uxUiGuideContent ?? proj?.uxUiGuideContent) as string | null | undefined;
                const projectWithUx = proj
                  ? {
                    ...proj,
                    mddContent: cleanDoc(proj.mddContent ?? null) ?? "",
                    uxUiGuideContent: cleanDoc(uxFromApi ?? proj.uxUiGuideContent ?? null),
                    blueprintContent: cleanDoc(proj.blueprintContent ?? null),
                    dbgaContent: cleanDoc(proj.dbgaContent ?? null),
                    specContent: cleanDoc(proj.specContent ?? null),
                  }
                  : proj;
                set({
                  session: sess ?? get().session,
                  project: projectWithUx ?? get().project,
                  mddContent: cleanDoc(proj?.mddContent ?? null) ?? get().mddContent,
                  uxUiGuideContent: cleanDoc(uxFromApi ?? get().uxUiGuideContent ?? null),
                  dbgaContent: cleanDoc(proj?.dbgaContent ?? null),
                  blueprintContent: cleanDoc(proj?.blueprintContent ?? null),
                  apiContractsContent: cleanDoc(proj?.apiContractsContent ?? null),
                  logicFlowsContent: cleanDoc(proj?.logicFlowsContent ?? null),
                  infraContent: cleanDoc(proj?.infraContent ?? null),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                  error: null,
                });
              } else if (event === "error" && data.error) {
                set({
                  error: String(data.error),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                });
              }
            } catch (_) {
              // ignore parse errors for partial chunks
            }
          }
        }
        if (buffer.trim()) {
          let event = "";
          let dataStr = "";
          for (const line of buffer.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (event && dataStr) {
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "chunk" && typeof data.content === "string") {
                set((s) => ({ streamingContent: (s.streamingContent ?? "") + data.content }));
              } else if (event === "done") {
                const sess = data.session as Session | undefined;
                const proj = data.project as Project | undefined;
                const uxFromApi = (data.uxUiGuideContent ?? proj?.uxUiGuideContent) as string | null | undefined;
                const projectWithUx = proj
                  ? {
                    ...proj,
                    mddContent: cleanDoc(proj.mddContent ?? null) ?? "",
                    uxUiGuideContent: cleanDoc(uxFromApi ?? proj.uxUiGuideContent ?? null),
                    blueprintContent: cleanDoc(proj.blueprintContent ?? null),
                    dbgaContent: cleanDoc(proj.dbgaContent ?? null),
                    specContent: cleanDoc(proj.specContent ?? null),
                  }
                  : proj;
                set({
                  session: sess ?? get().session,
                  project: projectWithUx ?? get().project,
                  mddContent: cleanDoc(proj?.mddContent ?? null) ?? get().mddContent,
                  uxUiGuideContent: cleanDoc(uxFromApi ?? get().uxUiGuideContent ?? null),
                  dbgaContent: cleanDoc(proj?.dbgaContent ?? null),
                  blueprintContent: cleanDoc(proj?.blueprintContent ?? null),
                  apiContractsContent: cleanDoc(proj?.apiContractsContent ?? null),
                  logicFlowsContent: cleanDoc(proj?.logicFlowsContent ?? null),
                  infraContent: cleanDoc(proj?.infraContent ?? null),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                  error: null,
                });
              } else if (event === "error" && data.error) {
                set({
                  error: String(data.error),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                });
              }
            } catch (_) {
              // ignore
            }
          }
        }
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Error al enviar",
          streamingUserMessage: null,
          streamingContent: null,
          streamingTab: null,
          synced: true,
        });
      } finally {
        set({ loading: false });
      }
    } else {
      // Chat genérico para Guía UX/UI, benchmark, spec, etc. (tabs que no usan el flujo MDD/Manager)
      set({
        loading: true,
        error: null,
        synced: false,
        streamingUserMessage: msg,
        streamingContent: "",
        streamingTab: tab,
      });
      try {
        const body: Record<string, unknown> = {
          projectId,
          sessionId: session?.id,
          message: msg,
          mddContent: get().mddContent || undefined,
          uxUiGuideContent: get().uxUiGuideContent ?? get().project?.uxUiGuideContent ?? undefined,
          activeTab: tab,
        };
        if (tab === "benchmark") {
          const dbga = get().dbgaContent ?? get().project?.dbgaContent ?? null;
          if (dbga != null) body.dbgaContent = dbga;
        }
        const r = await fetch(`${API_BASE}/ai-orchestrator/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message ?? "Error en la entrevista");
        }
        const reader = r.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        if (!reader) throw new Error("No se pudo leer el stream");

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const block of lines) {
            let event = "";
            let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
            }
            if (!event || !dataStr) continue;
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "chunk" && typeof data.content === "string") {
                set((s) => ({ streamingContent: (s.streamingContent ?? "") + data.content }));
              } else if (event === "done") {
                const sess = data.session as Session | undefined;
                const proj = data.project as Project | undefined;
                const uxFromApi = (data.uxUiGuideContent ?? proj?.uxUiGuideContent) as string | null | undefined;
                const projectWithUx = proj
                  ? {
                    ...proj,
                    mddContent: cleanDoc(proj.mddContent ?? null) ?? "",
                    uxUiGuideContent: cleanDoc(uxFromApi ?? proj.uxUiGuideContent ?? null),
                    blueprintContent: cleanDoc(proj.blueprintContent ?? null),
                    dbgaContent: cleanDoc(proj.dbgaContent ?? null),
                    specContent: cleanDoc(proj.specContent ?? null),
                  }
                  : proj;
                set({
                  session: sess ?? get().session,
                  project: projectWithUx ?? get().project,
                  mddContent: cleanDoc(proj?.mddContent ?? null) ?? get().mddContent,
                  uxUiGuideContent: cleanDoc(uxFromApi ?? get().uxUiGuideContent ?? null),
                  dbgaContent: cleanDoc(proj?.dbgaContent ?? null),
                  blueprintContent: cleanDoc(proj?.blueprintContent ?? null),
                  apiContractsContent: cleanDoc(proj?.apiContractsContent ?? null),
                  logicFlowsContent: cleanDoc(proj?.logicFlowsContent ?? null),
                  infraContent: cleanDoc(proj?.infraContent ?? null),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                  error: null,
                });
              } else if (event === "error" && data.error) {
                set({
                  error: String(data.error),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                });
              }
            } catch (_) {
              // ignore parse errors for partial chunks
            }
          }
        }
        if (buffer.trim()) {
          let event = "";
          let dataStr = "";
          for (const line of buffer.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (event && dataStr) {
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (event === "chunk" && typeof data.content === "string") {
                set((s) => ({ streamingContent: (s.streamingContent ?? "") + data.content }));
              } else if (event === "done") {
                const sess = data.session as Session | undefined;
                const proj = data.project as Project | undefined;
                const uxFromApi = (data.uxUiGuideContent ?? proj?.uxUiGuideContent) as string | null | undefined;
                const projectWithUx = proj
                  ? {
                    ...proj,
                    mddContent: cleanDoc(proj.mddContent ?? null) ?? "",
                    uxUiGuideContent: cleanDoc(uxFromApi ?? proj.uxUiGuideContent ?? null),
                    dbgaContent: cleanDoc(proj.dbgaContent ?? null),
                    specContent: cleanDoc(proj.specContent ?? null),
                    blueprintContent: cleanDoc(proj.blueprintContent ?? null),
                    apiContractsContent: cleanDoc(proj.apiContractsContent ?? null),
                    logicFlowsContent: cleanDoc(proj.logicFlowsContent ?? null),
                    tasksContent: cleanDoc(proj.tasksContent ?? null),
                    architectureContent: cleanDoc(proj.architectureContent ?? null),
                    useCasesContent: cleanDoc(proj.useCasesContent ?? null),
                    userStoriesContent: cleanDoc(proj.userStoriesContent ?? null),
                    infraContent: cleanDoc(proj.infraContent ?? null),
                  }
                  : proj;
                set({
                  session: sess ?? get().session,
                  project: projectWithUx ?? get().project,
                  mddContent: cleanDoc(proj?.mddContent ?? null) ?? get().mddContent,
                  uxUiGuideContent: cleanDoc(uxFromApi ?? get().uxUiGuideContent ?? null),
                  dbgaContent: cleanDoc(proj?.dbgaContent ?? null),
                  specContent: cleanDoc(proj?.specContent ?? null),
                  blueprintContent: cleanDoc(proj?.blueprintContent ?? null),
                  apiContractsContent: cleanDoc(proj?.apiContractsContent ?? null),
                  logicFlowsContent: cleanDoc(proj?.logicFlowsContent ?? null),
                  tasksContent: cleanDoc(proj?.tasksContent ?? null),
                  architectureContent: cleanDoc(proj?.architectureContent ?? null),
                  useCasesContent: cleanDoc(proj?.useCasesContent ?? null),
                  userStoriesContent: cleanDoc(proj?.userStoriesContent ?? null),
                  infraContent: cleanDoc(proj?.infraContent ?? null),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                  error: null,
                });
              } else if (event === "error" && data.error) {
                set({
                  error: String(data.error),
                  streamingUserMessage: null,
                  streamingContent: null,
                  streamingTab: null,
                  synced: true,
                });
              }
            } catch (_) {
              // ignore
            }
          }
        }
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Error al enviar",
          streamingUserMessage: null,
          streamingContent: null,
          streamingTab: null,
          synced: true,
        });
      } finally {
        set({ loading: false });
      }
    }
  },

  updateMddContent: (content) => set({ mddContent: content }),

  setUxUiGuideContent: (content) => set({ uxUiGuideContent: content }),
  persistUxUiGuideContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.uxUiGuideContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uxUiGuideContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, uxUiGuideContent: cleanDoc(data.uxUiGuideContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },

  setBlueprintContent: (content) => set({ blueprintContent: content }),

  persistBlueprintContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.blueprintContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprintContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, blueprintContent: cleanDoc(data.blueprintContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },

  generateBlueprint: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { preview?: boolean; gapsFeedback?: string } = {};
      if (options?.preview) body.preview = true;
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-blueprint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar blueprint");
      }
      const data = await r.json();
      if (options?.preview && data.content != null) {
        set({ pendingDeliverablePreview: { kind: "blueprint", content: data.content }, error: null });
        return null;
      }
      const proj = data as Project;
      const raw = proj.blueprintContent ?? "";
      const cleaned = raw.replace(/^\s*```(?:markdown)?\s*/i, "").replace(/^\s*```\s*/, "").replace(/\s*```\s*$/, "");
      const newProj = { ...proj, blueprintContent: cleaned || null };

      set({ project: newProj, blueprintContent: cleaned || null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return newProj;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar blueprint" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setApiContractsContent: (content) => set({ apiContractsContent: content }),
  persistApiContractsContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.apiContractsContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiContractsContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, apiContractsContent: cleanDoc(data.apiContractsContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },
  generateApiContracts: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { preview?: boolean; gapsFeedback?: string } = {};
      if (options?.preview) body.preview = true;
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-api-contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar contratos API");
      }
      const data = await r.json();
      if (options?.preview && data.content != null) {
        set({ pendingDeliverablePreview: { kind: "api", content: data.content }, error: null });
        return null;
      }
      const proj = data as Project;
      set({ project: proj, apiContractsContent: proj.apiContractsContent ?? null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return proj;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar contratos API" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setLogicFlowsContent: (content) => set({ logicFlowsContent: content }),
  persistLogicFlowsContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.logicFlowsContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logicFlowsContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, logicFlowsContent: cleanDoc(data.logicFlowsContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },
  generateLogicFlows: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { gapsFeedback?: string } = {};
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-logic-flows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar lógica y flujos");
      }
      const data: Project = await r.json();
      set({
        project: data,
        logicFlowsContent: data.logicFlowsContent ?? null,
        error: null,
      });
      get().fetchConformance(projectId).catch(() => { });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar lógica y flujos" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setInfraContent: (content) => set({ infraContent: content }),
  persistInfraContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.infraContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infraContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, infraContent: cleanDoc(data.infraContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },
  generateInfra: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { preview?: boolean; gapsFeedback?: string } = {};
      if (options?.preview) body.preview = true;
      if (options?.gapsFeedback?.trim()) body.gapsFeedback = options.gapsFeedback.trim();
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-infra`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar infraestructura");
      }
      const data = await r.json();
      if (options?.preview && data.content != null) {
        set({ pendingDeliverablePreview: { kind: "infra", content: data.content }, error: null });
        return null;
      }
      const proj = data as Project;
      set({ project: proj, infraContent: proj.infraContent ?? null, error: null });
      get().fetchConformance(projectId).catch(() => { });
      return proj;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar infraestructura" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setArchitectureContent: (content) => set({ architectureContent: content }),
  persistArchitectureContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.architectureContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ architectureContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, architectureContent: cleanDoc(data.architectureContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },
  generateArchitecture: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { preview?: boolean } = {};
      if (options?.preview) body.preview = true;
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-architecture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar arquitectura");
      }
      const data = await r.json();
      if (options?.preview && data.content != null) {
        set({ pendingDeliverablePreview: { kind: "architecture", content: data.content }, error: null });
        return null;
      }
      const proj = data as Project;
      set({ project: proj, architectureContent: proj.architectureContent ?? null, error: null });
      return proj;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar arquitectura" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setUseCasesContent: (content) => set({ useCasesContent: content }),
  persistUseCasesContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.useCasesContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCasesContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, useCasesContent: cleanDoc(data.useCasesContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },
  generateUseCases: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { preview?: boolean } = {};
      if (options?.preview) body.preview = true;
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-use-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar casos de uso");
      }
      const data = await r.json();
      if (options?.preview && data.content != null) {
        set({ pendingDeliverablePreview: { kind: "use-cases", content: data.content }, error: null });
        return null;
      }
      const proj = data as Project;
      set({ project: proj, useCasesContent: proj.useCasesContent ?? null, error: null });
      return proj;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar casos de uso" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setUserStoriesContent: (content) => set({ userStoriesContent: content }),
  persistUserStoriesContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.userStoriesContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userStoriesContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, userStoriesContent: cleanDoc(data.userStoriesContent ?? cleanPath), synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },
  generateUserStories: async (projectId, options) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const body: { preview?: boolean } = {};
      if (options?.preview) body.preview = true;
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-user-stories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar historias de usuario");
      }
      const data = await r.json();
      if (options?.preview && data.content != null) {
        set({ pendingDeliverablePreview: { kind: "user-stories", content: data.content }, error: null });
        return null;
      }
      const proj = data as Project;
      set({ project: proj, userStoriesContent: proj.userStoriesContent ?? null, error: null });
      return proj;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar historias de usuario" });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setSpecContent: (content) => set({ specContent: content }),
  persistSpecContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.specContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, specContent: cleanDoc(data.specContent ?? cleanPath), synced: true });
      } else set({ synced: true });
    } catch {
      set({ synced: true });
    }
  },
  generateSpec: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-spec`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar Spec");
      }
      const data: Project = await r.json();
      // Limpiar etiquetas markdown que a veces genera el LLM
      const raw = data.specContent ?? "";
      const cleaned = raw.replace(/^\s*```(?:markdown)?\s*/i, "").replace(/^\s*```\s*/, "").replace(/\s*```\s*$/, "");

      const newData = { ...data, specContent: cleaned || null };
      set({ project: newData, specContent: cleaned || null, error: null });
      return newData;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Spec" });
      return null;
    } finally {
      set({ loading: false });
    }
  },
  setTasksContent: (content) => set({ tasksContent: content }),
  persistTasksContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.tasksContent ?? "")) return;
    set({ synced: false });
    try {
      const cleanPath = cleanDoc(content) || content;
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasksContent: cleanPath }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, tasksContent: cleanDoc(data.tasksContent ?? cleanPath), synced: true });
      } else set({ synced: true });
    } catch {
      set({ synced: true });
    }
  },
  generateTasks: async (projectId) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, error: null });
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/generate-tasks`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar Tasks");
      }
      const data: Project = await r.json();
      set({ project: data, tasksContent: data.tasksContent ?? null, error: null });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Tasks" });
      return null;
    } finally {
      set({ loading: false });
    }
  },
  fetchConformance: async (projectId, options) => {
    if (!projectId?.trim()) return;
    const useLlm = options?.useLlm === true;
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/conformance${useLlm ? "?useLlm=true" : ""}`);
      if (r.ok) {
        const data = await r.json();
        set({ conformance: data });
      }
    } catch {
      set({ conformance: null });
    }
  },
  verifyDeliverable: async (projectId, deliverable) => {
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/verify-deliverable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverable }),
      });
      if (!r.ok) throw new Error("Error al verificar");
      const text = await r.text();
      return text.replace(/^["']|["']$/g, "").trim();
    } catch {
      return "";
    }
  },
  setPendingDeliverablePreview: (v) => set({ pendingDeliverablePreview: v }),
  confirmDeliverable: async () => {
    const { pendingDeliverablePreview, projectId } = get();
    if (!pendingDeliverablePreview || !projectId) return;
    const { kind, content } = pendingDeliverablePreview;
    if (kind === "blueprint") await get().persistBlueprintContent(content);
    else if (kind === "api") await get().persistApiContractsContent(content);
    else if (kind === "infra") await get().persistInfraContent(content);
    else if (kind === "architecture") await get().persistArchitectureContent(content);
    else if (kind === "use-cases") await get().persistUseCasesContent(content);
    else if (kind === "user-stories") await get().persistUserStoriesContent(content);
    set({ pendingDeliverablePreview: null });
  },
  discardDeliverable: () => set({ pendingDeliverablePreview: null }),

  setDbgaContent: (content) => set({ dbgaContent: content }),

  persistDbgaContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.dbgaContent ?? "")) return;
    set({ synced: false });
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbgaContent: content }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, dbgaContent: data.dbgaContent ?? content, synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },

  setAgentProgress: (progress) => set({ agentProgress: progress }),

  generateBenchmark: async (projectId, userIdea) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "benchmark", error: null, agentProgress: [] });
    try {
      const r = await fetch(`${API_BASE}/ai-analysis/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: userIdea?.trim() ?? "",
          projectId: projectId.trim(),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar Benchmark & Gap Analysis");
      }
      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMarkdown: string | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as { type: string; agent?: string; message?: string; markdown?: string };
              if (event.type === "progress" && event.agent != null && event.message != null) {
                set((s) => ({ agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }] }));
              } else if (event.type === "done" && event.markdown != null) {
                finalMarkdown = event.markdown;
              } else if (event.type === "error" && event.message) {
                throw new Error(event.message);
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }
      }

      if (finalMarkdown != null) {
        set({ dbgaContent: finalMarkdown, error: null });
        const { persistDbgaContent, fetchProject } = get();
        await persistDbgaContent(finalMarkdown);
        const data = await fetchProject(projectId);
        return data ?? get().project;
      }
      return get().project;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Benchmark" });
      return null;
    } finally {
      set({ loading: false, loadingReason: null, agentProgress: [] });
    }
  },

  generateMddFromBenchmark: async (projectId) => {
    if (!projectId?.trim()) return null;
    const dbgaContent = (get().dbgaContent ?? get().project?.dbgaContent ?? "").trim();
    set({ loading: true, loadingReason: "mdd", error: null, agentProgress: [] });
    try {
      const r = await fetch(`${API_BASE}/ai-analysis/mdd/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dbgaContent: dbgaContent || undefined,
          projectId: projectId.trim(),
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Error al generar MDD");
      }
      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalMarkdown: string | null = null;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as { type: string; agent?: string; message?: string; markdown?: string };
              if (event.type === "progress" && event.agent != null && event.message != null) {
                set((s) => ({ agentProgress: [...s.agentProgress, { agent: event.agent!, message: event.message! }] }));
              } else if (event.type === "draft" && event.markdown != null && event.markdown.trim().length > 80) {
                set({ mddContent: event.markdown });
              } else if (event.type === "done" && event.markdown != null) {
                finalMarkdown = event.markdown;
              } else if (event.type === "error" && event.message) {
                throw new Error(event.message);
              }
            } catch (parseErr) {
              if (parseErr instanceof SyntaxError) continue;
              throw parseErr;
            }
          }
        }
      }

      if (finalMarkdown != null && finalMarkdown.trim().length > 80) {
        set({ mddContent: finalMarkdown, error: null, mddJustGeneratedFromBenchmark: true });
        const { persistMddContent, fetchProject, fetchEstimation } = get();
        await persistMddContent(finalMarkdown);
        const data = await fetchProject(projectId);
        await fetchEstimation(projectId);
        return data ?? get().project;
      }
      return get().project;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar MDD" });
      return null;
    } finally {
      set({ loading: false, loadingReason: null, agentProgress: [] });
    }
  },

  clearMddJustGeneratedFromBenchmark: () => set({ mddJustGeneratedFromBenchmark: false }),

  setPhase0SummaryContent: (content) => set({ phase0SummaryContent: content }),

  persistPhase0SummaryContent: async (content) => {
    const { projectId, project } = get();
    if (!projectId || !project || content === (project.phase0SummaryContent ?? "")) return;
    set({ synced: false });
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase0SummaryContent: content }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, phase0SummaryContent: data.phase0SummaryContent ?? content, synced: true });
      } else {
        set({ synced: true });
      }
    } catch {
      set({ synced: true });
    }
  },

  phase0DeepResearch: async (projectId, opts) => {
    if (!projectId?.trim()) return null;
    set({ loading: true, loadingReason: "phase0-deep-research", error: null });
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}/phase0-deep-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdea: opts.userIdea?.trim() || undefined,
          urls: opts.urls?.length ? opts.urls : undefined,
          includeBenchmark: opts.includeBenchmark ?? false,
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        let errMessage = "Error al generar Deep Research";
        try {
          const err = JSON.parse(raw) as { message?: string };
          if (err?.message) errMessage = err.message;
        } catch {
          if (raw.trim().length > 0 && raw.length < 500) errMessage = raw;
        }
        throw new Error(errMessage);
      }
      let data: Project;
      try {
        data = JSON.parse(raw) as Project;
      } catch {
        console.error("[phase0DeepResearch] Respuesta no es JSON. Preview:", raw.slice(0, 200));
        throw new Error(
          "El servidor devolvió texto en lugar de JSON (posible fallo del proveedor de IA). Intenta de nuevo.",
        );
      }
      set({ project: data, phase0SummaryContent: data.phase0SummaryContent ?? null, error: null });
      return data;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Error al generar Deep Research" });
      return null;
    } finally {
      set({ loading: false, loadingReason: null });
    }
  },

  clearDbgaContent: async (projectId) => {
    if (!projectId?.trim()) return;
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbgaContent: null }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, dbgaContent: data.dbgaContent ?? null });
      }
    } catch {
      // ignore
    }
  },

  fetchEstimation: async (projectId) => {
    if (!projectId?.trim()) return null;
    try {
      const currentMdd = (get().mddContent ?? get().project?.mddContent ?? "").trim();
      const r = await fetch(`${API_BASE}/ai-analysis/estimation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectId.trim(),
          ...(currentMdd ? { mddContent: currentMdd } : {}),
        }),
      });
      if (!r.ok) return null;
      const data = (await r.json()) as LiveMetricsResult & { precisionBreakdown?: PrecisionBreakdown };
      const { precisionBreakdown, ...metrics } = data;
      set({
        liveMetrics: metrics,
        ...(precisionBreakdown != null ? { precisionBreakdown } : {}),
      });
      return metrics;
    } catch {
      return null;
    }
  },

  clearPhase0SummaryContent: async (projectId) => {
    if (!projectId?.trim()) return;
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase0SummaryContent: null }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        set({ project: data, phase0SummaryContent: data.phase0SummaryContent ?? null });
      }
    } catch {
      // ignore
    }
  },

  persistMddContent: async (content, options) => {
    const { projectId, project, fetchEstimation } = get();
    if (!projectId || !project) return;
    if (!options?.force && content === (project.mddContent ?? "")) return;
    set({ synced: false, error: null });
    try {
      const r = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mddContent: content }),
      });
      if (r.ok) {
        const data: Project = await r.json();
        const savedContent = data.mddContent ?? content;
        set({ project: data, mddContent: savedContent, synced: true, error: null });
        await fetch(`${API_BASE}/ai-analysis/estimation/clear-draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: projectId.trim() }),
        }).catch(() => { });
        fetchEstimation(projectId).catch(() => { });
      } else {
        const errBody = await r.json().catch(() => ({}));
        const message = typeof errBody?.message === "string" ? errBody.message : "Error al guardar el MDD";
        set({ synced: false, error: message });
      }
    } catch {
      set({ synced: false, error: "Error de red al guardar" });
    }
  },

  revertMddContent: () => {
    const { project } = get();
    set({ mddContent: project?.mddContent ?? "" });
  },

  /** Persiste el MDD y refresca estimación/semáforo. No reemplaza el contenido por la respuesta del review
   *  para que las ediciones manuales del usuario se respeten. */
  persistAndReviewMdd: async () => {
    const { projectId, project, mddContent, persistMddContent, fetchEstimation } = get();
    if (!projectId?.trim() || !project) return;
    const content = (mddContent ?? "").trim();
    if (content === (project.mddContent ?? "")) return;
    set({ mddReviewing: true });
    try {
      await persistMddContent(content);
      await fetch(`${API_BASE}/ai-analysis/mdd/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projectId.trim(), mddContent: content }),
      });
      fetchEstimation(projectId).catch(() => { });
    } finally {
      set({ mddReviewing: false });
    }
  },

  fetchAdrs: async (projectId) => {
    try {
      const r = await fetch(`${API_BASE}/ai-analysis/mdd/adrs?projectId=${encodeURIComponent(projectId)}`);
      if (r.ok) {
        const data = await r.json();
        set({ adrs: data });
      }
    } catch (err) {
      console.error("Error fetching ADRs:", err);
    }
  },
  reset: () => set(initialState),
}));
