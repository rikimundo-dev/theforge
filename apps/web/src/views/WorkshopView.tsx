import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Code,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  BookOpen,
  Cloud,
  CloudOff,
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
  Save,
  X,
  Play,
  ListOrdered,
  ListTodo,
  Download,
  Brain,
  Edit3,
  HelpCircle,
  Layers,
  MessageSquare,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CodebaseDocResponseMode } from "@theforge/shared-types";
import { useWorkshopStore, type Status } from "../store/workshopStore";
import ChatContainer from "../components/ChatContainer";
import ComplexityPendingBanner from "../components/ComplexityPendingBanner";
import MddViewer from "../components/MddViewer";
import { DesignMdPreview } from "../components/DesignMdPreview";
import WorkshopHelpModal from "../components/WorkshopHelpModal";
import LegacyMcpDebugPanel from "../components/LegacyMcpDebugPanel/LegacyMcpDebugPanel";
import { BrdTobeStagePanel } from "../components/BrdTobeStagePanel";
import { calculateCostFromMdd } from "../utils/costCalculator";
import { downloadDocumentsZip } from "../utils/downloadDocumentsZip";
import { isTabVisibleForComplexity, type WorkshopDocTab } from "../utils/complexityTabs";
import type { LucideIcon } from "lucide-react";
import { Button } from "../components/ui";
import {
  LEGACY_CODEBASE_DOC_STEPS,
  LEGACY_DELIVERABLES_STEPS,
  LEGACY_MDD_STEPS,
} from "../constants/legacy-workshop-loading-steps";

