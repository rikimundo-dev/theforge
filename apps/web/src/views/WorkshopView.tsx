import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Code,
  Lock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  DollarSign,
  Package,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  FileCode,
  GitBranch,
  Server,
  Target,
  Palette,
  Trash2,
  X,
  Download,
  ListOrdered,
  ListTodo,
  Brain,
  Check,
  TrendingUp,
  Play,
  ArrowRight,
  ChevronRight,
  Maximize2,
  Save
} from "lucide-react";
import { useWorkshopStore, type Status } from "../store/workshopStore";
import ChatContainer from "../components/ChatContainer";
import MddViewer from "../components/MddViewer";
import { calculateCostFromMdd } from "../utils/costCalculator";
import { downloadDocumentsZip } from "../utils/downloadDocumentsZip";
import type { LucideIcon } from "lucide-react";

function DocEmptyState({
  icon: Icon,
  title,
  description,
  onGenerate,
  loading,
  hasMdd,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onGenerate: () => void;
  loading: boolean;
  hasMdd: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] text-zinc-500 text-center gap-4">
      <Icon className="w-12 h-12 text-zinc-600" />
      <p className="text-sm">{description}</p>
      <button
        type="button"
        onClick={onGenerate}
        disabled={loading || !hasMdd}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        Generar {title} desde MDD
      </button>
      {!hasMdd && (
        <p className="text-xs">Necesitas tener contenido en el MDD para generar este documento.</p>
      )}
    </div>
  );
}

interface WorkshopViewProps {
  projectId: string;
  projectName?: string;
  onBack?: () => void;
}

export default function WorkshopView({
  projectId,
  projectName,
  onBack,
}: WorkshopViewProps) {
  const project = useWorkshopStore((s) => s.project);
  const liveMetrics = useWorkshopStore((s) => s.liveMetrics);
  const mddContent = useWorkshopStore((s) => s.mddContent);
  const specContentField = useWorkshopStore((s) => s.specContent);
  const dbgaContentField = useWorkshopStore((s) => s.dbgaContent);
  const blueprintContentField = useWorkshopStore((s) => s.blueprintContent);
  const apiContractsContentField = useWorkshopStore((s) => s.apiContractsContent);
  const logicFlowsContentField = useWorkshopStore((s) => s.logicFlowsContent);
  const infraContentField = useWorkshopStore((s) => s.infraContent);
  const tasksContentField = useWorkshopStore((s) => s.tasksContent);
  const architectureContentField = useWorkshopStore((s) => s.architectureContent);
  const useCasesContentField = useWorkshopStore((s) => s.useCasesContent);
  const userStoriesContentField = useWorkshopStore((s) => s.userStoriesContent);
  const phase0SummaryContentField = useWorkshopStore((s) => s.phase0SummaryContent);
  const uxUiGuideContentField = useWorkshopStore((s) => s.uxUiGuideContent);

  const specContent = specContentField ?? project?.specContent ?? null;
  const dbgaContent = dbgaContentField ?? project?.dbgaContent ?? null;
  const blueprintContent = blueprintContentField ?? project?.blueprintContent ?? null;
  const apiContractsContent = apiContractsContentField ?? project?.apiContractsContent ?? null;
  const logicFlowsContent = logicFlowsContentField ?? project?.logicFlowsContent ?? null;
  const infraContent = infraContentField ?? project?.infraContent ?? null;
  const tasksContent = tasksContentField ?? project?.tasksContent ?? null;
  const architectureContent = architectureContentField ?? project?.architectureContent ?? null;
  const useCasesContent = useCasesContentField ?? project?.useCasesContent ?? null;
  const userStoriesContent = userStoriesContentField ?? project?.userStoriesContent ?? null;
  const phase0SummaryContent = phase0SummaryContentField ?? project?.phase0SummaryContent ?? null;
  const uxUiGuideContent = uxUiGuideContentField ?? project?.uxUiGuideContent ?? null;

  const projectStatus: Status = project?.status ?? "ROJO";
  const semaphoreGreen = liveMetrics ? liveMetrics.status === "green" : projectStatus === "VERDE";
  const hasSpec = (specContent ?? "").trim().length > 0;
  const canGenerate = semaphoreGreen && hasSpec;

  /* Use stable selectors to avoid loops */
  const conformanceRaw = useWorkshopStore((s) => s.conformance);
  const conformance = useMemo(() => conformanceRaw, [conformanceRaw]);

  const precisionBreakdownRaw = useWorkshopStore((s) => s.precisionBreakdown);
  const precisionBreakdown = useMemo(() => precisionBreakdownRaw, [precisionBreakdownRaw]);

  const auditTrailRaw = useWorkshopStore((s) => s.auditTrail);
  const auditTrail = useMemo(() => auditTrailRaw || [], [auditTrailRaw]);

  const pendingDeliverablePreviewRaw = useWorkshopStore((s) => s.pendingDeliverablePreview);
  const pendingDeliverablePreview = useMemo(() => pendingDeliverablePreviewRaw, [pendingDeliverablePreviewRaw]);
  const synced = useWorkshopStore((s) => s.synced);
  const loading = useWorkshopStore((s) => s.loading);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);
  const auditorFeedback = useWorkshopStore((s) => s.auditorFeedback);
  const error = useWorkshopStore((s) => s.error);
  const setError = useWorkshopStore((s) => s.setError);
  const fetchProject = useWorkshopStore((s) => s.fetchProject);
  const adrsRaw = useWorkshopStore((s) => s.adrs);
  const adrs = useMemo(() => adrsRaw || [], [adrsRaw]);
  const fetchAdrs = useWorkshopStore((s) => s.fetchAdrs);
  const fetchEstimation = useWorkshopStore((s) => s.fetchEstimation);
  const fetchWelcome = useWorkshopStore((s) => s.fetchWelcome);
  const sendMessage = useWorkshopStore((s) => s.sendMessage);
  const setMddContent = useWorkshopStore((s) => s.setMddContent);
  const revertMddContent = useWorkshopStore((s) => s.revertMddContent);
  const persistAndReviewMdd = useWorkshopStore((s) => s.persistAndReviewMdd);
  const mddReviewing = useWorkshopStore((s) => s.mddReviewing);
  const setBlueprintContent = useWorkshopStore((s) => s.setBlueprintContent);
  const persistBlueprintContent = useWorkshopStore((s) => s.persistBlueprintContent);
  const generateBlueprint = useWorkshopStore((s) => s.generateBlueprint);
  const setApiContractsContent = useWorkshopStore((s) => s.setApiContractsContent);
  const persistApiContractsContent = useWorkshopStore((s) => s.persistApiContractsContent);
  const generateApiContracts = useWorkshopStore((s) => s.generateApiContracts);
  const setLogicFlowsContent = useWorkshopStore((s) => s.setLogicFlowsContent);
  const persistLogicFlowsContent = useWorkshopStore((s) => s.persistLogicFlowsContent);
  const generateLogicFlows = useWorkshopStore((s) => s.generateLogicFlows);
  const setInfraContent = useWorkshopStore((s) => s.setInfraContent);
  const persistInfraContent = useWorkshopStore((s) => s.persistInfraContent);
  const generateInfra = useWorkshopStore((s) => s.generateInfra);
  const generateSpec = useWorkshopStore((s) => s.generateSpec);
  const generateTasks = useWorkshopStore((s) => s.generateTasks);
  const persistSpecContent = useWorkshopStore((s) => s.persistSpecContent);
  const setSpecContent = useWorkshopStore((s) => s.setSpecContent);
  const persistTasksContent = useWorkshopStore((s) => s.persistTasksContent);
  const setUxUiGuideContent = useWorkshopStore((s) => s.setUxUiGuideContent);
  const fetchConformance = useWorkshopStore((s) => s.fetchConformance);
  const confirmDeliverable = useWorkshopStore((s) => s.confirmDeliverable);
  const discardDeliverable = useWorkshopStore((s) => s.discardDeliverable);
  const setDbgaContent = useWorkshopStore((s) => s.setDbgaContent);
  const persistDbgaContent = useWorkshopStore((s) => s.persistDbgaContent);
  const clearDbgaContent = useWorkshopStore((s) => s.clearDbgaContent);
  const generateBenchmark = useWorkshopStore((s) => s.generateBenchmark);
  const generateMddFromBenchmark = useWorkshopStore((s) => s.generateMddFromBenchmark);
  const mddJustGeneratedFromBenchmark = useWorkshopStore((s) => s.mddJustGeneratedFromBenchmark);
  const clearMddJustGeneratedFromBenchmark = useWorkshopStore((s) => s.clearMddJustGeneratedFromBenchmark);
  const phase0DeepResearch = useWorkshopStore((s) => s.phase0DeepResearch);
  const clearPhase0SummaryContent = useWorkshopStore((s) => s.clearPhase0SummaryContent);
  const setPhase0SummaryContent = useWorkshopStore((s) => s.setPhase0SummaryContent);
  const persistPhase0SummaryContent = useWorkshopStore((s) => s.persistPhase0SummaryContent);
  const persistUxUiGuideContent = useWorkshopStore((s) => s.persistUxUiGuideContent);
  const persistArchitectureContent = useWorkshopStore((s) => s.persistArchitectureContent);
  const persistUseCasesContent = useWorkshopStore((s) => s.persistUseCasesContent);
  const persistUserStoriesContent = useWorkshopStore((s) => s.persistUserStoriesContent);
  const generateArchitecture = useWorkshopStore((s) => s.generateArchitecture);
  const generateUseCases = useWorkshopStore((s) => s.generateUseCases);
  const generateUserStories = useWorkshopStore((s) => s.generateUserStories);
  const [mddViewMode, setMddViewMode] = useState<"preview" | "source">("preview");
  const [benchmarkViewMode, setBenchmarkViewMode] = useState<"preview" | "source">("preview");
  const [specViewMode, setSpecViewMode] = useState<"preview" | "source">("preview");
  const [phase0SummaryViewMode, setPhase0SummaryViewMode] = useState<"preview" | "source">("preview");
  /** Última idea usada al generar benchmark; se reutiliza en Deep Research para extraer URLs del texto */
  const [lastBenchmarkIdea, setLastBenchmarkIdea] = useState("");
  const [blueprintViewMode, setBlueprintViewMode] = useState<"preview" | "source">("preview");
  const [apiContractsViewMode, setApiContractsViewMode] = useState<"preview" | "source">("preview");
  const [logicFlowsViewMode, setLogicFlowsViewMode] = useState<"preview" | "source">("preview");
  const [infraViewMode, setInfraViewMode] = useState<"preview" | "source">("preview");
  const [uxUiGuideViewMode, setUxUiGuideViewMode] = useState<"preview" | "source">("preview");
  const [architectureViewMode, setArchitectureViewMode] = useState<"preview" | "source">("preview");
  const [useCasesViewMode, setUseCasesViewMode] = useState<"preview" | "source">("preview");
  const [userStoriesViewMode, setUserStoriesViewMode] = useState<"preview" | "source">("preview");
  const [conformanceUseLlm, setConformanceUseLlm] = useState(false);
  const centralPanel = useWorkshopStore((s) => s.activePanel);
  const setCentralPanel = useWorkshopStore((s) => s.setActivePanel);
  const [isGeneratingDeliverables, setIsGeneratingDeliverables] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [focusedGaps, setFocusedGaps] = useState<{ label: string; gaps: string[] } | null>(null);
  const initialPanelSetForProject = useRef<string | null>(null);

  const handleGenerateDeliverables = useCallback(async () => {
    if (!projectId || !canGenerate || isGeneratingDeliverables) return;
    setIsGeneratingDeliverables(true);
    setError(null);
    try {
      await generateArchitecture(projectId);
      await generateUseCases(projectId);
      await generateUserStories(projectId);
      await generateBlueprint(projectId);
      await generateApiContracts(projectId);
      await generateLogicFlows(projectId);
      await generateInfra(projectId);
      await fetchProject(projectId);
    } finally {
      setIsGeneratingDeliverables(false);
    }
  }, [
    projectId,
    canGenerate,
    isGeneratingDeliverables,
    setError,
    generateArchitecture,
    generateUseCases,
    generateUserStories,
    generateBlueprint,
    generateApiContracts,
    generateLogicFlows,
    generateInfra,
    fetchProject,
  ]);

  const setProjectId = useWorkshopStore((s) => s.setProjectId);
  /* Prevent infinite fetch loop */
  const hasFetchedProject = useRef<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    if (hasFetchedProject.current === projectId) {
      // Si ya se disparó para este ID, solo aseguramos que el store lo tenga
      setProjectId(projectId);
      return;
    }
    hasFetchedProject.current = projectId;
    setProjectId(projectId);
    fetchProject(projectId);
  }, [projectId, setProjectId, fetchProject]);

  useEffect(() => {
    if (!project || project.id !== projectId) return;
    if (initialPanelSetForProject.current === projectId) return;
    initialPanelSetForProject.current = projectId;
    if (!(project.mddContent ?? "").trim() && !(project.dbgaContent ?? "").trim()) {
      setCentralPanel("benchmark");
    }
  }, [project?.id, projectId, project?.mddContent]);



  useEffect(() => {
    if (!projectId || !project || blueprintContent === (project.blueprintContent ?? null)) return;
    const t = setTimeout(() => {
      persistBlueprintContent(blueprintContent ?? "");
    }, 1500);
    return () => clearTimeout(t);
  }, [blueprintContent, projectId, project?.blueprintContent, project, persistBlueprintContent]);

  useEffect(() => {
    if (!projectId || !project || apiContractsContent === (project.apiContractsContent ?? null)) return;
    const t = setTimeout(() => persistApiContractsContent(apiContractsContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [apiContractsContent, projectId, project?.apiContractsContent, project, persistApiContractsContent]);

  useEffect(() => {
    if (!projectId || !project || logicFlowsContent === (project.logicFlowsContent ?? null)) return;
    const t = setTimeout(() => persistLogicFlowsContent(logicFlowsContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [logicFlowsContent, projectId, project?.logicFlowsContent, project, persistLogicFlowsContent]);

  useEffect(() => {
    if (!projectId || !project || infraContent === (project.infraContent ?? null)) return;
    const t = setTimeout(() => persistInfraContent(infraContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [infraContent, projectId, project?.infraContent, project, persistInfraContent]);

  useEffect(() => {
    if (!projectId || !project || architectureContent === (project.architectureContent ?? null)) return;
    const t = setTimeout(() => persistArchitectureContent(architectureContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [architectureContent, projectId, project?.architectureContent, project, persistArchitectureContent]);

  useEffect(() => {
    if (!projectId || !project || useCasesContent === (project.useCasesContent ?? null)) return;
    const t = setTimeout(() => persistUseCasesContent(useCasesContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [useCasesContent, projectId, project?.useCasesContent, project, persistUseCasesContent]);

  useEffect(() => {
    if (!projectId || !project || userStoriesContent === (project.userStoriesContent ?? null)) return;
    const t = setTimeout(() => persistUserStoriesContent(userStoriesContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [userStoriesContent, projectId, project?.userStoriesContent, project, persistUserStoriesContent]);

  useEffect(() => {
    if (!projectId || !project || dbgaContent === (project.dbgaContent ?? null)) return;
    const t = setTimeout(() => persistDbgaContent(dbgaContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [dbgaContent, projectId, project?.dbgaContent, project, persistDbgaContent]);

  const handlePhase0SummaryBlur = useCallback(() => {
    if ((phase0SummaryContent ?? "") !== (project?.phase0SummaryContent ?? "")) {
      persistPhase0SummaryContent(phase0SummaryContent ?? "");
    }
  }, [phase0SummaryContent, project?.phase0SummaryContent, project, persistPhase0SummaryContent]);

  useEffect(() => {
    if (!projectId || !project || phase0SummaryContent === (project.phase0SummaryContent ?? null)) return;
    const t = setTimeout(() => persistPhase0SummaryContent(phase0SummaryContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [phase0SummaryContent, projectId, project?.phase0SummaryContent, project, persistPhase0SummaryContent]);

  useEffect(() => {
    if (!projectId || !project || (uxUiGuideContent ?? "") === (project.uxUiGuideContent ?? "")) return;
    const t = setTimeout(() => persistUxUiGuideContent(uxUiGuideContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [uxUiGuideContent, projectId, project?.uxUiGuideContent, project, persistUxUiGuideContent]);

  const handleSpecBlur = useCallback(() => {
    if ((specContent ?? "") !== (project?.specContent ?? "")) {
      persistSpecContent(specContent ?? "");
    }
  }, [specContent, project?.specContent, project, persistSpecContent]);

  useEffect(() => {
    if (!projectId || !project || (specContent ?? "") === (project.specContent ?? "")) return;
    const t = setTimeout(() => persistSpecContent(specContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [specContent, projectId, project?.specContent, project, persistSpecContent]);

  const handleBlueprintBlur = useCallback(() => {
    if (blueprintContent != null) persistBlueprintContent(blueprintContent);
  }, [blueprintContent, persistBlueprintContent]);

  const handleApiContractsBlur = useCallback(() => {
    if (apiContractsContent != null) persistApiContractsContent(apiContractsContent);
  }, [apiContractsContent, persistApiContractsContent]);

  const handleLogicFlowsBlur = useCallback(() => {
    if (logicFlowsContent != null) persistLogicFlowsContent(logicFlowsContent);
  }, [logicFlowsContent, persistLogicFlowsContent]);

  const handleInfraBlur = useCallback(() => {
    if (infraContent != null) persistInfraContent(infraContent);
  }, [infraContent, persistInfraContent]);

  const handleBenchmarkBlur = useCallback(() => {
    if (dbgaContent != null) persistDbgaContent(dbgaContent);
  }, [dbgaContent, persistDbgaContent]);

  const handleUxUiGuideBlur = useCallback(() => {
    if (uxUiGuideContent != null) persistUxUiGuideContent(uxUiGuideContent);
  }, [uxUiGuideContent, persistUxUiGuideContent]);

  const handleArchitectureBlur = useCallback(() => {
    if (architectureContent != null) persistArchitectureContent(architectureContent);
  }, [architectureContent, persistArchitectureContent]);

  const handleUseCasesBlur = useCallback(() => {
    if (useCasesContent != null) persistUseCasesContent(useCasesContent);
  }, [useCasesContent, persistUseCasesContent]);

  const handleUserStoriesBlur = useCallback(() => {
    if (userStoriesContent != null) persistUserStoriesContent(userStoriesContent);
  }, [userStoriesContent, persistUserStoriesContent]);

  const mddDirty = (mddContent ?? "") !== (project?.mddContent ?? "");
  const mddEmpty = !(mddContent ?? "").trim();
  const precisionScore = mddEmpty ? 0 : (liveMetrics?.precision ?? project?.precisionScore ?? 0);
  const costDisplayFallback = calculateCostFromMdd(mddContent, {
    status: projectStatus,
    infraContent: project?.infraContent ?? infraContent,
  });
  const costDisplay = mddEmpty
    ? {
      totalMxn: costDisplayFallback.totalMxn,
      totalMxnMarket: costDisplayFallback.totalMxn,
      totalHours: costDisplayFallback.totalHours,
      teamStructure: costDisplayFallback.teamStructure,
      rolesHours: { architect: 0, back: 0, front: 0 } as Record<string, number>,
    }
    : liveMetrics
      ? {
        totalMxn: liveMetrics.totalMXN,
        totalMxnMarket: liveMetrics.totalMXNMarket,
        totalHours: liveMetrics.totalHours,
        teamStructure: liveMetrics.roles as Record<string, number>,
        rolesHours: liveMetrics.rolesHours as Record<string, number>,
      }
      : {
        ...costDisplayFallback,
        totalMxnMarket: costDisplayFallback.totalMxn,
        rolesHours: {} as Record<string, number>,
      };

  const calculatedStatus = precisionScore < 50 ? "red" : precisionScore < 80 ? "yellow" : "green";
  const effectiveStatus = mddEmpty ? "red" : calculatedStatus;
  const semaphoreConfig =
    effectiveStatus === "red"
      ? {
        icon: Lock,
        color: "text-rose-500",
        bg: "bg-rose-500/10",
        label: "Crítico",
        border: "border-rose-500/20",
        glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]"
      }
      : effectiveStatus === "yellow"
        ? {
          icon: AlertTriangle,
          color: "text-amber-400",
          bg: "bg-amber-400/10",
          label: "Advertencia",
          border: "border-amber-500/20",
          glow: "shadow-[0_0_20px_rgba(245,158,11,0.15)]"
        }
        : {
          icon: CheckCircle2,
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
          label: "Aprobado",
          border: "border-emerald-500/20",
          glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]"
        };

  const SemaphoreIcon = semaphoreConfig.icon;

  if (error && !project) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="text-amber-400 hover:underline"
            >
              Volver
            </button>
          )}
        </div>
      </div>
    );
  }

  if (projectId && !project) {
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-amber-400" />
        <p className="text-zinc-400">Cargando proyecto…</p>
        {onBack && (
          <button
            onClick={onBack}
            className="text-amber-400 hover:underline text-sm"
          >
            Volver
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 animate-fade-in overflow-hidden">
      <header className="glass-panel sticky top-0 z-40 flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all duration-200"
              aria-label="Volver"
            >
              <X className="w-5 h-5 rotate-90" />
            </button>
          )}
          <div className="flex flex-col">
            <h1 className="text-xl font-bold bg-gradient-to-r from-amber-400 to-brand-400 bg-clip-text text-transparent">
              {projectName ?? project?.name ?? "Workshop"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                {synced ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    Sincronizado
                  </>
                ) : (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Sincronizando…
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            const ok = await downloadDocumentsZip(
              {
                dbgaContent: dbgaContent ?? project?.dbgaContent ?? null,
                phase0SummaryContent: phase0SummaryContent ?? project?.phase0SummaryContent ?? null,
                specContent: specContent ?? project?.specContent ?? null,
                mddContent: mddContent ?? project?.mddContent ?? "",
                uxUiGuideContent: uxUiGuideContent ?? project?.uxUiGuideContent ?? null,
                blueprintContent: blueprintContent ?? project?.blueprintContent ?? null,
                apiContractsContent: apiContractsContent ?? project?.apiContractsContent ?? null,
                logicFlowsContent: logicFlowsContent ?? project?.logicFlowsContent ?? null,
                tasksContent: tasksContent ?? project?.tasksContent ?? null,
                infraContent: infraContent ?? project?.infraContent ?? null,
              },
              projectName ?? project?.name ?? "Workshop",
            );
            if (ok) setError(null);
            else setError("No hay documentos con contenido para descargar.");
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 hover:text-amber-400 hover:bg-white/10 hover:border-amber-500/30 transition-all duration-300 text-sm font-medium"
          title="Descargar todos los documentos del proyecto en un ZIP"
        >
          <Download className="w-4 h-4" />
          <span>Exportar Todo</span>
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-4 glass-card border-red-500/20 bg-red-500/5 flex items-center justify-between gap-4 animate-slide-up">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => useWorkshopStore.getState().setError(null)}
            className="p-1.5 hover:bg-white/10 rounded-lg text-red-300 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[380px_1fr_320px] lg:grid-cols-[420px_1fr_360px] relative">
        {/* Columna A: Chat */}
        <section className="flex flex-col border-r border-white/5 min-h-0 overflow-hidden bg-zinc-950/30 backdrop-blur-sm">
          <ChatContainer
            projectId={projectId}
            activeTab={centralPanel as import("../components/ChatContainer").ActiveTab}
            embedded={false}
            benchmarkMode={
              centralPanel === "benchmark"
                ? {
                  hasBenchmark: !!dbgaContent?.trim(),
                  onGenerateBenchmark: (idea) => {
                    setLastBenchmarkIdea(idea);
                    generateBenchmark(projectId, idea);
                    setTimeout(() => {
                      fetchEstimation(projectId).catch(() => { });
                      fetchAdrs(projectId).catch(() => { });
                      fetchConformance(projectId).catch(() => { });
                    }, 0);
                  },
                }
                : undefined
            }
          />
        </section>

        {/* Columna B: Contenido del tab */}
        <section className="flex flex-col min-w-0 min-h-0 border-r border-white/5 overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,0.3)]">
          <div className="px-6 py-4 glass-panel border-x-0 border-t-0 flex flex-col gap-4 text-zinc-400 text-sm shrink-0">
            {/* Renglón 1: Navegación Estilo iOS/SaaS */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1 -mx-2 px-2">
              {(() => {
                const getTabClass = (id: string, content: any) => {
                  const isActive = centralPanel === id;
                  const hasContent = !!String(content || "").trim();

                  const baseClasses = "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-300 shrink-0";

                  if (!hasContent) {
                    if (id === "benchmark" || id === "spec") {
                      return `${baseClasses} ${isActive
                        ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"}`;
                    }
                    const hasMdd = !!(mddContent || "").trim();
                    if (hasMdd) {
                      return `${baseClasses} bg-red-500/10 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20 ${isActive ? "ring-red-500/50" : ""}`;
                    }
                    return `${baseClasses} ${isActive ? "bg-white/10 text-amber-400" : "text-zinc-600 hover:bg-white/5"}`;
                  }

                  return `${baseClasses} ${isActive
                    ? "bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/40"
                    : "text-zinc-300 hover:bg-white/5 hover:text-white"}`;
                };

                return (
                  <div className="flex items-center gap-1.5 p-1 bg-black/20 rounded-2xl ring-1 ring-white/5">
                    <button
                      type="button"
                      onClick={() => setCentralPanel("benchmark")}
                      className={getTabClass("benchmark", (phase0SummaryContent || "") + (dbgaContent || ""))}
                    >
                      <Target className="w-3.5 h-3.5" />
                      Paso 0
                    </button>
                    <button
                      type="button"
                      onClick={() => setCentralPanel("mdd")}
                      className={getTabClass("mdd", mddContent)}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      MDD
                    </button>
                    <button
                      type="button"
                      onClick={() => setCentralPanel("spec")}
                      className={getTabClass("spec", specContent)}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      Spec
                    </button>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    <button
                      type="button"
                      onClick={() => setCentralPanel("architecture")}
                      className={getTabClass("architecture", architectureContent)}
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      Arq.
                    </button>
                    <button
                      type="button"
                      onClick={() => setCentralPanel("blueprint")}
                      className={getTabClass("blueprint", blueprintContent)}
                    >
                      <LayoutTemplate className="w-3.5 h-3.5" />
                      Blueprint
                    </button>
                    <button
                      type="button"
                      onClick={() => setCentralPanel("ux-ui-guide")}
                      className={getTabClass("ux-ui-guide", uxUiGuideContent)}
                    >
                      <Palette className="w-3.5 h-3.5" />
                      Guía UX
                    </button>
                    <button
                      type="button"
                      onClick={() => setCentralPanel("api-contracts")}
                      className={getTabClass("api-contracts", apiContractsContent)}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      API
                    </button>
                    <button
                      type="button"
                      onClick={() => setCentralPanel("infra")}
                      className={getTabClass("infra", infraContent)}
                    >
                      <Server className="w-3.5 h-3.5" />
                      Infra
                    </button>
                  </div>
                );
              })()}
            </div>


            {/* Renglón 2: Texto del flujo y botones de acción */}
            <div className="flex items-center justify-between gap-1 border-t border-zinc-800 pt-2">
              <p className="text-xs text-zinc-500">
                Orden: Paso 0 → MDD → Spec → Arq. → Casos → H.U. → Blueprint → Guía UX/UI → API → Flujos → Tasks → Infra
              </p>
              <div className="flex items-center gap-2">
                {centralPanel !== "benchmark" && (["spec", "mdd", "ux-ui-guide", "blueprint", "tasks", "api-contracts", "logic-flows", "architecture", "use-cases", "user-stories", "infra"] as const).includes(
                  centralPanel as any,
                ) && (
                    (centralPanel === "spec" ||
                      centralPanel === "mdd" ||
                      centralPanel === "ux-ui-guide" ||
                      (centralPanel === "blueprint" && blueprintContent) ||
                      (centralPanel === "tasks" && tasksContent) ||
                      (centralPanel === "api-contracts" && apiContractsContent) ||
                      (centralPanel === "architecture" && architectureContent) ||
                      (centralPanel === "use-cases" && useCasesContent) ||
                      (centralPanel === "user-stories" && userStoriesContent) ||
                      (centralPanel === "logic-flows" && logicFlowsContent) ||
                      (centralPanel === "infra" && infraContent)) &&
                    centralPanel !== "tasks" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (centralPanel === "mdd") setMddViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "spec") setSpecViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "architecture") setArchitectureViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "use-cases") setUseCasesViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "user-stories") setUserStoriesViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "ux-ui-guide") setUxUiGuideViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "blueprint") setBlueprintViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "api-contracts") setApiContractsViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "logic-flows") setLogicFlowsViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "infra") setInfraViewMode((m) => (m === "preview" ? "source" : "preview"));
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50"
                      >
                        {(centralPanel === "mdd" ? mddViewMode
                          : centralPanel === "spec" ? specViewMode
                            : centralPanel === "architecture" ? architectureViewMode
                              : centralPanel === "use-cases" ? useCasesViewMode
                                : centralPanel === "user-stories" ? userStoriesViewMode
                                  : centralPanel === "ux-ui-guide" ? uxUiGuideViewMode
                                    : centralPanel === "blueprint" ? blueprintViewMode
                                      : centralPanel === "api-contracts" ? apiContractsViewMode
                                        : centralPanel === "logic-flows" ? logicFlowsViewMode
                                          : infraViewMode) === "preview" ? (
                          <>
                            <Code className="w-4 h-4" />
                            Ver fuente
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            Ver previsualización
                          </>
                        )}
                      </button>
                    )
                  )}
                {centralPanel === "architecture" && (
                  <button
                    type="button"
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !mddContent?.trim()}
                    title="Generar arquitectura desde el MDD"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {architectureContent?.trim() ? "Regenerar" : "Generar"}
                  </button>
                )}
                {centralPanel === "use-cases" && (
                  <button
                    type="button"
                    onClick={() => generateUseCases(projectId)}
                    disabled={loading || !mddContent?.trim()}
                    title="Generar casos de uso desde el MDD"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {useCasesContent?.trim() ? "Regenerar" : "Generar"}
                  </button>
                )}
                {centralPanel === "user-stories" && (
                  <button
                    type="button"
                    onClick={() => generateUserStories(projectId)}
                    disabled={loading || !mddContent?.trim()}
                    title="Generar historias de usuario desde el MDD"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {userStoriesContent?.trim() ? "Regenerar" : "Generar"}
                  </button>
                )}
                {centralPanel === "blueprint" && (
                  <button
                    type="button"
                    onClick={() => generateBlueprint(projectId, { preview: true })}
                    disabled={loading || mddReviewing || !mddContent?.trim()}
                    title="Generar blueprint desde el MDD (vista previa antes de guardar)"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generar
                  </button>
                )}
                {centralPanel === "api-contracts" && (
                  <button
                    type="button"
                    onClick={() => generateApiContracts(projectId, { preview: true })}
                    disabled={loading || mddReviewing || !mddContent?.trim()}
                    title="Generar contratos API desde el MDD (vista previa antes de guardar)"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generar
                  </button>
                )}
                {centralPanel === "logic-flows" && (
                  <button
                    type="button"
                    onClick={() => generateLogicFlows(projectId)}
                    disabled={loading || mddReviewing || !mddContent?.trim()}
                    title="Regenerar flujos de lógica desde el MDD"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerar
                  </button>
                )}
                {centralPanel === "infra" && (
                  <button
                    type="button"
                    onClick={() => generateInfra(projectId, { preview: true })}
                    disabled={loading || mddReviewing || !mddContent?.trim()}
                    title="Generar infraestructura desde el MDD (vista previa antes de guardar)"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerar
                  </button>
                )}
                {centralPanel === "spec" && (
                  <button
                    type="button"
                    onClick={() => generateSpec(projectId)}
                    disabled={loading}
                    title="Regenerar Spec desde Benchmark y alcance"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerar
                  </button>
                )}
                {centralPanel === "tasks" && (
                  <button
                    type="button"
                    onClick={() => generateTasks(projectId)}
                    disabled={loading || !mddContent?.trim() || !blueprintContent?.trim()}
                    title="Regenerar Tasks desde MDD y Blueprint"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerar
                  </button>
                )}
                {centralPanel === "ux-ui-guide" && (
                  <button
                    type="button"
                    onClick={() =>
                      sendMessage(
                        "Genera la Guía UX/UI completa a partir del MDD y Blueprint del proyecto. Incluye: patrón/estilo, paleta y tokens de color, tipografía, espaciado y grid, componentes de referencia, prioridades de UX, criterios de accesibilidad (WCAG, contraste 4.5:1, teclado, touch 44px) y anti-patrones a evitar. Responde con el documento seguido de ---FIN_UX_UI--- y un mensaje breve.",
                        "ux-ui-guide",
                      )
                    }
                    disabled={loading || !mddContent?.trim() || !blueprintContent?.trim()}
                    title="Generar o regenerar la Guía UX/UI desde el MDD (se envía al chat)"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {(uxUiGuideContent ?? "").trim() ? "Regenerar" : "Generar"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 min-h-0 flex flex-col min-w-0">
            {centralPanel === "benchmark" && (
              <>
                {loading && loadingReason === "phase0-deep-research" && (
                  <div className="shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 mb-2 text-amber-200/90 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Generando Deep Research… Suele tardar 1–2 minutos; no cierres la página.</span>
                  </div>
                )}
                {dbgaContent != null && dbgaContent !== "" && (
                  <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-700 mt-4 pt-4">
                    <h3 className="shrink-0 text-sm font-medium text-zinc-400 mb-2">Benchmark (DBGA)</h3>
                    <div className="shrink-0 flex items-center justify-end gap-2 mb-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setBenchmarkViewMode((m) => (m === "preview" ? "source" : "preview"))}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm"
                      >
                        {benchmarkViewMode === "preview" ? (
                          <><Code className="w-4 h-4" /> Ver fuente</>
                        ) : (
                          <><FileText className="w-4 h-4" /> Ver previsualización</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await phase0DeepResearch(projectId, {
                            userIdea: lastBenchmarkIdea.trim() || undefined,
                            includeBenchmark: true,
                          });
                        }}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm disabled:opacity-50"
                        title="Generar documento de resumen (deep research); puede tardar 1–2 min"
                      >
                        {loading && loadingReason === "phase0-deep-research" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        {loading && loadingReason === "phase0-deep-research" ? "Generando…" : "Generar Deep Research"}
                      </button>
                      <span className="text-zinc-500 text-xs self-center">(puede tardar 1–2 min)</span>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await generateMddFromBenchmark(projectId);
                          if (result) setCentralPanel("mdd");
                        }}
                        disabled={loading && loadingReason === "mdd"}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-amber-400 hover:bg-amber-500/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generar la Constitución del proyecto (MDD) desde el Benchmark con agentes; luego revisa en la pestaña MDD"
                      >
                        {loading && loadingReason === "mdd" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Generar MDD con agentes
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCentralPanel("mdd");
                          fetchWelcome(projectId, "mdd");
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm"
                        title="Ir a MDD y editar manualmente o usar el chat"
                      >
                        Ir a MDD (editar)
                      </button>
                      <button
                        type="button"
                        onClick={() => projectId && clearDbgaContent(projectId)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 text-sm"
                        title="Borrar el Benchmark (podrás generar uno nuevo después)"
                      >
                        <Trash2 className="w-4 h-4" />
                        Borrar benchmark
                      </button>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                      {benchmarkViewMode === "preview" ? (
                        <div className="flex-1 min-h-[200px] overflow-auto">
                          <MddViewer content={dbgaContent} />
                        </div>
                      ) : (
                        <textarea
                          value={dbgaContent}
                          onChange={(e) => setDbgaContent(e.target.value)}
                          onBlur={handleBenchmarkBlur}
                          placeholder="# Domain Benchmark & Gap Analysis..."
                          className="flex-1 min-h-[200px] w-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                          spellCheck={false}
                        />
                      )}
                    </div>
                  </div>
                )}
                {phase0SummaryContent != null && phase0SummaryContent !== "" && (
                  <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-700 mt-4 pt-4">
                    <h3 className="shrink-0 text-sm font-medium text-zinc-400 mb-2">Resumen Deep Research</h3>
                    <div className="shrink-0 flex items-center justify-end gap-2 mb-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPhase0SummaryViewMode((m) => (m === "preview" ? "source" : "preview"))}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm"
                      >
                        {phase0SummaryViewMode === "preview" ? (
                          <><Code className="w-4 h-4" /> Ver fuente</>
                        ) : (
                          <><FileText className="w-4 h-4" /> Ver previsualización</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => projectId && clearPhase0SummaryContent(projectId)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 text-sm"
                        title="Borrar el resumen Deep Research (podrás generar uno nuevo después)"
                      >
                        <Trash2 className="w-4 h-4" />
                        Borrar resumen
                      </button>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                      {phase0SummaryViewMode === "preview" ? (
                        <div className="flex-1 min-h-[200px] overflow-auto">
                          <MddViewer content={phase0SummaryContent ?? ""} />
                        </div>
                      ) : (
                        <textarea
                          value={phase0SummaryContent ?? ""}
                          onChange={(e) => setPhase0SummaryContent(e.target.value || null)}
                          onBlur={handlePhase0SummaryBlur}
                          placeholder="# Resumen Deep Research..."
                          className="flex-1 min-h-[200px] w-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                          spellCheck={false}
                        />
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            {centralPanel === "mdd" && (
              <>
                {mddJustGeneratedFromBenchmark && (
                  <div className="shrink-0 flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-green-500/10 border border-green-500/30 mb-3">
                    <span className="text-sm text-green-200/90">
                      Revisa el MDD en esta pestaña y refina con el chat si algo no cuadra.
                    </span>
                    <button
                      type="button"
                      onClick={clearMddJustGeneratedFromBenchmark}
                      className="shrink-0 px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 text-sm"
                      aria-label="Cerrar aviso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {mddDirty && (
                  <div className="shrink-0 flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-3">
                    <span className="text-sm text-amber-200/90">Tienes cambios sin guardar. Graba para revisar consistencia (ER, etc.).</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => revertMddContent()}
                        disabled={mddReviewing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-300 hover:text-zinc-100 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-4 h-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => persistAndReviewMdd()}
                        disabled={mddReviewing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/80 text-zinc-900 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {mddReviewing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {mddReviewing ? "Grabando y revisando…" : "Grabar"}
                      </button>
                    </div>
                  </div>
                )}
                {mddViewMode === "preview" ? (
                  <MddViewer content={mddContent || ""} />
                ) : (
                  <textarea
                    value={mddContent}
                    onChange={(e) => setMddContent(e.target.value)}
                    placeholder="# Master Design Doc\n\nEl contenido del MDD se irá generando aquí..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
              </>
            )}
            {centralPanel === "architecture" && (
              <>
                {architectureViewMode === "preview" ? (
                  <MddViewer content={architectureContent || ""} />
                ) : (
                  <textarea
                    value={architectureContent ?? ""}
                    onChange={(e) => useWorkshopStore.getState().setArchitectureContent(e.target.value)}
                    onBlur={handleArchitectureBlur}
                    placeholder="# Arquitectura del Sistema\n\nDefine aquí los patrones, componentes y orquestación de agentes..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !mddContent?.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {architectureContent?.trim() ? "Regenerar" : "Generar"} desde MDD
                  </button>
                </div>
              </>
            )}
            {centralPanel === "use-cases" && (
              <>
                {useCasesViewMode === "preview" ? (
                  <MddViewer content={useCasesContent || ""} />
                ) : (
                  <textarea
                    value={useCasesContent ?? ""}
                    onChange={(e) => useWorkshopStore.getState().setUseCasesContent(e.target.value)}
                    onBlur={handleUseCasesBlur}
                    placeholder="# Casos de Uso\n\nDescribe los escenarios de interacción y flujos transaccionales..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateUseCases(projectId)}
                    disabled={loading || !mddContent?.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {useCasesContent?.trim() ? "Regenerar" : "Generar"} desde MDD
                  </button>
                </div>
              </>
            )}
            {centralPanel === "user-stories" && (
              <>
                {userStoriesViewMode === "preview" ? (
                  <MddViewer content={userStoriesContent || ""} />
                ) : (
                  <textarea
                    value={userStoriesContent ?? ""}
                    onChange={(e) => useWorkshopStore.getState().setUserStoriesContent(e.target.value)}
                    onBlur={handleUserStoriesBlur}
                    placeholder="# Historias de Usuario\n\nDefine los requisitos en formato Agile (Como... quiero... para...)..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateUserStories(projectId)}
                    disabled={loading || !mddContent?.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {userStoriesContent?.trim() ? "Regenerar" : "Generar"} desde MDD
                  </button>
                </div>
              </>
            )}
            {centralPanel === "ux-ui-guide" && (
              <>
                {uxUiGuideViewMode === "preview" ? (
                  <MddViewer content={uxUiGuideContent ?? ""} />
                ) : (
                  <textarea
                    value={uxUiGuideContent ?? ""}
                    onChange={(e) => setUxUiGuideContent(e.target.value || null)}
                    onBlur={handleUxUiGuideBlur}
                    placeholder="# Guía UX/UI\n\nConversa con la IA sobre marca, estilos, prioridades y componentes; el contenido se irá generando aquí."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      sendMessage(
                        "Genera la Guía UX/UI completa a partir del MDD y Blueprint del proyecto. Incluye: patrón/estilo, paleta y tokens de color, tipografía, espaciado y grid, componentes de referencia, prioridades de UX, criterios de accesibilidad (WCAG, contraste 4.5:1, teclado, touch 44px) y anti-patrones a evitar. Responde con el documento seguido de ---FIN_UX_UI--- y un mensaje breve.",
                        "ux-ui-guide",
                      )
                    }
                    disabled={loading || !mddContent?.trim() || !blueprintContent?.trim()}
                    title="Generar o regenerar la Guía UX/UI desde el MDD (se envía al chat)"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {(uxUiGuideContent ?? "").trim() ? "Regenerar" : "Generar"} guía
                  </button>
                </div>
              </>
            )}
            {centralPanel === "spec" && (
              specContent || specViewMode === "source" ? (
                specViewMode === "preview" ? (
                  <div className="flex flex-col gap-2 h-full min-h-0">
                    <MddViewer content={specContent || ""} />
                    <div className="self-end flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => generateSpec(projectId)}
                        disabled={loading}
                        title="Regenerar Spec desde Benchmark y alcance"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Regenerar
                      </button>
                      <button
                        type="button"
                        onClick={() => persistSpecContent(specContent || "")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm"
                      >
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={specContent || ""}
                    onChange={(e) => setSpecContent(e.target.value)}
                    onBlur={handleSpecBlur}
                    placeholder="# Spec\n\nEl contenido del Spec se genera aquí o puedes escribirlo manualmente..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )
              ) : (
                <DocEmptyState
                  icon={ListOrdered}
                  title="Spec"
                  description="Spec = Benchmark + alcance. Alimenta el MDD; revísalo antes de dar por cerrado el MDD."
                  onGenerate={() => generateSpec(projectId)}
                  loading={loading}
                  hasMdd={!!(dbgaContent?.trim())}
                />
              )
            )}
            {centralPanel === "blueprint" && (
              blueprintContent ? (
                blueprintViewMode === "preview" ? (
                  <MddViewer content={blueprintContent} />
                ) : (
                  <textarea
                    value={blueprintContent}
                    onChange={(e) => setBlueprintContent(e.target.value)}
                    onBlur={handleBlueprintBlur}
                    placeholder="# Blueprint\n\nEl contenido del blueprint se genera desde el MDD..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )
              ) : (
                <DocEmptyState
                  icon={LayoutTemplate}
                  title="Blueprint"
                  description="El blueprint se genera a partir del MDD guardado (vista previa antes de guardar)."
                  onGenerate={() => generateBlueprint(projectId, { preview: true })}
                  loading={loading || mddReviewing}
                  hasMdd={!!mddContent?.trim()}
                />
              )
            )}
            {centralPanel === "tasks" && (
              tasksContent ? (
                <div className="flex flex-col gap-2 h-full min-h-0">
                  <MddViewer content={tasksContent} />
                  <div className="self-end flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => generateTasks(projectId)}
                      disabled={loading || !mddContent?.trim() || !blueprintContent?.trim()}
                      title="Regenerar Tasks desde MDD y Blueprint"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Regenerar
                    </button>
                    <button
                      type="button"
                      onClick={() => persistTasksContent(tasksContent)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm"
                    >
                      <Save className="w-4 h-4" />
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <DocEmptyState
                  icon={ListTodo}
                  title="Tasks"
                  description="Breakdown desde MDD + Blueprint."
                  onGenerate={() => generateTasks(projectId)}
                  loading={loading}
                  hasMdd={!!(mddContent?.trim() && blueprintContent?.trim())}
                />
              )
            )}
            {centralPanel === "api-contracts" && (
              apiContractsContent ? (
                apiContractsViewMode === "preview" ? (
                  <MddViewer content={apiContractsContent} />
                ) : (
                  <textarea
                    value={apiContractsContent}
                    onChange={(e) => setApiContractsContent(e.target.value)}
                    onBlur={handleApiContractsBlur}
                    placeholder="# Contratos de API (OpenAPI/Swagger)\n\n..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )
              ) : (
                <DocEmptyState
                  icon={FileCode}
                  title="Contratos de API"
                  description="OpenAPI/Swagger desde el MDD (vista previa antes de guardar)."
                  onGenerate={() => generateApiContracts(projectId, { preview: true })}
                  loading={loading || mddReviewing}
                  hasMdd={!!mddContent?.trim()}
                />
              )
            )}
            {centralPanel === "logic-flows" && (
              logicFlowsContent ? (
                logicFlowsViewMode === "preview" ? (
                  <MddViewer content={logicFlowsContent} />
                ) : (
                  <textarea
                    value={logicFlowsContent}
                    onChange={(e) => setLogicFlowsContent(e.target.value)}
                    onBlur={handleLogicFlowsBlur}
                    placeholder="# Casos de Uso y Flujos de Lógica\n\n..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )
              ) : (
                <DocEmptyState
                  icon={GitBranch}
                  title="Casos de Uso y Flujos"
                  description="Diagramas de secuencia, MFA y reglas de validación desde el MDD."
                  onGenerate={() => generateLogicFlows(projectId)}
                  loading={loading || mddReviewing}
                  hasMdd={!!mddContent?.trim()}
                />
              )
            )}
            {centralPanel === "infra" && (
              infraContent ? (
                infraViewMode === "preview" ? (
                  <MddViewer content={infraContent} />
                ) : (
                  <textarea
                    value={infraContent}
                    onChange={(e) => setInfraContent(e.target.value)}
                    onBlur={handleInfraBlur}
                    placeholder="# Infraestructura y Despliegue\n\n..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )
              ) : (
                <DocEmptyState
                  icon={Server}
                  title="Infraestructura y Despliegue"
                  description="Dockerfile, docker-compose desde el MDD (vista previa antes de guardar)."
                  onGenerate={() => generateInfra(projectId, { preview: true })}
                  loading={loading || mddReviewing}
                  hasMdd={!!mddContent?.trim()}
                />
              )
            )}
            {centralPanel === "adrs" && (
              <div className="flex flex-col gap-6 h-full min-h-0 overflow-auto">
                <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-amber-400">Decisiones Arquitectónicas (ADRs)</h3>
                    <p className="text-sm text-zinc-400">Historial de decisiones persistidas en el Grafo de Memoria Semántica.</p>
                  </div>
                  <button
                    onClick={() => projectId && fetchAdrs(projectId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Actualizar
                  </button>
                </div>

                {adrs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                    <Brain className="w-12 h-12 mb-4 text-zinc-600" />
                    <p className="text-zinc-400">No hay decisiones guardadas aún para este proyecto.</p>
                    <p className="text-xs text-zinc-500 mt-2">Las decisiones se extraen automáticamente al finalizar el MDD.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {adrs.map((adr, i) => (
                      <div key={i} className="p-4 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-amber-500/50 transition-colors shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-zinc-100 flex items-center gap-2">
                            <CheckCircle2 className={`w-4 h-4 ${adr.status === 'Accepted' ? 'text-green-500' : 'text-amber-500'}`} />
                            {adr.title}
                          </h4>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${adr.status === 'Accepted' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {adr.status}
                          </span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-bold text-zinc-500 uppercase">Contexto</p>
                            <p className="text-sm text-zinc-300 leading-relaxed">{adr.context}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-zinc-500 uppercase">Consecuencia</p>
                            <p className="text-sm text-zinc-300 leading-relaxed italic border-l-2 border-zinc-600 pl-3">{adr.consequence}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Columna C: Semáforo + Costos */}
        <section className="flex flex-col min-h-0 overflow-y-auto glass-panel border-y-0 border-r-0 p-8 space-y-10 animate-fade-in custom-scrollbar">
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-brand-400" />
              Estado del Diseño
            </h3>
            <div
              className={`relative flex items-center gap-6 rounded-3xl p-6 border transition-all duration-500 group overflow-hidden ${semaphoreConfig.bg} ${semaphoreConfig.border} ${semaphoreConfig.glow}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50" />
              <div className="relative">
                <SemaphoreIcon
                  className={`w-14 h-14 ${semaphoreConfig.color} filter drop-shadow-[0_0_8px_currentColor] animate-pulse-subtle`}
                />
              </div>
              <div className="relative flex-1">
                <p className={`text-xl font-black uppercase tracking-tight leading-none ${semaphoreConfig.color}`}>
                  {semaphoreConfig.label}
                </p>
                <div className="flex flex-col gap-2 mt-4">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <span>Precisión del Agente</span>
                    <span className="font-mono text-zinc-300">{precisionScore}%</span>
                  </div>
                  <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${precisionScore >= 80 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' :
                        precisionScore >= 50 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]' :
                          'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'
                        }`}
                      style={{ width: `${precisionScore}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowAuditModal(true)}
              className="w-full h-12 flex items-center justify-center gap-3 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all duration-300 text-xs font-bold uppercase tracking-widest border border-white/5 group active:scale-[0.98]"
            >
              <FileText className="w-4 h-4 transition-transform group-hover:scale-110" />
              Análisis Detallado
            </button>
          </div>

          {conformance && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
                  Consistencia vs MDD
                </h3>
                <label className="flex items-center gap-2 text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={conformanceUseLlm}
                    onChange={(e) => {
                      setConformanceUseLlm(e.target.checked);
                      fetchConformance(projectId!, { useLlm: e.target.checked });
                    }}
                    className="w-3 h-3 rounded border-white/10 bg-black/40 text-brand-500 focus:ring-brand-500/50"
                  />
                  Smart Audit (IA)
                </label>
              </div>

              <div className="glass-panel border-white/5 rounded-3xl p-2 space-y-1">
                {[
                  { label: "Blueprint", icon: LayoutTemplate, status: conformance.blueprint.ok, gaps: conformance.blueprint.gaps, action: () => generateBlueprint(projectId!, { preview: true, gapsFeedback: conformance!.blueprint.gaps.join("\n") }) },
                  { label: "API", icon: FileCode, status: conformance.api.ok, gaps: [...conformance.api.missingInApi, ...conformance.api.extraInApi], action: () => generateApiContracts(projectId!, { preview: true, gapsFeedback: [...conformance!.api.missingInApi, ...conformance!.api.extraInApi].join("\n") }) },
                  { label: "Infra", icon: Server, status: conformance.infra.ok, gaps: conformance.infra.gaps, action: () => generateInfra(projectId!, { preview: true, gapsFeedback: conformance!.infra.gaps.join("\n") }) }
                ].map((item, idx) => (
                  <div key={idx} className="relative group p-4 rounded-2xl transition-all duration-300 hover:bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl bg-zinc-900 border border-white/5 ${!item.status ? 'text-amber-500/80' : 'text-zinc-600'}`}>
                        <item.icon className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-bold tracking-tight ${item.status ? 'text-zinc-400' : 'text-zinc-200'}`}>
                            {item.label}
                          </span>

                          {item.status ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <div className="flex flex-col items-center">
                              <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse-subtle" />
                              <button
                                onClick={() => setFocusedGaps({ label: item.label, gaps: item.gaps })}
                                className="text-[9px] font-black text-amber-500/50 hover:text-amber-400 uppercase tracking-widest mt-0.5 transition-colors"
                              >
                                Ver
                              </button>
                            </div>
                          )}
                        </div>

                        {!item.status ? (
                          <div className="space-y-2">
                            <p className="text-[10px] font-medium text-amber-500/60 uppercase tracking-wide">
                              Corregir {item.gaps.length} gaps detectados
                            </p>
                            <button
                              type="button"
                              onClick={item.action}
                              disabled={loading || mddReviewing}
                              className="flex items-center gap-2 text-[10px] font-bold text-amber-500 hover:text-amber-400 transition-all active:scale-95 group/btn"
                            >
                              <Play className="w-2.5 h-2.5 transition-transform group/btn:translate-x-0.5" />
                              <span className="underline underline-offset-4 decoration-amber-500/20">Ejecutar Corrección</span>
                            </button>
                          </div>
                        ) : (
                          <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wide">Sin diferencias detectadas</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-brand-400" />
              Estimación Económica
            </h3>
            <div className="glass-card rounded-2xl p-6 space-y-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <TrendingUp className="w-20 h-20" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Esfuerzo Estimado</p>
                <p className="text-2xl font-bold font-mono">{costDisplay.totalHours.toFixed(1)} <span className="text-xs text-zinc-500">Horas Reales</span></p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Costo Operativo (Nómina)</p>
                  <p className="text-2xl font-bold text-amber-500">
                    ${costDisplay.totalMxn.toLocaleString("es-MX")} <span className="text-[10px] text-zinc-500">MXN</span>
                  </p>
                </div>
                <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                  <p className="text-[10px] text-emerald-500/50 uppercase font-bold mb-1">Valor Comercial (Mercado)</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    ${(costDisplay.totalMxnMarket ?? costDisplay.totalMxn).toLocaleString("es-MX")} <span className="text-[10px] text-zinc-500">MXN</span>
                  </p>
                </div>
              </div>

              {costDisplay.teamStructure && Object.keys(costDisplay.teamStructure).length > 0 && (
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[10px] text-zinc-500 uppercase font-bold mb-3 tracking-widest">Equipo Sugerido</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(costDisplay.teamStructure).map(([role, count]) => count ? (
                      <div key={role} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] text-zinc-400">
                        <span className="font-bold text-zinc-200 capitalize">{role}</span>
                        <span className="opacity-50">× {count}</span>
                      </div>
                    ) : null)}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-zinc-500 leading-relaxed italic px-2">
              * Motor de viabilidad activado. El coste se recalcula dinámicamente según la complejidad del MDD y Blueprint.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateDeliverables}
            disabled={!canGenerate || isGeneratingDeliverables || mddReviewing}
            className="w-full py-4 rounded-2xl font-bold transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed bg-brand-500 hover:bg-brand-400 text-white shadow-[0_8px_20px_rgba(17,141,230,0.3)] hover:shadow-[0_12px_24px_rgba(17,141,230,0.4)] hover:-translate-y-0.5 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {isGeneratingDeliverables ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando Entregables…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Finalizar y Generar Entregables
              </>
            )}
          </button>

          {/* Feedback del auditor */}
          {auditorFeedback ? (
            <div className="glass-card bg-zinc-900/40 p-5 rounded-2xl border-white/5 text-[11px] text-zinc-400 leading-relaxed shadow-xl animate-slide-up">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-brand-400" />
                <strong className="text-zinc-100 uppercase tracking-widest">Feedback del Auditor IA</strong>
              </div>
              <div className="prose prose-invert prose-xs max-w-none opacity-80">
                {auditorFeedback}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowAuditModal(false)}>
          <div className="bg-zinc-900 border border-white/5 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-white/5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-brand-400" />
                Análisis de Auditoría
              </h2>
              <button onClick={() => setShowAuditModal(false)} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {/* Sección Desglose */}
              <div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Métricas de Precisión</h3>
                {precisionBreakdown ? (
                  <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/5">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-white/10 text-zinc-400">
                        <tr>
                          <th className="px-5 py-4 font-bold uppercase tracking-tight text-[10px]">Dimensión</th>
                          <th className="px-5 py-4 font-bold uppercase tracking-tight text-[10px]">Agente Responsable</th>
                          <th className="px-5 py-4 font-bold uppercase tracking-tight text-[10px] text-right">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {[
                          { section: "Contexto y alcance", agent: "Clarificador", value: precisionBreakdown.contexto, reasonKey: "contexto" as const },
                          { section: "Modelo de datos", agent: "Architect", value: precisionBreakdown.modeloDatos, reasonKey: "modeloDatos" as const },
                          { section: "Contratos API", agent: "Architect", value: precisionBreakdown.apiContracts, reasonKey: "apiContracts" as const },
                          { section: "Seguridad", agent: "Security Eng.", value: precisionBreakdown.seguridad, reasonKey: "seguridad" as const },
                          { section: "Integración", agent: "Integration Eng.", value: precisionBreakdown.integracion, reasonKey: "integracion" as const },
                        ].map((row, i) => (
                          <tr key={i} className="hover:bg-white/5 transition-colors group">
                            <td className="px-5 py-4">
                              <p className="text-zinc-300 font-medium">{row.section}</p>
                              <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1 group-hover:line-clamp-none transition-all">
                                {precisionBreakdown.sectionReasons?.[row.reasonKey] ?? "Sin observaciones"}
                              </p>
                            </td>
                            <td className="px-5 py-4 text-zinc-500 text-xs">{row.agent}</td>
                            <td className={`px-5 py-4 text-right font-mono font-bold ${(row.value ?? 0) >= 90 ? "text-emerald-400" : (row.value ?? 0) >= 50 ? "text-amber-400" : "text-red-400"}`}>
                              {row.value ?? 0}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-zinc-500 italic text-center py-8">No hay desglose disponible aún.</p>
                )}
              </div>

              {/* Sección Conformidad de Entregables */}
              {conformance && (!conformance.blueprint.ok || !conformance.api.ok || !conformance.infra.ok) && (
                <div>
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Gaps de Conformidad (Entregables)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: "Blueprint", gaps: conformance.blueprint.gaps, ok: conformance.blueprint.ok },
                      { label: "API Contracts", gaps: [...conformance.api.missingInApi, ...conformance.api.extraInApi], ok: conformance.api.ok },
                      { label: "Infraestructura", gaps: conformance.infra.gaps, ok: conformance.infra.ok },
                    ].filter(item => !item.ok).map((item, i) => (
                      <div key={i} className="bg-amber-500/5 rounded-2xl border border-amber-500/10 p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">{item.label}</h4>
                        </div>
                        <ul className="space-y-2">
                          {item.gaps.map((gap, gIdx) => (
                            <li key={gIdx} className="text-[11px] text-zinc-400 leading-relaxed flex gap-2">
                              <span className="text-amber-500/30 flex-shrink-0">•</span>
                              {gap}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sección Logs */}
              <div>
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center justify-between">
                  <span>Audit Trail</span>
                  <span className="text-[10px] normal-case text-zinc-600 font-normal italic">Secuencia de ejecución</span>
                </h3>
                {auditTrail && auditTrail.length > 0 ? (
                  <div className="bg-black/40 rounded-2xl border border-white/5 p-6 max-h-60 overflow-y-auto custom-scrollbar">
                    <div className="flex flex-wrap gap-3 items-center">
                      {auditTrail.map((node, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/5 text-emerald-400 text-[10px] font-mono border border-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                            {node}
                          </span>
                          {i < auditTrail.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-500 italic">No hay logs de auditoría disponibles aún.</p>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end shrink-0">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-sm font-bold transition-all border border-white/5 active:scale-95"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {focusedGaps && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setFocusedGaps(null)}>
          <div className="bg-zinc-900 border border-white/5 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-white/5">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Diferencias en {focusedGaps.label}
              </h2>
              <button onClick={() => setFocusedGaps(null)} className="p-2 hover:bg-white/10 rounded-full text-zinc-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3 custom-scrollbar">
              {focusedGaps.gaps.map((gap, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/5 group hover:bg-white/[0.07] transition-colors">
                  <span className="text-amber-500/50 flex-shrink-0 mt-0.5">•</span>
                  <p className="text-xs text-zinc-400 leading-relaxed group-hover:text-zinc-300 transition-colors">{gap}</p>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end shrink-0">
              <button
                onClick={() => setFocusedGaps(null)}
                className="px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-bold transition-all border border-white/5 active:scale-95"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeliverablePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl animate-fade-in">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-[0_32px_128px_-12px_rgba(0,0,0,0.8)] overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 shrink-0 bg-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand-500/10 rounded-2xl">
                  <Maximize2 className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white uppercase tracking-tight leading-none">
                    Preview <span className="text-brand-400">· {pendingDeliverablePreview.kind}</span>
                  </h2>
                  <p className="text-[10px] text-zinc-500 font-medium mt-1">Revisa el contenido antes de persistir en el repositorio</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => discardDeliverable()}
                  className="px-5 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 text-sm font-bold transition-all"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeliverable()}
                  className="px-8 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold shadow-xl shadow-brand-500/20 transition-all flex items-center gap-3 active:scale-[0.98]"
                >
                  Confirmar y Guardar
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-10 bg-zinc-950/30">
              <div className="max-w-4xl mx-auto glass-card p-8 rounded-3xl border-white/5 shadow-2xl">
                <MddViewer content={pendingDeliverablePreview.content} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