function DocEmptyState({
  icon: Icon,
  title,
  description,
  onGenerate,
  loading,
  hasMdd,
  generateBlocked,
  generateBlockedReason,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onGenerate: () => void;
  loading: boolean;
  hasMdd: boolean;
  /** ej. Blueprint §3 incompleto — bloquea generación aunque haya MDD */
  generateBlocked?: boolean;
  generateBlockedReason?: string;
}) {
  const blocked = !!generateBlocked;
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] text-[var(--foreground-muted)] text-center gap-4">
      <Icon className="w-12 h-12 text-[var(--foreground-subtle)]" />
      <p className="text-sm">{description}</p>
      <Button
        variant="outline"
        onClick={onGenerate}
        disabled={loading || !hasMdd || blocked}
        loading={loading}
      >
        Generar {title} desde MDD
      </Button>
      {!hasMdd && (
        <p className="text-xs">Necesitas tener contenido en el MDD para generar este documento.</p>
      )}
      {blocked && generateBlockedReason && (
        <p className="text-xs text-amber-400 max-w-md">{generateBlockedReason}</p>
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
  const activeStageId = useWorkshopStore((s) => s.activeStageId);
  const setActiveStageId = useWorkshopStore((s) => s.setActiveStageId);
  const createWorkshopStage = useWorkshopStore((s) => s.createWorkshopStage);
  const workshopStages = useWorkshopStore((s) => s.workshopStages);
  const workshopStagesList =
    workshopStages.length > 0 ? workshopStages : (project?.stages ?? []);
  const activeWorkshopStage = useMemo(
    () => workshopStagesList.find((s) => s.id === activeStageId),
    [workshopStagesList, activeStageId],
  );
  const patchWorkshopStage = useWorkshopStore((s) => s.patchWorkshopStage);
  const generateMddFromBenchmark = useWorkshopStore((s) => s.generateMddFromBenchmark);
  /** Estado legacy efectivo: lee de la etapa activa primero, con fallback a project.legacyFlowState */
  const activeLegacyState = useMemo(() => {
    if (project?.projectType === "LEGACY" && activeWorkshopStage?.legacyChangeState) {
      return activeWorkshopStage.legacyChangeState;
    }
    return project?.legacyFlowState ?? null;
  }, [project?.projectType, activeWorkshopStage?.legacyChangeState, project?.legacyFlowState]);
  const codebaseDocCharCount = useMemo(
    () => (activeLegacyState?.codebaseDoc ?? "").trim().length,
    [activeLegacyState?.codebaseDoc],
  );
  const liveMetrics = useWorkshopStore((s) => s.liveMetrics);
  const mddContent = useWorkshopStore((s) => s.mddContent);
  /** MDD en store o persistido en proyecto (evita botones Generar/Regenerar deshabilitados si el store quedó vacío). */
  const effectiveMddTrimmed = useMemo(
    () => (mddContent ?? "").trim() || (project?.mddContent ?? "").trim(),
    [mddContent, project?.mddContent],
  );
  const specContentField = useWorkshopStore((s) => s.specContent);
  const dbgaContentField = useWorkshopStore((s) => s.dbgaContent);
  /** Mismo criterio que `POST …/suggest-brd-tobe-from-dbga` (lee `dbgaContent` persistido en proyecto). */
  const dbgaContentCharCount = useMemo(
    () => (project?.dbgaContent ?? "").trim().length,
    [project?.dbgaContent],
  );
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
  const complexity = project?.complexity ?? "HIGH";
  const isLegacyProject = project?.projectType === "LEGACY";
  const uxGuideOneShotChatPrompt = useMemo(
    () =>
      "Genera la **Guía UX/UI completa en formato DESIGN.md** (especificación abierta de Google). " +
      "El documento DEBE empezar con YAML front matter con tokens de diseño (version, name, description, colors, typography, rounded, spacing, components) " +
      "seguido de las secciones canónicas: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts. " +
      "Usa {token.references} en los componentes, no dupliques valores. " +
      "Incluye: patrón/estilo, paleta y tokens de color, tipografía, espaciado y grid, componentes de referencia, " +
      "prioridades de UX, criterios de accesibilidad (WCAG, contraste 4.5:1, teclado, touch 44px) y anti-patrones a evitar." +
      (isLegacyProject
        ? ""
        : " Para proyecto nuevo, al final del contenido (antes de ---FIN_UX_UI---) añade la sección ## Prompt para Google Stitch (producto): " +
          "un solo bloque listo para copiar y pegar en Google Stitch con pantallas y flujos del **producto** definido en el MDD y documentos " +
          "(no describas la app The Forge ni el Workshop).") +
      " Responde con el DESIGN.md completo y termina con ---FIN_UX_UI--- y luego un breve comentario.",
    [isLegacyProject],
  );
  const isReverseEngineering =
    isLegacyProject &&
    !!((activeLegacyState?.codebaseDoc ?? "").trim()) &&
    !effectiveMddTrimmed;
  const effectiveComplexityForTabs = isReverseEngineering ? "HIGH" : complexity;
  const canGenerate = useMemo(() => {
    if (isLegacyProject) {
      const hasMdd = effectiveMddTrimmed.length > 0;
      const hasCodebaseDoc = (activeLegacyState?.codebaseDoc ?? "").trim().length > 0;
      return hasMdd || hasCodebaseDoc;
    }
    if (complexity === "LOW" || complexity === "MEDIUM") {
      const hasBootstrap =
        (dbgaContent ?? "").trim().length > 0 || effectiveMddTrimmed.length > 0;
      return (semaphoreGreen && hasSpec) || hasBootstrap;
    }
    return semaphoreGreen && hasSpec;
  }, [
    isLegacyProject,
    complexity,
    semaphoreGreen,
    hasSpec,
    dbgaContent,
    effectiveMddTrimmed,
    activeLegacyState?.codebaseDoc,
  ]);

  /* Use stable selectors to avoid loops */
  const conformanceRaw = useWorkshopStore((s) => s.conformance);
  const conformance = useMemo(() => conformanceRaw, [conformanceRaw]);
  const documentCompleteness = useWorkshopStore((s) => s.documentCompleteness);
  const crossDocumentGaps = useWorkshopStore((s) => s.crossDocumentGaps);
  const apiBlueprintDmBlocked = conformance?.blueprintDataModel?.ok === false;
  const apiBlueprintBlockedHint =
    "El Blueprint no cubre el §3 Modelo de datos del MDD. Corrige o regenera el Blueprint; revisa el panel Conformance.";

  const precisionBreakdownRaw = useWorkshopStore((s) => s.precisionBreakdown);
  const precisionBreakdown = useMemo(() => precisionBreakdownRaw, [precisionBreakdownRaw]);

  const auditTrailRaw = useWorkshopStore((s) => s.auditTrail);
  const auditTrail = useMemo(() => auditTrailRaw || [], [auditTrailRaw]);
  const auditorFeedback = useWorkshopStore((s) => s.auditorFeedback);
  const auditFeedbackStatusLabel = useMemo(() => {
    const st = liveMetrics?.status;
    return st === "green" ? "Verde" : st === "yellow" ? "Amarillo" : "Rojo";
  }, [liveMetrics?.status]);

  const pendingDeliverablePreviewRaw = useWorkshopStore((s) => s.pendingDeliverablePreview);
  const pendingDeliverablePreview = useMemo(() => pendingDeliverablePreviewRaw, [pendingDeliverablePreviewRaw]);
  const synced = useWorkshopStore((s) => s.synced);
  const loading = useWorkshopStore((s) => s.loading);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);
  const cascadeRunning = loading && (loadingReason === "deliverables-cascade" || loadingReason === "legacy-deliverables");
  const error = useWorkshopStore((s) => s.error);
  const setError = useWorkshopStore((s) => s.setError);
  const fetchProject = useWorkshopStore((s) => s.fetchProject);
  const adrsRaw = useWorkshopStore((s) => s.adrs);
  const adrs = useMemo(() => adrsRaw || [], [adrsRaw]);
  const fetchAdrs = useWorkshopStore((s) => s.fetchAdrs);
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
  const suggestBrdTobeFromDbga = useWorkshopStore((s) => s.suggestBrdTobeFromDbga);
  const mddJustGeneratedFromBenchmark = useWorkshopStore((s) => s.mddJustGeneratedFromBenchmark);
  const clearMddJustGeneratedFromBenchmark = useWorkshopStore((s) => s.clearMddJustGeneratedFromBenchmark);
  const phase0DeepResearch = useWorkshopStore((s) => s.phase0DeepResearch);
  const clearPhase0SummaryContent = useWorkshopStore((s) => s.clearPhase0SummaryContent);
  const setPhase0SummaryContent = useWorkshopStore((s) => s.setPhase0SummaryContent);
  const persistPhase0SummaryContent = useWorkshopStore((s) => s.persistPhase0SummaryContent);
  const legacyGenerateCodebaseDoc = useWorkshopStore((s) => s.legacyGenerateCodebaseDoc);
  const legacyMcpDebugTrace = useWorkshopStore((s) => s.legacyMcpDebugTrace);
  const legacyUpdateCodebaseDoc = useWorkshopStore((s) => s.legacyUpdateCodebaseDoc);
  const legacyStart = useWorkshopStore((s) => s.legacyStart);
  const legacyAnswer = useWorkshopStore((s) => s.legacyAnswer);
  const legacyGenerateMdd = useWorkshopStore((s) => s.legacyGenerateMdd);
  const legacyGenerateDeliverables = useWorkshopStore((s) => s.legacyGenerateDeliverables);
  const persistUxUiGuideContent = useWorkshopStore((s) => s.persistUxUiGuideContent);
  const persistArchitectureContent = useWorkshopStore((s) => s.persistArchitectureContent);
  const persistUseCasesContent = useWorkshopStore((s) => s.persistUseCasesContent);
  const persistUserStoriesContent = useWorkshopStore((s) => s.persistUserStoriesContent);
  const generateArchitecture = useWorkshopStore((s) => s.generateArchitecture);
  const generateUseCases = useWorkshopStore((s) => s.generateUseCases);
  const generateUserStories = useWorkshopStore((s) => s.generateUserStories);
  const generateDeliverablesCascade = useWorkshopStore((s) => s.generateDeliverablesCascade);
  const reassessComplexity = useWorkshopStore((s) => s.reassessComplexity);
  const setArchitectureContent = useWorkshopStore((s) => s.setArchitectureContent);
  const setUseCasesContent = useWorkshopStore((s) => s.setUseCasesContent);
  const setUserStoriesContent = useWorkshopStore((s) => s.setUserStoriesContent);
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
  const [uxUiGuideViewMode, setUxUiGuideViewMode] = useState<"design" | "preview" | "source">("design");
  const [architectureViewMode, setArchitectureViewMode] = useState<"preview" | "source">("preview");
  const [useCasesViewMode, setUseCasesViewMode] = useState<"preview" | "source">("preview");
  const [userStoriesViewMode, setUserStoriesViewMode] = useState<"preview" | "source">("preview");
  const [mddInicialViewMode, setMddInicialViewMode] = useState<"preview" | "source">("preview");
  const [mddInicialLocalContent, setMddInicialLocalContent] = useState("");
  const [mddInicialSaving, setMddInicialSaving] = useState(false);
  const [mddInicialCopyOk, setMddInicialCopyOk] = useState(false);
  /** BRD / To-Be (pestañas Workshop): borradores locales y modo preview|fuente (Grabar vía barra / aviso). */
  const brdTobeServerSnap = useRef({ stageId: "", brd: "", tobe: "", asis: "" });
  const prevLoadingReasonRef = useRef<string | null>(null);
  const [brdWorkshopDraft, setBrdWorkshopDraft] = useState("");
  const [toBeWorkshopDraft, setToBeWorkshopDraft] = useState("");
  const [asIsWorkshopDraft, setAsIsWorkshopDraft] = useState("");
  const [brdDocViewMode, setBrdDocViewMode] = useState<"preview" | "source">("preview");
  const [toBeDocViewMode, setToBeDocViewMode] = useState<"preview" | "source">("preview");
  const [brdTobePersistBusy, setBrdTobePersistBusy] = useState(false);
  /** `ask_codebase` / Ariadne al generar doc. partida (`POST …/legacy/generate-codebase-doc`). Default `raw_evidence`. `ingest_mdd` = una sola pasada `evidence_first` (MDD ingest), sin agente escalonado ni síntesis Nest. */
  const [codebaseDocResponseMode, setCodebaseDocResponseMode] = useState<CodebaseDocResponseMode>("raw_evidence");
  const copyMddInicialMarkdown = useCallback(async () => {
    const text = (mddInicialLocalContent || activeLegacyState?.codebaseDoc || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMddInicialCopyOk(true);
      window.setTimeout(() => setMddInicialCopyOk(false), 2000);
    } catch {
      /* clipboard */
    }
  }, [mddInicialLocalContent, activeLegacyState?.codebaseDoc]);
  const [conformanceUseLlm, setConformanceUseLlm] = useState(false);
  type DocPanel =
    | "benchmark"
    | "legacy"
    | "mdd-inicial"
    | "spec"
    | "brd"
    | "to-be"
    | "mdd"
    | "ux-ui-guide"
    | "blueprint"
    | "tasks"
    | "api-contracts"
    | "logic-flows"
    | "architecture"
    | "use-cases"
    | "user-stories"
    | "infra"
    | "adrs";
  const [centralPanel, setCentralPanel] = useState<DocPanel>("mdd");
  /** Por debajo de `lg`: una columna con control de Chat / Documentos / Semáforo. */
  type WorkshopMobileColumn = "chat" | "workspace" | "metrics";
  const [mobileWorkshopColumn, setMobileWorkshopColumn] = useState<WorkshopMobileColumn>("workspace");
  const [revaluateBusy, setRevaluateBusy] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  /** `""` = MDD en blanco; si no vacío, copia desde esa etapa */
  const [copyMddSourceStageId, setCopyMddSourceStageId] = useState<string>("");
  const initialPanelSetForProject = useRef<string | null>(null);
  /** Flujo legacy: descripción y respuestas locales antes de enviar */
  const [legacyDescriptionInput, setLegacyDescriptionInput] = useState("");
  const [legacyAnswersInput, setLegacyAnswersInput] = useState<Record<string, string>>({});
  /** Paso actual mostrado mientras corre legacy-mdd o legacy-deliverables (rota cada 6s) */
  const [legacyStepIndex, setLegacyStepIndex] = useState(0);
  useEffect(() => {
    if (!loading || (loadingReason !== "legacy-mdd" && loadingReason !== "legacy-deliverables" && loadingReason !== "legacy-codebase-doc")) {
      setLegacyStepIndex(0);
      return;
    }
    const steps =
      loadingReason === "legacy-codebase-doc"
        ? LEGACY_CODEBASE_DOC_STEPS
        : loadingReason === "legacy-mdd"
          ? LEGACY_MDD_STEPS
          : LEGACY_DELIVERABLES_STEPS;
    const id = setInterval(() => setLegacyStepIndex((i) => (i + 1) % steps.length), 6000);
    return () => clearInterval(id);
  }, [loading, loadingReason]);

  useEffect(() => {
    const codebaseDoc = activeLegacyState?.codebaseDoc ?? "";
    if (codebaseDoc) setMddInicialLocalContent(codebaseDoc);
  }, [activeLegacyState?.codebaseDoc]);

  useEffect(() => {
    brdTobeServerSnap.current = { stageId: "", brd: "", tobe: "", asis: "" };
    setBrdWorkshopDraft("");
    setToBeWorkshopDraft("");
    setAsIsWorkshopDraft("");
    setBrdDocViewMode("preview");
    setToBeDocViewMode("preview");
  }, [projectId]);

  /** Sincroniza drafts desde el stage cuando el contenido del servidor cambia, preservando ediciones del usuario. */
  useEffect(() => {
    if (!activeWorkshopStage || activeWorkshopStage.id !== activeStageId) return;
    const id = activeWorkshopStage.id;
    const brd = activeWorkshopStage.brdContent ?? "";
    const tobe = activeWorkshopStage.toBeManualContent ?? "";
    const asis = activeWorkshopStage.asIsManualContent ?? "";

    const cur = brdTobeServerSnap.current;
    if (cur.stageId !== id) {
      brdTobeServerSnap.current = { stageId: id, brd, tobe, asis };
      setBrdWorkshopDraft(brd);
      setToBeWorkshopDraft(tobe);
      setAsIsWorkshopDraft(asis);
      setBrdDocViewMode("preview");
      setToBeDocViewMode("preview");
      return;
    }

    if (cur.brd !== brd) {
      setBrdWorkshopDraft((d) => (d === cur.brd ? brd : d));
      brdTobeServerSnap.current.brd = brd;
    }
    const c2 = brdTobeServerSnap.current;
    if (c2.tobe !== tobe) {
      setToBeWorkshopDraft((d) => (d === c2.tobe ? tobe : d));
      brdTobeServerSnap.current.tobe = tobe;
    }
    const c3 = brdTobeServerSnap.current;
    if (c3.asis !== asis) {
      setAsIsWorkshopDraft((d) => (d === c3.asis ? asis : d));
      brdTobeServerSnap.current.asis = asis;
    }
  }, [
    activeStageId,
    activeWorkshopStage?.id,
    activeWorkshopStage?.brdContent,
    activeWorkshopStage?.toBeManualContent,
    activeWorkshopStage?.asIsManualContent,
  ]);

  /** Fuerza sincronización cuando una operación de BRD/To-Be acaba de completarse (loading pasó de true a false).
   *  Cubre casos donde el efecto anterior no detectó el cambio (ej. Zustand batching, referencia de stage sin mutar). */
  useEffect(() => {
    const wasGeneratingBrd =
      prevLoadingReasonRef.current === "brd-tobe-from-dbga" ||
      prevLoadingReasonRef.current === "legacy-brd-tobe-suggest" ||
      prevLoadingReasonRef.current === "legacy-as-is";
    if (!loading && wasGeneratingBrd && activeWorkshopStage) {
      setBrdWorkshopDraft(activeWorkshopStage.brdContent ?? "");
      setToBeWorkshopDraft(activeWorkshopStage.toBeManualContent ?? "");
      setAsIsWorkshopDraft(activeWorkshopStage.asIsManualContent ?? "");
      brdTobeServerSnap.current = {
        stageId: activeWorkshopStage.id,
        brd: activeWorkshopStage.brdContent ?? "",
        tobe: activeWorkshopStage.toBeManualContent ?? "",
        asis: activeWorkshopStage.asIsManualContent ?? "",
      };
    }
    prevLoadingReasonRef.current = loadingReason;
  }, [loading, loadingReason, activeWorkshopStage?.id, activeWorkshopStage?.brdContent, activeWorkshopStage?.toBeManualContent, activeWorkshopStage?.asIsManualContent]);

  const brdWorkshopDirty = useMemo(
    () => brdWorkshopDraft !== (activeWorkshopStage?.brdContent ?? ""),
    [brdWorkshopDraft, activeWorkshopStage?.brdContent],
  );
  const toBeWorkshopTabDirty = useMemo(
    () =>
      toBeWorkshopDraft !== (activeWorkshopStage?.toBeManualContent ?? "") ||
      asIsWorkshopDraft !== (activeWorkshopStage?.asIsManualContent ?? ""),
    [toBeWorkshopDraft, asIsWorkshopDraft, activeWorkshopStage?.toBeManualContent, activeWorkshopStage?.asIsManualContent],
  );

  const persistBrdWorkshopDraft = useCallback(async () => {
    if (!activeStageId || !brdWorkshopDirty) return;
    setBrdTobePersistBusy(true);
    await patchWorkshopStage(activeStageId, { brdContent: brdWorkshopDraft });
    setBrdTobePersistBusy(false);
  }, [activeStageId, brdWorkshopDirty, brdWorkshopDraft, patchWorkshopStage]);

  const persistToBeTabWorkshopDrafts = useCallback(async () => {
    if (!activeStageId || !toBeWorkshopTabDirty) return;
    setBrdTobePersistBusy(true);
    await patchWorkshopStage(activeStageId, {
      toBeManualContent: toBeWorkshopDraft,
      asIsManualContent: asIsWorkshopDraft,
    });
    setBrdTobePersistBusy(false);
  }, [activeStageId, toBeWorkshopTabDirty, toBeWorkshopDraft, asIsWorkshopDraft, patchWorkshopStage]);

  const handleGenerateDeliverables = useCallback(async () => {
    if (!projectId || !canGenerate || cascadeRunning) return;
    setError(null);
    if (isLegacyProject) {
      await legacyGenerateDeliverables(projectId);
      if (projectId) fetchProject(projectId);
    } else {
      await generateDeliverablesCascade(projectId);
    }
  }, [projectId, canGenerate, cascadeRunning, setError, isLegacyProject, legacyGenerateDeliverables, fetchProject, generateDeliverablesCascade]);

  /** Re-valorar complejidad: NEW → tab Paso 0 + chat benchmark; LEGACY → tab MDD (no existe DBGA). Misma API `reassess-complexity`. */
  const handleRevaluateComplexity = useCallback(async () => {
    if (!projectId || !project) return;
    setRevaluateBusy(true);
    try {
      const isLegacy = project.projectType === "LEGACY";
      if (!isLegacy) setCentralPanel("benchmark");
      else setCentralPanel("mdd");
      const updated = await reassessComplexity(projectId);
      if (updated == null) return;
      const tab = isLegacy ? "mdd" : "benchmark";
      await sendMessage(
        "Acabo de solicitar una re-valoración de complejidad sobre el alcance documentado. Conduce la entrevista: si el alcance no es claro, haz 1–2 preguntas de escala; luego propón nivel LOW/MEDIUM/HIGH y el plan de entregables, y espera mi confirmación explícita antes de asumir que quedó aplicado.",
        tab,
      );
    } finally {
      setRevaluateBusy(false);
    }
  }, [projectId, project, reassessComplexity, sendMessage]);

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
    if (!projectId || !project || project.id !== projectId) return;
    void fetchConformance(projectId);
  }, [projectId, project?.id, fetchConformance]);

  // Mobile: al volver de background, re-verificar si hay tareas completadas
  useEffect(() => {
    if (!projectId) return;
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const store = useWorkshopStore.getState();
      if (store.loading) {
        fetchProject(projectId).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [projectId, fetchProject]);

  useEffect(() => {
    if (!project || project.id !== projectId) return;
    if (initialPanelSetForProject.current === projectId) return;
    initialPanelSetForProject.current = projectId;
    if (project.projectType === "LEGACY" && !(project.mddContent ?? "").trim()) setCentralPanel("legacy");
    else if (!(project.mddContent ?? "").trim()) {
      const cx0 = project.complexity ?? "HIGH";
      if (cx0 === "MEDIUM" && project.projectType !== "LEGACY") setCentralPanel("spec");
      else setCentralPanel("mdd");
    }
  }, [project?.id, projectId, project?.mddContent, project?.projectType, project?.complexity]);

  // Legacy: no hay Paso 0; redirigir benchmark al panel de modificación
  useEffect(() => {
    if (project?.projectType === "LEGACY" && centralPanel === "benchmark") {
      setCentralPanel("legacy");
    }
  }, [project?.projectType, centralPanel]);

  /** LOW: no mostrar MDD / Blueprint / API — si el panel activo es uno oculto, ir a Spec */
  useEffect(() => {
    if (complexity !== "LOW") return;
    const hidden: DocPanel[] = ["mdd", "blueprint", "api-contracts"];
    if (hidden.includes(centralPanel)) setCentralPanel("spec");
  }, [complexity, centralPanel]);

  /** MEDIUM: barra acotada a entregables de la matriz — redirige si el panel ya no aplica */
  useEffect(() => {
    if (complexity !== "MEDIUM" || !project) return;
    const pt = project.projectType === "LEGACY" ? "LEGACY" : "NEW";
    if (isTabVisibleForComplexity(centralPanel as WorkshopDocTab, "MEDIUM", { projectType: pt })) return;
    setCentralPanel(pt === "LEGACY" ? "mdd" : "spec");
  }, [complexity, centralPanel, project?.projectType]);

  // Legacy: si el panel activo es un documento que no tiene contenido (tab oculto), ir a Modificación o MDD
  useEffect(() => {
    if (project?.projectType !== "LEGACY") return;
    const emptyLegacyPanels: DocPanel[] = [
      "spec", "architecture", "use-cases", "user-stories", "blueprint",
      "ux-ui-guide", "api-contracts", "logic-flows", "tasks", "infra",
    ];
    if (!emptyLegacyPanels.includes(centralPanel as DocPanel)) return;
    const contentByPanel: Record<string, string | null> = {
      spec: specContent ?? null,
      architecture: architectureContent ?? null,
      "use-cases": useCasesContent ?? null,
      "user-stories": userStoriesContent ?? null,
      blueprint: blueprintContent ?? null,
      "ux-ui-guide": uxUiGuideContent ?? null,
      "api-contracts": apiContractsContent ?? null,
      "logic-flows": logicFlowsContent ?? null,
      tasks: tasksContent ?? null,
      infra: infraContent ?? null,
    };
    const content = contentByPanel[centralPanel as string];
    if (!(content ?? "").trim()) setCentralPanel("legacy");
  }, [
    project?.projectType,
    centralPanel,
    specContent,
    architectureContent,
    useCasesContent,
    userStoriesContent,
    blueprintContent,
    uxUiGuideContent,
    apiContractsContent,
    logicFlowsContent,
    tasksContent,
    infraContent,
  ]);



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
  const specDirty = (specContent ?? "") !== (project?.specContent ?? "");
  const mddEmpty = !((mddContent ?? "").trim() || (project?.mddContent ?? "").trim());
  const precisionScore = mddEmpty ? 0 : (liveMetrics?.precision ?? project?.precisionScore ?? 0);
  const costDisplayFallback = calculateCostFromMdd(mddContent, {
    status: projectStatus,
    infraContent: project?.infraContent ?? infraContent,
  });
  const costDisplay = mddEmpty
    ? {
      totalMxn: costDisplayFallback.totalMxn,
      totalMxnMarket: costDisplayFallback.totalMxn,
      totalMxnIA: 0,
      totalHours: costDisplayFallback.totalHours,
      teamStructure: costDisplayFallback.teamStructure,
      rolesHours: { architect: 0, back: 0, front: 0 } as Record<string, number>,
    }
    : liveMetrics
      ? {
        totalMxn: liveMetrics.totalMXN,
        totalMxnMarket: liveMetrics.totalMXNMarket,
        totalMxnIA: liveMetrics.totalMXNIA ?? 0,
        totalHours: liveMetrics.totalHours,
        teamStructure: liveMetrics.roles as Record<string, number>,
        rolesHours: liveMetrics.rolesHours as Record<string, number>,
      }
      : {
        ...costDisplayFallback,
        totalMxnMarket: costDisplayFallback.totalMxn,
        totalMxnIA: 0,
        rolesHours: {} as Record<string, number>,
      };

  const effectiveStatus = mddEmpty ? "red" : (liveMetrics?.status ?? (precisionScore <= 40 ? "red" : precisionScore <= 90 ? "yellow" : "green"));
  const semaphoreConfig =
    effectiveStatus === "red"
      ? {
        icon: Lock,
        color: "text-red-500",
        bg: "bg-red-500/20",
        label: "Bloqueado",
      }
      : effectiveStatus === "yellow"
        ? {
          icon: AlertTriangle,
          color: "text-amber-500",
          bg: "bg-amber-500/20",
          label: "Advertencia",
        }
        : {
          icon: CheckCircle2,
          color: "text-green-500",
          bg: "bg-green-500/20",
          label: "Listo",
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
    <div className="h-[100dvh] min-h-0 flex flex-col bg-zinc-900 text-zinc-100">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2 border-b border-zinc-700 shrink-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="text-zinc-400 hover:text-zinc-100 text-sm shrink-0 touch-manipulation min-h-[44px] sm:min-h-0 px-1 -ml-1"
            >
              ← Volver
            </button>
          )}
          <h1 className="text-base sm:text-lg font-semibold text-amber-400 truncate max-w-[min(100%,14rem)] sm:max-w-none">
            {projectName ?? project?.name ?? "Workshop"}
          </h1>
          {project?.projectType === "LEGACY" && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-600 text-zinc-300 border border-zinc-500 shrink-0"
              title="Proyecto legacy: documentación de cambios con Relic"
            >
              Legacy
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0" title={synced ? "Sincronizado" : "Sincronizando"}>
            {synced ? (
              <>
                <Cloud className="w-3.5 h-3.5 text-green-500" />
                <span className="hidden sm:inline">Sincronizado</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Sincronizando…</span>
              </>
            )}
          </span>
          {project?.projectType === "LEGACY" && project?.theforgeProjectId?.trim() && (
            <span
              className="w-full sm:w-auto min-w-0 font-mono text-[10px] sm:text-[11px] text-zinc-500 leading-tight"
              title={`UUID guardado (theforgeProjectId). La API resuelve: ingest proyecto (ask_codebase, get_modification_plan) = id workspace; grafo/semantic = roots[].id; scope.repoIds en ask/plan. ${project.theforgeProjectId}`}
            >
              <span className="text-zinc-600 select-none" aria-hidden>
                MCP{" "}
              </span>
              <span className="text-zinc-400 break-all">{project.theforgeProjectId}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end w-full sm:w-auto">
          {workshopStagesList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 sm:mr-1 w-full sm:w-auto min-w-0">
              <Layers className="w-4 h-4 text-zinc-500 shrink-0 hidden sm:block" aria-hidden />
              <label htmlFor="workshop-stage-select" className="sr-only">
                Vista en vivo: etapa del Workshop (MDD y semáforo)
              </label>
              <select
                id="workshop-stage-select"
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-2 sm:py-1.5 text-sm text-zinc-200 min-w-0 flex-1 sm:flex-none max-w-full sm:max-w-[220px] touch-manipulation min-h-[44px] sm:min-h-0"
                value={activeStageId ?? workshopStagesList[0]?.id ?? ""}
                onChange={(e) => setActiveStageId(e.target.value)}
              >
                {workshopStagesList.map((st) => (
                  <option key={st.id} value={st.id}>
                    #{st.ordinal}{" "}
                    {(st.name ?? st.key ?? st.id.slice(0, 8)) + ` · ${st.workflowStatus}`}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setNewStageName("");
                  setCopyMddSourceStageId(activeStageId ?? "");
                  setShowStageModal(true);
                }}
                className="text-xs px-3 py-2 sm:py-1.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-700/80 whitespace-nowrap touch-manipulation min-h-[44px] sm:min-h-0 shrink-0"
              >
                Nueva etapa
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm touch-manipulation min-h-[44px] sm:min-h-0"
            title="Manual de uso del Workshop"
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Ayuda</span>
          </button>
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
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm touch-manipulation min-h-[44px] sm:min-h-0"
            title="Descargar todos los documentos del proyecto en un ZIP"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Descargar ZIP</span>
          </button>
        </div>
      </header>

      {showStageModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-stage-title"
        >
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 id="new-stage-title" className="text-lg font-semibold text-amber-400">
              Nueva etapa
            </h2>
            <p className="text-sm text-zinc-400">
              Se activará la nueva etapa (las demás pasan a SUPERSEDED). Puedes partir de un MDD en blanco o copiar uno de una etapa previa.
            </p>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ej. Fase 2 — API"
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="copy-mdd-from-stage" className="block text-xs text-zinc-500 mb-1">
                Copiar MDD desde
              </label>
              <select
                id="copy-mdd-from-stage"
                value={copyMddSourceStageId}
                onChange={(e) => setCopyMddSourceStageId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-sm text-zinc-200"
              >
                <option value="">Sin copiar (MDD vacío)</option>
                {workshopStagesList.map((st) => (
                  <option key={st.id} value={st.id}>
                    #{st.ordinal} {st.name ?? st.key ?? st.id.slice(0, 8)}
                    {st.id === activeStageId ? " (vista actual)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowStageModal(false)}
                className="px-3 py-1.5 rounded text-zinc-400 hover:bg-zinc-700 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await createWorkshopStage({
                    name: newStageName.trim() || undefined,
                    copyMddFromStageId: copyMddSourceStageId.trim() || undefined,
                    copyLegacyChangeFromStageId: copyMddSourceStageId.trim() || undefined,
                  });
                  if (res) setShowStageModal(false);
                }}
                className="px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      <WorkshopHelpModal open={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {error && (
        <div className="shrink-0 px-4 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center justify-between gap-2">
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-300 hover:text-red-100 text-xs"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ComplexityPendingBanner />

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)_minmax(240px,320px)]">
        {/* Columna A: Chat (siempre a la izquierda, como en MDD) */}
        <section
          className={cn(
            "border-r border-zinc-700 min-h-0 overflow-hidden lg:min-h-0",
            "flex flex-col",
            mobileWorkshopColumn === "chat" ? "flex flex-1 min-h-0" : "hidden lg:flex lg:flex-col",
          )}
        >
          <ChatContainer
            projectId={projectId}
            activeTab={centralPanel as import("../components/ChatContainer").ActiveTab}
            embedded={false}
            onRevaluate={project ? handleRevaluateComplexity : undefined}
            revaluateBusy={revaluateBusy}
            benchmarkMode={
              centralPanel === "benchmark"
                ? {
                  hasBenchmark: !!dbgaContent?.trim(),
                  onGenerateBenchmark: (idea) => {
                    setLastBenchmarkIdea(idea);
                    generateBenchmark(projectId, idea);
                  },
                }
                : undefined
            }
          />
        </section>

        {/* Columna B: Contenido del tab (documento o Paso 0 = benchmark + deep research) */}
        <section
          className={cn(
            "min-w-0 min-h-0 border-r border-zinc-700 overflow-hidden lg:min-h-0",
            "flex flex-col",
            mobileWorkshopColumn === "workspace" ? "flex flex-1 min-h-0" : "hidden lg:flex lg:flex-col",
          )}
        >
          <div className="px-4 py-2 border-b border-zinc-700 flex flex-col gap-2 text-zinc-400 text-sm shrink-0">
            {/* Renglón 1: Todos los tabs de los documentos */}
            <div className="flex items-center gap-0.5 flex-nowrap overflow-x-auto scrollbar-hide pb-1">
              {(() => {
                const tabDocHasContent = (id: string, content: unknown): boolean => {
                  if (id === "adrs") return Array.isArray(content) && content.length > 0;
                  return !!String(content ?? "").trim();
                };

                const getTabClass = (id: string, content: unknown) => {
                  const isActive = centralPanel === id;
                  const hasContent = tabDocHasContent(id, content);

                  if (!hasContent) {
                    return `flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap shrink-0 border border-dashed border-zinc-600 bg-zinc-900/70 text-zinc-500 hover:bg-zinc-800/90 transition-colors ${isActive ? "ring-1 ring-amber-500/50 text-zinc-300" : ""}`;
                  }

                  if (isActive) {
                    return `flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap shrink-0 bg-zinc-700 text-amber-400 font-medium ring-1 ring-amber-500/30 transition-colors`;
                  }

                  return `flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap shrink-0 border border-emerald-800/45 bg-emerald-950/40 text-emerald-200/95 hover:bg-emerald-900/35 transition-colors`;
                };

                const tabPt = isLegacyProject ? "LEGACY" : "NEW";
                const tabVisible = (id: WorkshopDocTab) =>
                  isTabVisibleForComplexity(id, effectiveComplexityForTabs, { projectType: tabPt });
                return (
                  <>
                    {isLegacyProject && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCentralPanel("legacy")}
                          className={getTabClass("legacy", activeLegacyState?.description ?? "")}
                          title="Describir modificación → AriadneSpecs → MDD → entregables"
                        >
                          <Edit3 className="w-4 h-4" />
                          Modificación
                        </button>
                        {tabVisible("mdd-inicial") && (
                          <button
                            type="button"
                            onClick={() => setCentralPanel("mdd-inicial")}
                            className={getTabClass("mdd-inicial", activeLegacyState?.codebaseDoc ?? "")}
                            title="Documentación de partida del codebase (AriadneSpecs)"
                          >
                            <FileText className="w-4 h-4" />
                            MDD Inicial
                          </button>
                        )}
                      </>
                    )}
                    {!isLegacyProject && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("benchmark")}
                        className={getTabClass("benchmark", (phase0SummaryContent || "") + (dbgaContent || ""))}
                      >
                        <Target className="w-4 h-4" />
                        Paso 0
                      </button>
                    )}
                    {tabVisible("brd") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("brd")}
                        title="BRD por etapa; requisitos de negocio"
                        className={getTabClass("brd", activeWorkshopStage?.brdContent)}
                      >
                        <ClipboardList className="w-4 h-4" />
                        BRD
                      </button>
                    )}
                    {tabVisible("to-be") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("to-be")}
                        title="Manual To-Be y As-Is por etapa; entrevista en el chat"
                        className={getTabClass("to-be", activeWorkshopStage?.toBeManualContent)}
                      >
                        <BookOpen className="w-4 h-4" />
                        To-Be
                      </button>
                    )}
                    {tabVisible("mdd") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("mdd")}
                        title="Constitución del proyecto (gobierna Blueprint, Contratos API e Infra)"
                        className={getTabClass("mdd", mddContent)}
                      >
                        <FileText className="w-4 h-4" />
                        MDD
                      </button>
                    )}
                    {tabVisible("spec") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("spec")}
                        title="Spec (SDD: what/why); alimenta el MDD"
                        className={getTabClass("spec", specContent)}
                      >
                        <ListOrdered className="w-4 h-4" />
                        Spec
                      </button>
                    )}
                    {tabVisible("architecture") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("architecture")}
                        className={getTabClass("architecture", architectureContent)}
                      >
                        <GitBranch className="w-4 h-4" />
                        Arq.
                      </button>
                    )}
                    {tabVisible("use-cases") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("use-cases")}
                        className={getTabClass("use-cases", useCasesContent)}
                      >
                        <ListOrdered className="w-4 h-4" />
                        Casos
                      </button>
                    )}
                    {tabVisible("user-stories") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("user-stories")}
                        className={getTabClass("user-stories", userStoriesContent)}
                      >
                        <Package className="w-4 h-4" />
                        H.U.
                      </button>
                    )}
                    {tabVisible("blueprint") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("blueprint")}
                        className={getTabClass("blueprint", blueprintContent)}
                      >
                        <LayoutTemplate className="w-4 h-4" />
                        Blueprint
                      </button>
                    )}
                    {tabVisible("ux-ui-guide") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("ux-ui-guide")}
                        className={getTabClass("ux-ui-guide", uxUiGuideContent)}
                      >
                        <Palette className="w-4 h-4" />
                        Guía UX/UI
                      </button>
                    )}
                    {tabVisible("api-contracts") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("api-contracts")}
                        className={getTabClass("api-contracts", apiContractsContent)}
                      >
                        <FileCode className="w-4 h-4" />
                        API
                      </button>
                    )}
                    {tabVisible("logic-flows") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("logic-flows")}
                        className={getTabClass("logic-flows", logicFlowsContent)}
                      >
                        <GitBranch className="w-4 h-4" />
                        Flujos
                      </button>
                    )}
                    {tabVisible("tasks") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("tasks")}
                        title="Tasks (breakdown desde MDD + Blueprint)"
                        className={getTabClass("tasks", tasksContent)}
                      >
                        <ListTodo className="w-4 h-4" />
                        Tasks
                      </button>
                    )}
                    {!isLegacyProject && tabVisible("adrs") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("adrs")}
                        title="ADRs: Decisiones Arquitectónicas Guardadas en Memoria"
                        className={getTabClass("adrs", adrs)}
                      >
                        <Brain className="w-4 h-4" />
                        ADRs
                      </button>
                    )}
                    {tabVisible("infra") && (
                      <button
                        type="button"
                        onClick={() => setCentralPanel("infra")}
                        className={getTabClass("infra", infraContent)}
                      >
                        <Server className="w-4 h-4" />
                        Infra
                      </button>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Renglón 2: Texto del flujo y botones de acción */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-zinc-800 pt-2">
              <p className="text-xs text-zinc-500 min-w-0 sm:flex-1">
                {complexity === "LOW"
                  ? "Complejidad baja: Spec → H.U. → Tasks (MDD / Blueprint / API ocultos). Paso 0 opcional."
                  : complexity === "MEDIUM"
                    ? isLegacyProject
                      ? "Complejidad media (legacy): MDD Inicial opcional (Ariadne); MDD de cambio + Spec → API → Guía UX/UI → Tasks."
                      : "Complejidad media (producto nuevo): sin MDD en barra — insumo Paso 0 / Spec. Entregables: Spec → API → Guía UX/UI → Tasks."
                    : isLegacyProject
                      ? "Legacy: MDD Inicial opcional (Ariadne → doc. de partida); luego Modificación + MDD de cambio y entregables. Cada etapa del taller = una modificación con doc actualizada vía Ariadne."
                      : "Orden: Paso 0 → BRD → To-Be → MDD → Spec → Arq. → Casos → H.U. → Blueprint → Guía UX/UI → API → Flujos → Tasks → Infra"}
              </p>
              <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
                {centralPanel !== "benchmark" && (["spec", "mdd", "ux-ui-guide", "blueprint", "tasks", "api-contracts", "logic-flows", "architecture", "use-cases", "user-stories", "infra", "brd", "to-be"] as const).includes(
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
                      (centralPanel === "infra" && infraContent) ||
                      (centralPanel === "mdd-inicial" && (activeLegacyState?.codebaseDoc || mddInicialLocalContent)) ||
                      (centralPanel === "brd" && !!activeStageId) ||
                      (centralPanel === "to-be" && !!activeStageId)) &&
                    centralPanel !== "tasks" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (centralPanel === "mdd") setMddViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "mdd-inicial") setMddInicialViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "spec") setSpecViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "architecture") setArchitectureViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "use-cases") setUseCasesViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "user-stories") setUserStoriesViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "ux-ui-guide") setUxUiGuideViewMode((m) => m === "design" ? "preview" : m === "preview" ? "source" : "design");
                          else if (centralPanel === "blueprint") setBlueprintViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "api-contracts") setApiContractsViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "logic-flows") setLogicFlowsViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "infra") setInfraViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "brd") setBrdDocViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "to-be") setToBeDocViewMode((m) => (m === "preview" ? "source" : "preview"));
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50"
                      >
                        {(centralPanel === "mdd" ? mddViewMode
                          : centralPanel === "mdd-inicial" ? mddInicialViewMode
                          : centralPanel === "spec" ? specViewMode
                            : centralPanel === "architecture" ? architectureViewMode
                              : centralPanel === "use-cases" ? useCasesViewMode
                                : centralPanel === "user-stories" ? userStoriesViewMode
                                  : centralPanel === "ux-ui-guide" ? uxUiGuideViewMode
                                    : centralPanel === "blueprint" ? blueprintViewMode
                                      : centralPanel === "api-contracts" ? apiContractsViewMode
                                        : centralPanel === "logic-flows" ? logicFlowsViewMode
                                          : centralPanel === "brd" ? brdDocViewMode
                                            : centralPanel === "to-be" ? toBeDocViewMode
                                              : infraViewMode) === "preview" ? (
                          <>
                            <Code className="w-4 h-4" />
                            {centralPanel === "ux-ui-guide" ? "Ver markdown" : "Ver fuente"}
                          </>
                        ) : centralPanel === "ux-ui-guide" && uxUiGuideViewMode === "design" ? (
                          <>
                            <Palette className="w-4 h-4" />
                            Ver preview diseño
                          </>
                        ) : (
                          <>
                            <FileText className="w-4 h-4" />
                            {centralPanel === "ux-ui-guide" ? "Ver preview visual" : "Ver previsualización"}
                          </>
                        )}
                      </button>
                    )
                  )}
                {centralPanel === "architecture" && (
                  <button
                    type="button"
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
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
                    disabled={loading || !effectiveMddTrimmed}
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
                    disabled={loading || !effectiveMddTrimmed}
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
                    disabled={loading || mddReviewing || !effectiveMddTrimmed}
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
                    disabled={loading || mddReviewing || !effectiveMddTrimmed || apiBlueprintDmBlocked}
                    title={
                      apiBlueprintDmBlocked
                        ? apiBlueprintBlockedHint
                        : "Generar contratos API desde el MDD (vista previa antes de guardar)"
                    }
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
                    disabled={loading || mddReviewing || !effectiveMddTrimmed}
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
                    disabled={loading || mddReviewing || !effectiveMddTrimmed}
                    title="Generar infraestructura desde el MDD (vista previa antes de guardar)"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerar
                  </button>
                )}
                {centralPanel === "mdd-inicial" && isLegacyProject && projectId && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await legacyGenerateCodebaseDoc(projectId, {
                        responseMode: codebaseDocResponseMode,
                        stageId: activeStageId ?? undefined,
                      });
                      if (res) setCentralPanel("mdd-inicial");
                    }}
                    disabled={loading}
                    title="Generar documentación de partida del codebase vía AriadneSpecs"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
                  >
                    {loading && loadingReason === "legacy-codebase-doc" ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <RefreshCw className="w-4 h-4 shrink-0" />
                    )}
                    <span className="sm:hidden">
                      {activeLegacyState?.codebaseDoc ? "Regenerar" : "Generar"} doc. partida
                    </span>
                    <span className="hidden sm:inline">
                      {activeLegacyState?.codebaseDoc ? "Regenerar" : "Generar"} documentación de partida
                    </span>
                  </button>
                )}
                {centralPanel === "mdd-inicial" && mddInicialViewMode === "source" && (mddInicialLocalContent || activeLegacyState?.codebaseDoc) && (
                  <button
                    type="button"
                    onClick={async () => {
                      setMddInicialSaving(true);
                      await legacyUpdateCodebaseDoc(projectId, mddInicialLocalContent);
                      setMddInicialSaving(false);
                    }}
                    disabled={mddInicialSaving || mddInicialLocalContent === (activeLegacyState?.codebaseDoc ?? "")}
                    title="Guardar cambios en la documentación"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mddInicialSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar
                  </button>
                )}
                {centralPanel === "brd" && brdDocViewMode === "source" && activeStageId && brdWorkshopDirty && (
                  <button
                    type="button"
                    onClick={() => void persistBrdWorkshopDraft()}
                    disabled={brdTobePersistBusy}
                    title="Guardar BRD en la etapa activa"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {brdTobePersistBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar
                  </button>
                )}
                {centralPanel === "to-be" && toBeDocViewMode === "source" && activeStageId && toBeWorkshopTabDirty && (
                  <button
                    type="button"
                    onClick={() => void persistToBeTabWorkshopDrafts()}
                    disabled={brdTobePersistBusy}
                    title="Guardar Manual To-Be y As-Is en la etapa activa"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {brdTobePersistBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar
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
                    disabled={loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
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
                    onClick={() => sendMessage(uxGuideOneShotChatPrompt, "ux-ui-guide")}
                    disabled={loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
                    title="Generar o regenerar la Guía UX/UI en formato DESIGN.md desde el MDD (se envía al chat). Proyectos nuevos: incluye prompt Google Stitch para el producto."
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {(uxUiGuideContent ?? "").trim() ? "Regenerar" : "Generar"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div
            className={
              centralPanel === "brd" || centralPanel === "to-be"
                ? "flex-1 overflow-hidden p-4 min-h-0 flex flex-col min-w-0"
                : "flex-1 overflow-auto p-4 min-h-0 flex flex-col min-w-0"
            }
          >
            {centralPanel === "mdd-inicial" && project?.projectType === "LEGACY" && projectId && (
              <div className="rounded-lg bg-zinc-800/80 border border-zinc-600 p-6 text-zinc-300 text-sm space-y-4 flex flex-col min-h-0 flex-1">
                <div className="shrink-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 font-medium text-amber-400/90 leading-snug pr-1">
                      MDD Inicial — Documentación del codebase (partida)
                    </p>
                    {(mddInicialLocalContent || activeLegacyState?.codebaseDoc)?.trim() ? (
                      <button
                        type="button"
                        title="Copiar el markdown del MDD inicial al portapapeles (p. ej. para pegar en un chat con IA)"
                        onClick={() => void copyMddInicialMarkdown()}
                        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-amber-500/35 bg-amber-950/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-200/90 hover:bg-amber-950/50"
                      >
                        {mddInicialCopyOk ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {mddInicialCopyOk ? "Copiado" : "Copiar MDD"}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-zinc-500 text-xs leading-relaxed max-w-3xl">
                    Reconstrucción AS-IS desde el índice AriadneSpecs (equivalente al “primer paso” de documentación). Opcional: puedes ir directo a <strong>Modificación</strong> si solo quieres un cambio puntual; para volcar todo el conocimiento del repo aquí, usa el botón de abajo.
                  </p>
                  <details className="w-full min-w-0 rounded-lg border border-zinc-600/60 bg-zinc-900/35 text-left [&_summary::-webkit-details-marker]:hidden open:[&_summary_.ingest-mode-chevron]:rotate-180">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-[11px] font-medium text-zinc-400 hover:bg-zinc-800/40 sm:px-4">
                      <span>Modo ingest (ask_codebase)</span>
                      <ChevronDown
                        className="ingest-mode-chevron h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200"
                        aria-hidden
                      />
                    </summary>
                    <fieldset
                      disabled={loading && loadingReason === "legacy-codebase-doc"}
                      className="m-0 min-w-0 border-0 p-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4"
                    >
                      <div className="space-y-2">
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-zinc-800/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-amber-500"
                            checked={codebaseDocResponseMode === "default"}
                            onChange={() => setCodebaseDocResponseMode("default")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-zinc-200">Chat normal</span>
                            <span className="mt-0.5 block text-xs text-zinc-500 leading-relaxed">
                              Prosa; ReAct en retrieve (hasta 4 vueltas LLM en backend).
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-zinc-800/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-amber-500"
                            checked={codebaseDocResponseMode === "evidence_first"}
                            onChange={() => setCodebaseDocResponseMode("evidence_first")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-zinc-200">MDD / SDD (pesado)</span>
                            <span className="mt-0.5 block text-xs text-zinc-500 leading-relaxed">
                              JSON MDD 7§ vía orchestrator/ingest: puede tardar muchos minutos en repos grandes.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-zinc-800/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-amber-500"
                            checked={codebaseDocResponseMode === "raw_evidence"}
                            onChange={() => setCodebaseDocResponseMode("raw_evidence")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-zinc-200">Evidencia bruta (recomendado)</span>
                            <span className="mt-0.5 block text-xs text-zinc-500 leading-relaxed">
                              Retrieve determinista; suele ser el mejor equilibrio tiempo/calidad para doc. partida.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-zinc-800/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-amber-500"
                            checked={codebaseDocResponseMode === "ingest_mdd"}
                            onChange={() => setCodebaseDocResponseMode("ingest_mdd")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-zinc-200">MDD ingest (solo Ariadne)</span>
                            <span className="mt-0.5 block text-xs text-zinc-500 leading-relaxed">
                              Una llamada <code className="text-zinc-400">evidence_first</code>: salida normalizada del
                              orchestrator. Sin agente escalonado ni segunda pasada en The Forge; si falla, fallback
                              clásico <code className="text-zinc-400">raw_evidence</code>.
                            </span>
                          </span>
                        </label>
                      </div>
                    </fieldset>
                  </details>
                </div>
                {activeLegacyState?.codebaseDoc || mddInicialLocalContent ? (
                  <>
                    <div className="flex-1 overflow-auto min-h-0 flex flex-col">
                      {mddInicialViewMode === "preview" ? (
                        <div className="flex-1 overflow-auto rounded border border-zinc-600 bg-zinc-900/80 p-4 min-h-0">
                          <MddViewer content={mddInicialLocalContent || activeLegacyState?.codebaseDoc || ""} />
                        </div>
                      ) : (
                        <textarea
                          value={mddInicialLocalContent}
                          onChange={(e) => setMddInicialLocalContent(e.target.value)}
                          placeholder="# Documentación del Codebase (partida)\n\nGenera la documentación o escribe aquí..."
                          className="flex-1 min-h-[200px] w-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                          spellCheck={false}
                        />
                      )}
                    </div>
                    <LegacyMcpDebugPanel trace={legacyMcpDebugTrace} />
                    <div className="shrink-0 pt-4 border-t border-zinc-700 mt-4">
                      <button
                        type="button"
                        onClick={async () => {
                          if ((mddInicialLocalContent || activeLegacyState?.codebaseDoc) && mddInicialViewMode === "source" && mddInicialLocalContent !== (activeLegacyState?.codebaseDoc ?? "")) {
                            await legacyUpdateCodebaseDoc(projectId, mddInicialLocalContent);
                          }
                          await legacyGenerateDeliverables(projectId);
                          if (projectId) fetchProject(projectId);
                        }}
                        disabled={loading || !(mddInicialLocalContent || activeLegacyState?.codebaseDoc)?.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Genera Spec, Arq., Casos, Blueprint, API, etc. desde la documentación del codebase (ingeniería inversa)"
                      >
                        {loading && loadingReason === "legacy-deliverables" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Generar entregables (ingeniería inversa)
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded border border-dashed border-zinc-600 bg-zinc-900/50 p-8 text-center text-zinc-500 space-y-4">
                    {loading && loadingReason === "legacy-codebase-doc" ? (
                      <p className="flex items-center justify-center gap-2 text-amber-300/80">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        {LEGACY_CODEBASE_DOC_STEPS[legacyStepIndex % LEGACY_CODEBASE_DOC_STEPS.length]}
                      </p>
                    ) : (
                      <>
                        <p className="text-zinc-400 text-sm max-w-md mx-auto">
                          Aún no hay documentación de partida. Genera un borrador largo desde AriadneSpecs (varias consultas al MCP); luego puedes usar <strong>Generar entregables</strong> para Spec, arquitectura, etc. (ingeniería inversa).
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await legacyGenerateCodebaseDoc(projectId, {
                              responseMode: codebaseDocResponseMode,
                              stageId: activeStageId ?? undefined,
                            });
                            if (res?.codebaseDoc) setCentralPanel("mdd-inicial");
                          }}
                          disabled={loading}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500/25 text-amber-200 border border-amber-500/40 hover:bg-amber-500/35 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                        >
                          {loading && loadingReason === "legacy-codebase-doc" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : null}
                          Generar MDD inicial desde AriadneSpecs
                        </button>
                        <p className="text-xs text-zinc-600">
                          También: &quot;Generar documentación de partida&quot; en la barra superior (misma acción).
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {centralPanel === "legacy" && project?.projectType === "LEGACY" && projectId && (
              <div className="rounded-lg bg-zinc-800/80 border border-zinc-600 p-6 text-zinc-300 text-sm space-y-6">
                <p className="font-medium text-amber-400/90">Flujo de modificación (Legacy)</p>
                {!activeLegacyState?.codebaseDoc?.trim() ? (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-4 py-3 space-y-3 text-amber-100/90 text-sm">
                    <p>
                      <strong className="text-amber-200">Primera documentación del repo:</strong> en la pestaña{" "}
                      <strong>MDD Inicial</strong> puedes generar (o regenerar) un documento de partida desde AriadneSpecs —
                      base para entregables AS-IS. Cada <strong>nueva etapa</strong> del taller es una modificación que mantiene
                      actualizada la doc consultando Ariadne.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await legacyGenerateCodebaseDoc(projectId, {
                            responseMode: codebaseDocResponseMode,
                            stageId: activeStageId ?? undefined,
                          });
                          if (res?.codebaseDoc?.trim()) setCentralPanel("mdd-inicial");
                        }}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/30 text-amber-100 border border-amber-400/50 hover:bg-amber-500/40 text-xs font-medium disabled:opacity-50"
                      >
                        {loading && loadingReason === "legacy-codebase-doc" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        Generar MDD inicial (Ariadne)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCentralPanel("mdd-inicial")}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-500 text-zinc-300 hover:bg-zinc-700/50 text-xs"
                      >
                        Ir a MDD Inicial
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Documentación de partida lista. Puedes regenerarla en <strong>MDD Inicial</strong>. Este panel es para el{" "}
                    <strong>MDD de cambio</strong> de esta etapa.
                  </p>
                )}
                {!activeLegacyState?.filesToModify?.length && !activeLegacyState?.questions?.length ? (
                  <>
                    <p>Describe la modificación que quieres hacer al proyecto. AriadneSpecs analizará el código y te devolverá archivos a modificar y preguntas para afinar.</p>
                    <textarea
                      value={legacyDescriptionInput}
                      onChange={(e) => setLegacyDescriptionInput(e.target.value)}
                      placeholder="Ej.: Añadir endpoint POST /users para registro con validación de email..."
                      className="w-full min-h-[120px] bg-zinc-900 border border-zinc-600 rounded-lg p-3 text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 outline-none resize-y"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await legacyStart(projectId, legacyDescriptionInput, activeStageId ?? undefined);
                        if (res) setLegacyDescriptionInput("");
                      }}
                      disabled={loading || !legacyDescriptionInput.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Analizar con AriadneSpecs
                    </button>
                  </>
                ) : (
                  <>
                    {activeLegacyState?.filesToModify?.length ? (
                      <div>
                        <h4 className="text-zinc-400 font-medium mb-2">Archivos a modificar</h4>
                        <ul className="list-disc list-inside text-zinc-400 space-y-1">
                          {activeLegacyState.filesToModify.map((f, i) => {
                            const path = typeof f === "string" ? f : f.path;
                            const repoId = typeof f === "string" ? null : f.repoId;
                            return (
                              <li key={i} className="font-mono text-xs">
                                {path}
                                {repoId ? <span className="text-zinc-500 ml-1">(repo: {repoId.slice(0, 8)}…)</span> : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    {activeLegacyState?.questions?.length ? (
                      <div>
                        <h4 className="text-zinc-400 font-medium mb-2">Preguntas para afinar</h4>
                        {activeLegacyState.suggestedAnswers && Object.keys(activeLegacyState.suggestedAnswers).length > 0 ? (
                          <p className="text-zinc-500 text-xs mb-2">Respuestas sugeridas por AriadneSpecs (puedes editarlas).</p>
                        ) : null}
                        <div className="space-y-3">
                          {activeLegacyState.questions.map((q, i) => (
                            <div key={i}>
                              <label className="block text-zinc-400 text-xs mb-1">{q}</label>
                              <input
                                type="text"
                                value={legacyAnswersInput[i] ?? activeLegacyState?.answers?.[String(i)] ?? activeLegacyState?.suggestedAnswers?.[i] ?? ""}
                                onChange={(e) => setLegacyAnswersInput((prev) => ({ ...prev, [i]: e.target.value }))}
                                placeholder={activeLegacyState?.suggestedAnswers?.[i] ? undefined : "Escribe tu respuesta…"}
                                className="w-full bg-zinc-900 border border-zinc-600 rounded px-2 py-1.5 text-zinc-200 focus:ring-2 focus:ring-amber-500 outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const answers: Record<string, string> = {};
                          activeLegacyState?.questions?.forEach((_, i) => {
                            const v = (legacyAnswersInput[i] ?? activeLegacyState?.answers?.[String(i)] ?? activeLegacyState?.suggestedAnswers?.[i])?.trim();
                            if (v) answers[String(i)] = v;
                          });
                          await legacyAnswer(projectId, answers, activeStageId ?? undefined);
                        }}
                        disabled={loading}
                        className="px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 text-sm disabled:opacity-50"
                      >
                        Guardar respuestas
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const answers: Record<string, string> = {};
                          activeLegacyState?.questions?.forEach((_, i) => {
                            const v = (legacyAnswersInput[i] ?? activeLegacyState?.answers?.[String(i)] ?? activeLegacyState?.suggestedAnswers?.[i])?.trim();
                            if (v) answers[String(i)] = v;
                          });
                          await legacyAnswer(projectId, answers, activeStageId ?? undefined);
                          const ok = await legacyGenerateMdd(projectId, activeStageId ?? undefined);
                          if (ok) setCentralPanel("mdd");
                        }}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Generar MDD
                      </button>
                    </div>
                    {loading && loadingReason === "legacy-mdd" && (
                      <p className="mt-2 text-amber-300/80 text-xs flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        {LEGACY_MDD_STEPS[legacyStepIndex % LEGACY_MDD_STEPS.length]}
                      </p>
                    )}
                  </>
                )}
                {((project.mddContent ?? "").trim() || (activeLegacyState?.codebaseDoc ?? "").trim()) ? (
                  <div className="border-t border-zinc-700 pt-4">
                    <button
                      type="button"
                      onClick={async () => {
                        await legacyGenerateDeliverables(projectId);
                        if (projectId) fetchProject(projectId);
                      }}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {(project.mddContent ?? "").trim() ? "Generar entregables" : "Generar entregables (ingeniería inversa)"}
                    </button>
                    {loading && loadingReason === "legacy-deliverables" && (
                      <p className="mt-2 text-green-300/80 text-xs flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        {LEGACY_DELIVERABLES_STEPS[legacyStepIndex % LEGACY_DELIVERABLES_STEPS.length]}
                      </p>
                    )}
                  </div>
                ) : null}
                {error ? <p className="text-red-400 text-xs">{error}</p> : null}
              </div>
            )}
            {centralPanel === "benchmark" && (
              <>
                {loading && loadingReason === "phase0-deep-research" && (
                  <div className="shrink-0 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 mb-2 text-amber-200/90 text-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Generando Deep Research… Suele tardar 1–2 minutos; no cierres la página.</span>
                  </div>
                )}
                <div className="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
                  <button
                    type="button"
                    onClick={async () => {
                      await suggestBrdTobeFromDbga(projectId, { stageId: activeStageId ?? undefined });
                      setCentralPanel("brd");
                    }}
                    disabled={loading && loadingReason === "brd-tobe-from-dbga"}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-amber-400 hover:bg-amber-500/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Generar BRD desde el Benchmark (DBGA); luego revisa y aprueba en el tab BRD"
                  >
                    {loading && loadingReason === "brd-tobe-from-dbga" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Generar BRD con agentes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCentralPanel("brd");
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50 text-sm"
                    title="Ir a BRD y editar manualmente o usar el chat"
                  >
                    Ir a BRD (editar)
                  </button>
                  {dbgaContent != null && dbgaContent !== "" && (
                    <button
                      type="button"
                      onClick={() => projectId && clearDbgaContent(projectId)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 text-sm"
                      title="Borrar el Benchmark (podrás generar uno nuevo después)"
                    >
                      <Trash2 className="w-4 h-4" />
                      Borrar benchmark
                    </button>
                  )}
                </div>
                {dbgaContent != null && dbgaContent !== "" && (
                  <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-700 pt-4">
                    <h3 className="shrink-0 text-sm font-medium text-zinc-400 mb-2">Benchmark (DBGA) — opcional</h3>
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
                <BrdTobeStagePanel
                  panel="gate-only"
                  projectId={projectId}
                  requireBrdTobeGate={project?.requireBrdTobeGate === true}
                  activeStageId={activeStageId}
                  stage={activeWorkshopStage}
                  isLegacyProject={isLegacyProject}
                  codebaseDocChars={codebaseDocCharCount}
                  dbgaContentChars={dbgaContentCharCount}
                />
                <div className="flex shrink-0 flex-wrap items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => void (isLegacyProject ? legacyGenerateMdd(projectId, activeStageId ?? undefined) : generateMddFromBenchmark(projectId))}
                    disabled={(loading && (loadingReason === "mdd" || loadingReason === "legacy-mdd")) || (project?.requireBrdTobeGate === true && (!activeWorkshopStage?.brdApprovedAt || !activeWorkshopStage?.toBeApprovedAt))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/80 text-zinc-900 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {(loading && (loadingReason === "mdd" || loadingReason === "legacy-mdd")) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {mddContent?.trim() ? "Regenerar MDD" : "Generar MDD"}
                  </button>
                  {(project?.requireBrdTobeGate === true && (!activeWorkshopStage?.brdApprovedAt || !activeWorkshopStage?.toBeApprovedAt)) ? (
                    <span className="text-xs text-amber-400">Requiere BRD y To-Be aprobados (panel BRD/To-Be)</span>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {isLegacyProject
                        ? "Genera MDD desde BRD + To-Be de la etapa activa"
                        : "Genera MDD desde el DBGA / Benchmark"}
                    </span>
                  )}
                </div>
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
                    onChange={(e) => setArchitectureContent(e.target.value)}
                    onBlur={handleArchitectureBlur}
                    placeholder="# Arquitectura del sistema\n\nMódulos, datos, APIs y flujos del producto (según MDD y codebase)..."
                    className="w-full min-h-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
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
                    onChange={(e) => setUseCasesContent(e.target.value)}
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
                    disabled={loading || !effectiveMddTrimmed}
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
                    onChange={(e) => setUserStoriesContent(e.target.value)}
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
                    disabled={loading || !effectiveMddTrimmed}
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
                {uxUiGuideViewMode === "design" ? (
                  <div className="flex-1 overflow-auto min-h-0">
                    <DesignMdPreview content={uxUiGuideContent ?? ""} />
                  </div>
                ) : uxUiGuideViewMode === "preview" ? (
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
                    onClick={() => sendMessage(uxGuideOneShotChatPrompt, "ux-ui-guide")}
                    disabled={loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
                    title="Generar o regenerar la Guía UX/UI en formato DESIGN.md desde el MDD (se envía al chat). Proyectos nuevos: incluye prompt Google Stitch para el producto."
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
                        disabled={!specDirty}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500/20"
                      >
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 h-full min-h-0">
                    <div className="shrink-0 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => persistSpecContent(specContent || "")}
                        disabled={!specDirty}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500/20"
                      >
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                    <textarea
                      value={specContent || ""}
                      onChange={(e) => setSpecContent(e.target.value)}
                      onBlur={handleSpecBlur}
                      placeholder="# Spec\n\nEl contenido del Spec se genera aquí o puedes escribirlo manualmente..."
                      className="flex-1 min-h-0 w-full bg-zinc-800/50 border border-zinc-600 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                      spellCheck={false}
                    />
                  </div>
                )
              ) : (
                <DocEmptyState
                  icon={ListOrdered}
                  title="Spec"
                  description="Spec = Benchmark + alcance. Alimenta el MDD; revísalo antes de dar por cerrado el MDD."
                  onGenerate={() => generateSpec(projectId)}
                  loading={loading}
                  hasMdd={!!(dbgaContent?.trim() || effectiveMddTrimmed)}
                />
              )
            )}
            {centralPanel === "brd" && projectId && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                {brdWorkshopDirty && (
                  <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <span className="text-sm text-amber-200/90">Cambios sin guardar en el BRD de esta etapa.</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBrdWorkshopDraft(activeWorkshopStage?.brdContent ?? "")}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void persistBrdWorkshopDraft()}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded bg-amber-500/80 px-3 py-1.5 text-zinc-900 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {brdTobePersistBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Grabar
                      </button>
                    </div>
                  </div>
                )}
                <BrdTobeStagePanel
                  panel="brd"
                  projectId={projectId}
                  requireBrdTobeGate={project?.requireBrdTobeGate === true}
                  activeStageId={activeStageId}
                  stage={activeWorkshopStage}
                  isLegacyProject={isLegacyProject}
                  codebaseDocChars={codebaseDocCharCount}
                  dbgaContentChars={dbgaContentCharCount}
                  brdDraft={brdWorkshopDraft}
                  onBrdDraftChange={setBrdWorkshopDraft}
                  docViewMode={brdDocViewMode}
                />
              </div>
            )}
            {centralPanel === "to-be" && projectId && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                {toBeWorkshopTabDirty && (
                  <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <span className="text-sm text-amber-200/90">Cambios sin guardar en To-Be / As-Is de esta etapa.</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setToBeWorkshopDraft(activeWorkshopStage?.toBeManualContent ?? "");
                          setAsIsWorkshopDraft(activeWorkshopStage?.asIsManualContent ?? "");
                        }}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void persistToBeTabWorkshopDrafts()}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded bg-amber-500/80 px-3 py-1.5 text-zinc-900 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {brdTobePersistBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Grabar
                      </button>
                    </div>
                  </div>
                )}
                <BrdTobeStagePanel
                  panel="tobe"
                  projectId={projectId}
                  requireBrdTobeGate={project?.requireBrdTobeGate === true}
                  activeStageId={activeStageId}
                  stage={activeWorkshopStage}
                  isLegacyProject={isLegacyProject}
                  codebaseDocChars={codebaseDocCharCount}
                  dbgaContentChars={dbgaContentCharCount}
                  tobeDraft={toBeWorkshopDraft}
                  onTobeDraftChange={setToBeWorkshopDraft}
                  asisDraft={asIsWorkshopDraft}
                  onAsisDraftChange={setAsIsWorkshopDraft}
                  docViewMode={toBeDocViewMode}
                />
              </div>
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
                  hasMdd={!!effectiveMddTrimmed}
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
                      disabled={loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
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
                  hasMdd={!!(effectiveMddTrimmed && blueprintContent?.trim())}
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
                  hasMdd={!!effectiveMddTrimmed}
                  generateBlocked={apiBlueprintDmBlocked}
                  generateBlockedReason={apiBlueprintBlockedHint}
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
                  hasMdd={!!effectiveMddTrimmed}
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
                  hasMdd={!!effectiveMddTrimmed}
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

        {/* Columna C: Semáforo + Costos (lógica cost-calculator) */}
        <section
          className={cn(
            "min-h-0 overflow-y-auto bg-zinc-800/50 p-3 sm:p-4 space-y-6 lg:min-h-0",
            "flex flex-col",
            mobileWorkshopColumn === "metrics" ? "flex flex-1 min-h-0" : "hidden lg:flex lg:flex-col",
          )}
        >
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Semáforo
            </h3>
            <div
              className={`flex items-center gap-3 rounded-lg p-4 ${semaphoreConfig.bg} border border-zinc-600`}
            >
              <SemaphoreIcon
                className={`w-10 h-10 ${semaphoreConfig.color}`}
              />
              <div>
                <p className={`font-semibold ${semaphoreConfig.color}`}>
                  {semaphoreConfig.label}
                </p>
                <p className="text-zinc-400 text-sm">
                  Precisión {precisionScore}%
                </p>
              </div>
            </div>
            {/* Botón Ver detalles de auditoría */}
            <button
              onClick={() => setShowAuditModal(true)}
              className="mt-3 text-xs text-zinc-400 hover:text-amber-400 underline decoration-zinc-600 underline-offset-4 flex items-center gap-1"
            >
              <FileText className="w-3 h-3" />
              Ver logs y desglose
            </button>
          </div>

          {conformance && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Conformance vs MDD
                </h3>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={conformanceUseLlm}
                    onChange={(e) => {
                      setConformanceUseLlm(e.target.checked);
                      fetchConformance(projectId!, { useLlm: e.target.checked });
                    }}
                    className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
                  />
                  Incluir verificación con IA
                </label>
              </div>
              <div className="rounded-lg border border-zinc-600 p-3 space-y-2 text-xs">
                <p className={conformance.blueprint.ok ? "text-green-400" : "text-amber-400"}>
                  Blueprint: {conformance.blueprint.ok ? "Cumple" : `Gaps: ${conformance.blueprint.gaps.join("; ")}`}
                </p>
                {!conformance.blueprint.ok && conformance.blueprint.gaps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => generateBlueprint(projectId!, { preview: true, gapsFeedback: conformance!.blueprint.gaps.join("\n") })}
                    disabled={loading || mddReviewing}
                    className="text-amber-400 hover:underline disabled:opacity-50"
                  >
                    Regenerar Blueprint con gaps
                  </button>
                )}
                <p
                  className={
                    conformance.blueprintDataModel?.ok !== false ? "text-green-400" : "text-red-400 font-medium"
                  }
                >
                  Blueprint vs MDD §3 (modelo datos):{" "}
                  {conformance.blueprintDataModel?.ok !== false
                    ? "Cumple — se puede generar Contratos API"
                    : `Bloquea generación API: ${(conformance.blueprintDataModel?.gaps ?? []).join("; ")}`}
                </p>
                {!conformance.blueprintDataModel?.ok &&
                  (conformance.blueprintDataModel?.gaps?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        generateBlueprint(projectId!, {
                          preview: true,
                          gapsFeedback: conformance!.blueprintDataModel!.gaps.join("\n"),
                        })
                      }
                      disabled={loading || mddReviewing}
                      className="text-amber-400 hover:underline disabled:opacity-50"
                    >
                      Regenerar Blueprint (gaps §3)
                    </button>
                  )}
                <p className={conformance.api.ok ? "text-green-400" : "text-amber-400"}>
                  API: {conformance.api.ok ? "Cumple" : `Faltan en el doc. de API (entregable): ${conformance.api.missingInApi.join(", ")}`}
                </p>
                {!conformance.api.ok && (conformance.api.missingInApi.length > 0 || conformance.api.extraInApi.length > 0) && (
                  <button
                    type="button"
                    onClick={() => generateApiContracts(projectId!, { preview: true, gapsFeedback: [...conformance!.api.missingInApi, ...conformance!.api.extraInApi].join("\n") })}
                    disabled={loading || mddReviewing || apiBlueprintDmBlocked}
                    title={apiBlueprintDmBlocked ? apiBlueprintBlockedHint : undefined}
                    className="text-amber-400 hover:underline disabled:opacity-50"
                  >
                    Regenerar API con gaps
                  </button>
                )}
                <p className={conformance.logicFlows.ok ? "text-green-400" : "text-amber-400"}>
                  Flujos: {conformance.logicFlows.ok ? "Cumple" : `Gaps: ${conformance.logicFlows.gaps.join("; ")}`}
                </p>
                {!conformance.logicFlows.ok && conformance.logicFlows.gaps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => generateLogicFlows(projectId!, { gapsFeedback: conformance!.logicFlows.gaps.join("\n") })}
                    disabled={loading || mddReviewing}
                    className="text-amber-400 hover:underline disabled:opacity-50"
                  >
                    Regenerar Flujos con gaps
                  </button>
                )}
                <p className={conformance.infra.ok ? "text-green-400" : "text-amber-400"}>
                  Infra: {conformance.infra.ok ? "Cumple" : `Gaps: ${conformance.infra.gaps.join("; ")}`}
                </p>
                {!conformance.infra.ok && conformance.infra.gaps.length > 0 && (
                  <button
                    type="button"
                    onClick={() => generateInfra(projectId!, { preview: true, gapsFeedback: conformance!.infra.gaps.join("\n") })}
                    disabled={loading || mddReviewing}
                    className="text-amber-400 hover:underline disabled:opacity-50"
                  >
                    Regenerar Infra con gaps
                  </button>
                )}
              </div>
            </div>
          )}

          {documentCompleteness && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Documentos ({documentCompleteness.overall}%)
              </h3>
              <div className="rounded-lg border border-zinc-600 p-3 space-y-1.5 text-xs">
                {[
                  ["brdContent", "BRD"],
                  ["toBeManualContent", "To-Be"],
                  ["asIsManualContent", "As-Is"],
                  ["specContent", "SPEC"],
                  ["architectureContent", "Arquitectura"],
                  ["useCasesContent", "Casos de Uso"],
                  ["userStoriesContent", "Historias"],
                  ["blueprintContent", "Blueprint"],
                  ["apiContractsContent", "API"],
                  ["logicFlowsContent", "Flujos"],
                  ["infraContent", "Infra"],
                  ["tasksContent", "Tasks"],
                ].map(([key, label]) => {
                  const score = (documentCompleteness as unknown as Record<string, number>)[key as string] ?? 0;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-zinc-500">{label}</span>
                      <span className={
                        score >= 100 ? "text-green-400" :
                        score >= 50 ? "text-amber-400" :
                        score > 0 ? "text-red-400" : "text-zinc-600"
                      }>
                        {score >= 100 ? "✓" : score >= 50 ? "◐" : score > 0 ? "○" : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {crossDocumentGaps && crossDocumentGaps.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Brechas ({crossDocumentGaps.length})
              </h3>
              <div className="rounded-lg border border-amber-700/50 bg-amber-900/20 p-3 space-y-1.5 text-xs">
                {crossDocumentGaps.slice(0, 5).map((gap, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="shrink-0 text-amber-500 mt-0.5">⚠</span>
                    <span className="text-zinc-400">
                      <strong className="text-zinc-300">{gap.concept}</strong> en {gap.from} → {gap.to}{" "}
                      <span className={gap.severity === "missing" ? "text-red-400" : "text-amber-500"}>
                        ({gap.severity === "missing" ? "no cubierto" : "parcial"})
                      </span>
                    </span>
                  </div>
                ))}
                {crossDocumentGaps.length > 5 && (
                  <p className="text-zinc-500">+{crossDocumentGaps.length - 5} más</p>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Estimación (MXN)
            </h3>
            <div className="rounded-lg border border-zinc-600 p-4 space-y-3">
              <p className="text-zinc-400 text-sm">
                {costDisplay.totalHours.toFixed(1)} h totales
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Nómina interna</p>
                  <p className="text-xl font-bold text-amber-400">
                    ${costDisplay.totalMxn.toLocaleString("es-MX")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Costo IA</p>
                  <p className="text-xl font-bold text-purple-400">
                    ${costDisplay.totalMxnIA.toLocaleString("es-MX")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Valor mercado</p>
                  <p className="text-xl font-bold text-green-400">
                    ${(costDisplay.totalMxnMarket ?? costDisplay.totalMxn).toLocaleString("es-MX")}
                  </p>
                </div>
              </div>
              {costDisplay.teamStructure &&
                Object.keys(costDisplay.teamStructure).length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-zinc-600 text-xs text-zinc-500">
                    {Object.entries(costDisplay.teamStructure).map(
                      ([role, count]) =>
                        count ? (
                          <div key={role} className="flex flex-col">
                            <span className="font-medium text-zinc-400 capitalize">{role}</span>
                            <span>{count} {costDisplay.rolesHours?.[role] != null ? `· ${Number(costDisplay.rolesHours[role]).toFixed(1)} h` : ""}</span>
                          </div>
                        ) : null,
                    )}
                  </div>
                )}
            </div>
            <p className="text-zinc-500 text-xs mt-2">
              El motor de estimación siempre calcula; en Rojo puedes ver viabilidad económica antes de completar el diseño.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateDeliverables}
            disabled={!canGenerate || cascadeRunning || mddReviewing}
            className="w-full py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500 text-white disabled:bg-zinc-600 disabled:hover:bg-zinc-600 flex items-center justify-center gap-2"
          >
            {cascadeRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando entregables…
              </>
            ) : canGenerate ? (
              "Generar Entregables"
            ) : !semaphoreGreen ? (
              "Semáforo en Verde para generar"
            ) : (
              "Genera o revisa el Spec antes de generar entregables"
            )}
          </button>

          {/* Feedback del auditor debajo del semáforo (selectores Zustand → re-render al actualizar liveMetrics / auditorFeedback) */}
          {auditorFeedback ? (
            <div className="mt-4 p-4 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 leading-relaxed shadow-sm">
              <strong className="block text-zinc-100 mb-1">
                Auditoría ({liveMetrics?.precision ?? 0}% - {auditFeedbackStatusLabel}):
              </strong>
              {auditorFeedback}
            </div>
          ) : null}
        </section>

        <nav
          className="lg:hidden shrink-0 grid grid-cols-3 border-t border-zinc-700 bg-zinc-950/95 backdrop-blur-sm pb-[max(4px,env(safe-area-inset-bottom))]"
          aria-label="Cambiar panel del workshop"
        >
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("chat")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation min-h-[52px]",
              mobileWorkshopColumn === "chat"
                ? "text-amber-400 bg-zinc-800/90 border-t-2 border-t-amber-500 -mt-px"
                : "text-zinc-500 border-t-2 border-t-transparent active:bg-zinc-800/50",
            )}
          >
            <MessageSquare className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("workspace")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation min-h-[52px]",
              mobileWorkshopColumn === "workspace"
                ? "text-amber-400 bg-zinc-800/90 border-t-2 border-t-amber-500 -mt-px"
                : "text-zinc-500 border-t-2 border-t-transparent active:bg-zinc-800/50",
            )}
          >
            <FileText className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
            Docs
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("metrics")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation min-h-[52px]",
              mobileWorkshopColumn === "metrics"
                ? "text-amber-400 bg-zinc-800/90 border-t-2 border-t-amber-500 -mt-px"
                : "text-zinc-500 border-t-2 border-t-transparent active:bg-zinc-800/50",
            )}
          >
            <Package className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
            Estado
          </button>
        </nav>
        {
          showAuditModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowAuditModal(false)}>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-500" />
                    Detalles de Auditoría
                  </h2>
                  <button onClick={() => setShowAuditModal(false)} className="text-zinc-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  {/* Sección Desglose */}
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider">Desglose de Calificación</h3>
                    {precisionBreakdown ? (
                      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 rounded-lg border border-zinc-700">
                        <table className="w-full text-sm text-left min-w-[520px] sm:min-w-0">
                          <thead className="bg-zinc-800/50 text-zinc-400 border-b border-zinc-700">
                            <tr>
                              <th className="px-4 py-3 font-medium">Sección</th>
                              <th className="px-4 py-3 font-medium">Agente</th>
                              <th className="px-4 py-3 font-medium text-right">Calificación</th>
                              <th className="px-4 py-3 font-medium">Por qué</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-700/50">
                            {[
                              { section: "Contexto y alcance", agent: "Clarificador", value: precisionBreakdown.contexto, reasonKey: "contexto" as const },
                              { section: "Modelo de datos", agent: "Arquitecto de Software", value: precisionBreakdown.modeloDatos, reasonKey: "modeloDatos" as const },
                              { section: "Contratos API", agent: "Arquitecto de Software", value: precisionBreakdown.apiContracts, reasonKey: "apiContracts" as const },
                              { section: "Seguridad", agent: "Arquitecto de Seguridad", value: precisionBreakdown.seguridad, reasonKey: "seguridad" as const },
                              { section: "Integración", agent: "Ingeniero de Integración", value: precisionBreakdown.integracion, reasonKey: "integracion" as const },
                            ].map((row, i) => (
                              <tr key={i} className="hover:bg-zinc-800/30">
                                <td className="px-4 py-2.5 text-zinc-300 align-top">{row.section}</td>
                                <td className="px-4 py-2.5 text-zinc-400 align-top">{row.agent}</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-medium align-top ${(row.value ?? 0) >= 90 ? "text-green-400" : (row.value ?? 0) >= 50 ? "text-amber-400" : "text-red-400"}`}>
                                  {row.value ?? 0}%
                                </td>
                                <td className="px-4 py-2.5 text-zinc-500 text-xs max-w-[280px] align-top">
                                  {precisionBreakdown.sectionReasons?.[row.reasonKey] ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-zinc-500 italic">No hay desglose disponible aún.</p>
                    )}
                  </div>

                  {/* Sección Logs */}
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-3 uppercase tracking-wider flex items-center justify-between">
                      <span>Audit Trail (Logs)</span>
                      <span className="text-xs normal-case text-zinc-500 font-normal">Secuencia de ejecución de agentes</span>
                    </h3>
                    {auditTrail && auditTrail.length > 0 ? (
                      <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4 overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar">
                        <pre className="font-mono text-xs text-green-400/90 whitespace-pre-wrap leading-relaxed">
                          {auditTrail.join(" -> ")}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-zinc-500 italic">No hay logs de auditoría disponibles aún.</p>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end shrink-0">
                  <button
                    onClick={() => setShowAuditModal(false)}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )
        }
        {
          pendingDeliverablePreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 shrink-0">
                  <h2 className="text-lg font-semibold text-amber-400">
                    Vista previa: {pendingDeliverablePreview.kind === "blueprint" ? "Blueprint" : pendingDeliverablePreview.kind === "api" ? "Contratos API" : "Infra"}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => discardDeliverable()}
                      className="px-3 py-1.5 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 text-sm"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeliverable()}
                      className="px-3 py-1.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-sm font-medium"
                    >
                      Confirmar y guardar
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  <MddViewer content={pendingDeliverablePreview.content} />
                </div>
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
}
