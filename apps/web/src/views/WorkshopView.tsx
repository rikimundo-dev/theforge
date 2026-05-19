import { useCallback, useEffect, useRef, useState, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import {
  Cloud,
  CloudOff,
  AlertTriangle,
  Printer,
  FileText,
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
  ArrowDown,
  ArrowUp,
  HelpCircle,
  Layers,
  MessageSquare,
  Copy,
  Check,
  Rocket,
  ChevronDown,
  Plus,
  Globe,
  Lock,
  Pencil,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CodebaseDocResponseMode } from "@theforge/shared-types";
import { useWorkshopStore, type Status } from "../store/workshopStore";
import { apiFetch, API_BASE } from "../utils/apiClient";
import ChatContainer from "../components/ChatContainer";
import ComplexityPendingBanner from "../components/ComplexityPendingBanner";
import MddViewer from "../components/MddViewer";
import { replaceYamlFrontMatter } from "../components/DesignMdPreview";
import WorkshopHelpModal from "../components/WorkshopHelpModal";
import { WorkshopMetricsColumnInner } from "./WorkshopMetricsColumnInner";
import LegacyMcpDebugPanel from "../components/LegacyMcpDebugPanel/LegacyMcpDebugPanel";
import { BrdStagePanel } from "../components/BrdStagePanel";
import { downloadDocumentsZip } from "../utils/downloadDocumentsZip";
import { isTabVisibleForComplexity, type WorkshopDocTab } from "../utils/complexityTabs";
import { StandardDocPanel } from "../components/StandardDocPanel";
import { DocEmptyState } from "../components/DocEmptyState";
import { WorkshopRegenButton } from "../components/WorkshopRegenButton";
import { WorkshopDownloadZipButton } from "../components/WorkshopDownloadZipButton";
import { UxUiGuidePanel } from "../components/UxUiGuidePanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { AdrsPanel } from "../components/AdrsPanel";
import { useAutoSaveContent } from "../hooks/useAutoSaveContent";
import type { LucideIcon } from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui";
import { WorkshopFlowOrderModal } from "../components/WorkshopFlowOrderModal";
import {
  AiGenerationPanel,
  AiGenerativeDots,
} from "../components/AiGenerationLoader";
import {
  LEGACY_CODEBASE_DOC_STEPS,
  LEGACY_DELIVERABLES_STEPS,
  LEGACY_MDD_STEPS,
} from "../constants/legacy-workshop-loading-steps";

/** Stage selector + “Nueva etapa” only (primary controls with a light frame). */
const WORKSHOP_HEADER_CTL =
  "h-11 min-h-[44px] sm:h-9 sm:min-h-0 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_78%,var(--muted))] text-sm font-medium text-[var(--foreground)] shadow-sm transition-[background-color,border-color,color] touch-manipulation";

const WORKSHOP_HEADER_CTL_HOVER =
  "hover:bg-[color-mix(in_oklch,var(--muted)_52%,var(--card))] hover:border-[color-mix(in_oklch,var(--border)_88%,var(--foreground))]";

/** Workshop header: framed square icon controls (Nueva etapa, ZIP, Hermes, Ayuda). */
const WORKSHOP_HEADER_ICON_BTN = cn(
  WORKSHOP_HEADER_CTL,
  WORKSHOP_HEADER_CTL_HOVER,
  "inline-flex w-11 shrink-0 items-center justify-center p-0 sm:w-9",
);

const WORKSHOP_MDD_ACTION_PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:cursor-not-allowed disabled:opacity-50";

/** Preview/source toggle and flow-order: same outline chip as `Button variant="outline"` (needs `border` width, not only color). */
const WORKSHOP_DOC_TOOLBAR_ICON_BTN =
  "rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_65%,var(--muted))] text-[var(--foreground)] shadow-sm hover:border-[var(--border-hover)] hover:bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] hover:text-[var(--primary)] focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))]";

/** Same chrome as `Button size="icon"` + `WORKSHOP_DOC_TOOLBAR_ICON_BTN` for native `<button>` triggers. */
const WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:pointer-events-none disabled:opacity-50",
  WORKSHOP_DOC_TOOLBAR_ICON_BTN,
);

/** Desktop workshop: chat column width (px). Al soltar el resize por debajo del mínimo, el panel se colapsa al rail. */
const LG_CHAT_PANEL_WIDTH_MIN_PX = 260;
const LG_CHAT_PANEL_WIDTH_MAX_PX = 420;
const LG_CHAT_PANEL_DEFAULT_PX = 320;

function clampLgChatPanelWidthPx(value: number): number {
  if (!Number.isFinite(value)) return LG_CHAT_PANEL_DEFAULT_PX;
  return Math.min(
    LG_CHAT_PANEL_WIDTH_MAX_PX,
    Math.max(LG_CHAT_PANEL_WIDTH_MIN_PX, Math.round(value)),
  );
}

type WorkshopComplexityTier = "LOW" | "MEDIUM" | "HIGH";

type WorkshopDocToolbarViewModes = {
  mddViewMode: "preview" | "source";
  mddInicialViewMode: "preview" | "source";
  specViewMode: "preview" | "source";
  architectureViewMode: "preview" | "source";
  useCasesViewMode: "preview" | "source";
  userStoriesViewMode: "preview" | "source";
  uxUiGuideViewMode: "design" | "preview" | "source";
  aemViewMode: "preview" | "source";
  blueprintViewMode: "preview" | "source";
  apiContractsViewMode: "preview" | "source";
  logicFlowsViewMode: "preview" | "source";
  brdDocViewMode: "preview" | "source";
  infraViewMode: "preview" | "source";
};

function getWorkshopDocToolbarActiveViewMode(
  centralPanel: string,
  modes: WorkshopDocToolbarViewModes,
): string {
  if (centralPanel === "mdd") return modes.mddViewMode;
  if (centralPanel === "mdd-inicial") return modes.mddInicialViewMode;
  if (centralPanel === "spec") return modes.specViewMode;
  if (centralPanel === "architecture") return modes.architectureViewMode;
  if (centralPanel === "use-cases") return modes.useCasesViewMode;
  if (centralPanel === "user-stories") return modes.userStoriesViewMode;
  if (centralPanel === "ux-ui-guide") return modes.uxUiGuideViewMode;
  if (centralPanel === "aem") return modes.aemViewMode;
  if (centralPanel === "blueprint") return modes.blueprintViewMode;
  if (centralPanel === "api-contracts") return modes.apiContractsViewMode;
  if (centralPanel === "logic-flows") return modes.logicFlowsViewMode;
  if (centralPanel === "brd") return modes.brdDocViewMode;
  return modes.infraViewMode;
}

/** Icon + tooltip for preview/source (and UX guide design) toggle on the doc toolbar. */
function workshopDocSourceTogglePresentation(
  centralPanel: string,
  activeViewMode: string,
): { Icon: LucideIcon; tooltip: string } {
  if (centralPanel === "ux-ui-guide") {
    if (activeViewMode === "preview") return { Icon: Pencil, tooltip: "Ver markdown" };
    if (activeViewMode === "design") return { Icon: Palette, tooltip: "Ver preview diseño" };
    return { Icon: FileText, tooltip: "Ver preview visual" };
  }
  if (activeViewMode === "preview") return { Icon: Pencil, tooltip: "Editar" };
  return { Icon: FileText, tooltip: "Ver previsualización" };
}

/**
 * Explains document tab order. HIGH complexity: summary only — full flow opens from the toolbar modal.
 */
function WorkshopDocToolbarHint({
  tier,
  isLegacyProject: _isLegacyProject,
}: {
  tier: WorkshopComplexityTier;
  isLegacyProject: boolean;
}) {
  const fullText =
    tier === "LOW"
      ? "Complejidad baja: Spec → H.U. → Tasks (MDD / Blueprint / API ocultos). Paso 0 opcional."
      : tier === "MEDIUM"
        ? _isLegacyProject
          ? "Complejidad media (legacy): MDD Inicial opcional (Ariadne); MDD de cambio + Spec → API → Guía UX/UI → Tasks."
          : "Complejidad media (producto nuevo): sin MDD en barra — insumo Paso 0 / Spec. Entregables: Spec → API → Guía UX/UI → Tasks."
        : _isLegacyProject
          ? "Legacy: MDD Inicial opcional (Ariadne → doc. de partida); luego Modificación + MDD de cambio y entregables. Cada etapa del taller = una modificación con doc actualizada vía Ariadne."
          : "Orden: Paso 0 → BRD → To-Be → MDD → Spec → Arq. → Casos → H.U. → Blueprint → Guía UX/UI → API → Flujos → Tasks → Infra";

  const summaryLine =
    tier === "LOW"
      ? fullText
      : tier === "MEDIUM"
        ? _isLegacyProject
          ? "Complejidad media (legacy): doc. de partida opcional con Ariadne; luego MDD de cambio y entregables (Spec → API → UX/UI → Tasks)."
          : "Complejidad media (producto nuevo): insumo Paso 0 / Spec; entregables Spec → API → Guía UX/UI → Tasks (sin MDD en barra hasta avanzar el flujo)."
        : _isLegacyProject
          ? "Complejidad alta (legacy): Ariadne para doc. de partida, Modificación por etapa y documentación actualizada con el taller."
          : "Complejidad alta (producto nuevo): recorre Paso 0, BRD, To-Be, MDD y entregables hasta Infra en el orden sugerido.";

  if (tier !== "HIGH") {
    return (
      <p
        className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--foreground-subtle)] sm:max-w-[min(100%,52rem)] lg:line-clamp-1"
        title={fullText}
      >
        {fullText}
      </p>
    );
  }

  return (
    <div className="min-w-0 flex-1 sm:max-w-[min(100%,52rem)]" title={summaryLine}>
      <p className="text-xs font-medium leading-snug text-[var(--foreground)] lg:line-clamp-1">{summaryLine}</p>
    </div>
  );
}

interface WorkshopViewProps {
  projectId: string;
  projectName?: string;
  onBack?: () => void;
}

/** First vertically scrollable region under `root` (BFS) for mobile scroll FAB targeting. */
function findVerticalScrollHost(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const queue: HTMLElement[] = [root];
  while (queue.length > 0) {
    const el = queue.shift()!;
    const st = getComputedStyle(el);
    const canY = st.overflowY === "auto" || st.overflowY === "scroll";
    if (canY && el.scrollHeight > el.clientHeight + 1) return el;
    for (let i = 0; i < el.children.length; i++) {
      const ch = el.children[i];
      if (ch instanceof HTMLElement) queue.push(ch);
    }
  }
  return null;
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
  // dbgaContentCharCount eliminado
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
  const aemContentField = useWorkshopStore((s) => s.aemContent);
  const setAemContent = useWorkshopStore((s) => s.setAemContent);
  const persistAemContent = useWorkshopStore((s) => s.persistAemContent);

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
  const aemContent = aemContentField ?? project?.aemContent ?? null;

  const projectStatus: Status = project?.status ?? "ROJO";
  const semaphoreGreen = liveMetrics ? liveMetrics.status === "green" : projectStatus === "VERDE";
  const hasSpec = (specContent ?? "").trim().length > 0;
  const complexity = project?.complexity ?? "HIGH";
  const isLegacyProject = project?.projectType === "LEGACY";

  // ─── Generación secuencial multi-sección del DESIGN.md ─────
  const [uxGenerating, setUxGenerating] = useState(false);
  const [uxGenProgress, setUxGenProgress] = useState<string | null>(null);

  const isReverseEngineering =
    isLegacyProject &&
    !!((activeLegacyState?.codebaseDoc ?? "").trim()) &&
    !effectiveMddTrimmed;
  const effectiveComplexityForTabs = isReverseEngineering ? "HIGH" : complexity;
  const hasCodebaseDoc = isLegacyProject && (activeLegacyState?.codebaseDoc ?? "").trim().length > 300;
  const isStage1Legacy = isLegacyProject && activeWorkshopStage?.ordinal === 1;
  const canGenerateFromCodebase = isStage1Legacy && hasCodebaseDoc;
  const canGenerate = useMemo(() => {
    if (isLegacyProject) {
      const hasMdd = effectiveMddTrimmed.length > 0;
      const hasCodebaseDoc = (activeLegacyState?.codebaseDoc ?? "").trim().length > 0;
      return hasMdd || hasCodebaseDoc;
    }
    if (complexity === "LOW" || complexity === "MEDIUM" || complexity === "HIGH") {
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
  const apiBlueprintDmBlocked = conformance?.blueprintDataModel?.ok === false;
  const apiBlueprintBlockedHint =
    "El Blueprint no cubre el §3 Modelo de datos del MDD. Corrige o regenera el Blueprint; revisa el panel Conformance.";

  const precisionBreakdownRaw = useWorkshopStore((s) => s.precisionBreakdown);
  const precisionBreakdown = useMemo(() => precisionBreakdownRaw, [precisionBreakdownRaw]);
  const readinessHints = useMemo(() => liveMetrics?.readinessHints ?? null, [liveMetrics?.readinessHints]);

  const auditTrailRaw = useWorkshopStore((s) => s.auditTrail);
  const auditTrail = useMemo(() => auditTrailRaw || [], [auditTrailRaw]);

  const synced = useWorkshopStore((s) => s.synced);
  const loading = useWorkshopStore((s) => s.loading);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);
  const cascadeRunning = loading && (loadingReason === "deliverables-cascade" || loadingReason === "legacy-deliverables");
  const cascadeCompleted = useWorkshopStore((s) => s.cascadeCompleted);
  const cascadeTotal = useWorkshopStore((s) => s.cascadeTotal);
  const error = useWorkshopStore((s) => s.error);
  const setError = useWorkshopStore((s) => s.setError);
  const launchHermes = useWorkshopStore((s) => s.launchHermes);
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
  const persistTasksContent = useWorkshopStore((s) => s.persistTasksContent);
  const persistSpecContent = useWorkshopStore((s) => s.persistSpecContent);
  const setSpecContent = useWorkshopStore((s) => s.setSpecContent);
  const setUxUiGuideContent = useWorkshopStore((s) => s.setUxUiGuideContent);
  const fetchConformance = useWorkshopStore((s) => s.fetchConformance);
  const setDbgaContent = useWorkshopStore((s) => s.setDbgaContent);
  const persistDbgaContent = useWorkshopStore((s) => s.persistDbgaContent);
  const clearDbgaContent = useWorkshopStore((s) => s.clearDbgaContent);
  const generateBenchmark = useWorkshopStore((s) => s.generateBenchmark);
  const suggestBrdFromDbga = useWorkshopStore((s) => s.suggestBrdFromDbga);
  const mddJustGeneratedFromBenchmark = useWorkshopStore((s) => s.mddJustGeneratedFromBenchmark);
  const clearMddJustGeneratedFromBenchmark = useWorkshopStore((s) => s.clearMddJustGeneratedFromBenchmark);
  const phase0DeepResearch = useWorkshopStore((s) => s.phase0DeepResearch);
  const clearPhase0SummaryContent = useWorkshopStore((s) => s.clearPhase0SummaryContent);
  const setPhase0SummaryContent = useWorkshopStore((s) => s.setPhase0SummaryContent);
  const persistPhase0SummaryContent = useWorkshopStore((s) => s.persistPhase0SummaryContent);
  const legacyGenerateCodebaseDoc = useWorkshopStore((s) => s.legacyGenerateCodebaseDoc);
  const legacySuggestBrdFromCodebaseDoc = useWorkshopStore((s) => s.legacySuggestBrdFromCodebaseDoc);
  const legacyGenerateFromCodebaseDoc = useWorkshopStore((s) => s.legacyGenerateFromCodebaseDoc);
  const legacyMcpDebugTrace = useWorkshopStore((s) => s.legacyMcpDebugTrace);
  const legacyUpdateCodebaseDoc = useWorkshopStore((s) => s.legacyUpdateCodebaseDoc);
  const legacyStart = useWorkshopStore((s) => s.legacyStart);
  const legacyAnswer = useWorkshopStore((s) => s.legacyAnswer);
  const legacyGenerateMdd = useWorkshopStore((s) => s.legacyGenerateMdd);
  const legacyGenerateDeliverables = useWorkshopStore((s) => s.legacyGenerateDeliverables);
  const persistUxUiGuideContent = useWorkshopStore((s) => s.persistUxUiGuideContent);
  const generateUxGuideSequential = useCallback(async () => {
    const { apiFetch, API_BASE } = await import("../utils/apiClient");
    const mdd = effectiveMddTrimmed || "";
    const blueprint = blueprintContent?.trim() || "";
    const specContentStr = specContent?.trim() || "";
    // Legacy: incluir codebaseDoc (MDD Inicial) como contexto AS-IS del frontend real
    const codebaseDoc = isLegacyProject && activeLegacyState?.codebaseDoc?.trim()
      ? activeLegacyState.codebaseDoc.slice(0, 4000)
      : "";
    const contextMd = [
      mdd ? `## MDD\n${mdd.slice(0, 4000)}` : "",
      blueprint ? `## Blueprint (data model)\n${blueprint.slice(0, 3000)}` : "",
      specContentStr ? `## Spec\n${specContentStr.slice(0, 2000)}` : "",
      codebaseDoc ? `## Codebase Doc (AS-IS — documentación del frontend real)\n${codebaseDoc}` : "",
    ].filter(Boolean).join("\n\n");

    const projectName = project?.name || "Proyecto";

    try {
      setUxGenerating(true);
      setUxGenProgress("Generando DESIGN.md completo\u2026");

      const fullPrompt =
        `Eres un diseñador UX/UI experto. Genera el archivo DESIGN.md COMPLETO para el proyecto "${projectName}".\n\n` +
        `El DESIGN.md debe tener formato YAML front matter seguido de secciones markdown, así:\n` +
        `---\n` +
        `name: "${projectName}"\n` +
        `colors:\n` +
        `  primary: '#...'\n` +
        `  secondary: '#...'\n` +
        `  ...\n` +
        `typography:\n` +
        `  font-sans: ['...', '...']\n` +
        `  h1: { fontSize: ..., fontWeight: ..., lineHeight: ... }\n` +
        `  ...\n` +
        `rounded:\n` +
        `  none: 0px\n` +
        `  sm: 6px\n` +
        `  md: 12px\n` +
        `  lg: 20px\n` +
        `  xl: 28px\n` +
        `  full: 9999px\n` +
        `spacing:\n` +
        `  xxs: 2px\n` +
        `  xs: 4px\n` +
        `  sm: 8px\n` +
        `  md: 16px\n` +
        `  lg: 24px\n` +
        `  xl: 32px\n` +
        `  2xl: 48px\n` +
        `  3xl: 64px\n` +
        `elevation:\n` +
        `  card: { boxShadow: '...' }\n` +
        `  dropdown: { boxShadow: '...' }\n` +
        `  modal: { boxShadow: '...' }\n` +
        `  sticky: { boxShadow: '...' }\n` +
        `components:\n` +
        `  button-primary: { backgroundColor, textColor, rounded, padding, typography }\n` +
        `  button-secondary: { ... }\n` +
        `  button-ghost: { ... }\n` +
        `  button-danger: { ... }\n` +
        `  card: { ... }\n` +
        `  badge: { ... }\n` +
        `  input: { ... }\n` +
        `  modal: { ... }\n` +
        `  toast: { ... }\n` +
        `  skeleton: { ... }\n` +
        `---\n\n` +
        `Luego las secciones markdown:\n` +
        `## Overview\n## Colors\n## Typography\n## Layout & Spacing\n## Elevation Depth\n## Shapes\n## Components\n## Do's and Don'ts\n\n` +
        `Incluye criterios WCAG AA (contraste 4.5:1, touch targets 44px, navegación por teclado).\n` +
        `Usa {token.references} en las descripciones de los tokens.\n` +
        `${
          codebaseDoc
            ? "IMPORTANTE: Extrae colores, tipografía, espaciado y componentes del codebase AS-IS — el proyecto YA EXISTE y tiene un frontend real con diseño definido. Refleja los tokens reales del proyecto, no propongas un diseño nuevo.\n"
            : ""
        }` +
        `\n` +
        `Contexto del proyecto:\n${contextMd}\n\n` +
        `IMPORTANTE: Responde ÚNICAMENTE con el archivo DESIGN.md completo empezando por "---". NO agregues texto explicativo ni bloques \`\`\` alrededor.`;

      const body: Record<string, unknown> = {
        projectId,
        message: fullPrompt,
        activeTab: "ux-ui-guide",
      };
      if (mdd) body.mddContent = mdd;

      const r = await apiFetch(`${API_BASE}/ai-orchestrator/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Error: ${r.status}`);

      const reader = r.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = "";
      let streamError: string | null = null;
      let doneUxUiGuideContent: string | null = null;
      if (!reader) throw new Error("No reader");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const block of parts) {
          const lines = block.split("\n");
          let eventType = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>;
            if (eventType === "error" && data.error) {
              streamError = String(data.error);
            } else if (eventType === "done") {
              // The "done" event carries the actual document content
              const uxVal = (data as Record<string, unknown>).uxUiGuideContent;
              if (typeof uxVal === "string" && uxVal.trim().length > 0) {
                doneUxUiGuideContent = uxVal;
              }
            } else if (data.content) {
              result += data.content;
            }
          } catch { /* ignore */ }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      // Prefer the document content from the "done" event (which the backend
      // extracts before the ---FIN_UX_UI--- delimiter). The chunk events only
      // carry the chat message after the delimiter.
      if (doneUxUiGuideContent) {
        // Apply replaceYamlFrontMatter in case the backend returned markdown
        // without YAML frontmatter
        if (!doneUxUiGuideContent.startsWith("---")) {
          try {
            const fixed = replaceYamlFrontMatter(doneUxUiGuideContent, projectName);
            setUxUiGuideContent(fixed);
            await persistUxUiGuideContent(fixed);
          } catch {
            setUxUiGuideContent(doneUxUiGuideContent);
            await persistUxUiGuideContent(doneUxUiGuideContent);
          }
        } else {
          setUxUiGuideContent(doneUxUiGuideContent);
          await persistUxUiGuideContent(doneUxUiGuideContent);
        }
      } else {
        const trimmed = result.trim();
        let cleaned = trimmed
          .replace(/^```(?:yaml|markdown)\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();
        // Strip ---FIN_UX_UI--- delimiter and chat message
        cleaned = cleaned.replace(/\n?-{1,}FIN_UX_UI-{1,}[\s\S]*$/i, "").trim();

        if (!cleaned || !cleaned.startsWith("---")) {
          try {
            const finalContent = replaceYamlFrontMatter(cleaned || result, projectName);
            setUxUiGuideContent(finalContent);
            await persistUxUiGuideContent(finalContent);
          } catch {
            setUxUiGuideContent(cleaned || result);
            await persistUxUiGuideContent(cleaned || result);
          }
        } else {
          setUxUiGuideContent(cleaned);
          await persistUxUiGuideContent(cleaned);
        }
      }
      setUxGenerating(false);
      setUxGenProgress(null);
    } catch (e) {
      setUxGenerating(false);
      setUxGenProgress(null);
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Error al generar guía UX/UI: ${msg}`);
      console.error("Error generating UX guide:", e);
    }
  }, [projectId, project, effectiveMddTrimmed, blueprintContent, specContent, setUxUiGuideContent, persistUxUiGuideContent, setError]);

  /** Repara el YAML frontmatter de la guía UX/UI desde el markdown existente.
   * Útil cuando el contenido fue generado por una IA externa o copiado manualmente
   * y no tiene el YAML frontmatter que DesignMdPreview necesita para el preview visual. */
  const repairUxGuide = useCallback(() => {
    const current = uxUiGuideContent ?? "";
    if (!current.trim()) return;
    const repaired = replaceYamlFrontMatter(current, projectName);
    if (repaired !== current) {
      setUxUiGuideContent(repaired);
      persistUxUiGuideContent(repaired);
    }
  }, [uxUiGuideContent, projectName, setUxUiGuideContent, persistUxUiGuideContent]);

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
  /** Pestañas internas del panel benchmark: Fase 0 (DBGA) / Benchmark (Deep Research). */
  const [benchmarkPhaseTab, setBenchmarkPhaseTab] = useState<"fase0" | "benchmark">("fase0");
  const [blueprintViewMode, setBlueprintViewMode] = useState<"preview" | "source">("preview");
  const [apiContractsViewMode, setApiContractsViewMode] = useState<"preview" | "source">("preview");
  const [logicFlowsViewMode, setLogicFlowsViewMode] = useState<"preview" | "source">("preview");
  const [infraViewMode, setInfraViewMode] = useState<"preview" | "source">("preview");
  const [uxUiGuideViewMode, setUxUiGuideViewMode] = useState<"design" | "preview" | "source">("design");
  const [architectureViewMode, setArchitectureViewMode] = useState<"preview" | "source">("preview");
  const [useCasesViewMode, setUseCasesViewMode] = useState<"preview" | "source">("preview");
  const [userStoriesViewMode, setUserStoriesViewMode] = useState<"preview" | "source">("preview");
  const [mddInicialViewMode, setMddInicialViewMode] = useState<"preview" | "source">("preview");
  const [aemViewMode, setAemViewMode] = useState<"preview" | "source">("preview");
  const [hermesConfigured, setHermesConfigured] = useState<boolean | null>(null);
  const [mddInicialLocalContent, setMddInicialLocalContent] = useState("");
  const [mddInicialSaving, setMddInicialSaving] = useState(false);
  const [mddInicialCopyOk, setMddInicialCopyOk] = useState(false);
  /** BRD / To-Be (pestañas Workshop): borradores locales y modo preview|fuente (Grabar vía barra / aviso). */
  const brdTobeServerSnap = useRef({ stageId: "", brd: "" });
  const prevLoadingReasonRef = useRef<string | null>(null);
  const [brdWorkshopDraft, setBrdWorkshopDraft] = useState("");
  const [brdDocViewMode, setBrdDocViewMode] = useState<"preview" | "source">("preview");
  const [brdTobePersistBusy, setBrdTobePersistBusy] = useState(false);
  /** `ask_codebase` / Ariadne al generar doc. partida (`POST …/legacy/generate-codebase-doc`). Default `raw_evidence`. `ingest_mdd` = una sola pasada `evidence_first` (MDD ingest), sin agente escalonado ni síntesis Nest. */
  const [codebaseDocResponseMode, setCodebaseDocResponseMode] = useState<CodebaseDocResponseMode>("raw_evidence");

  /** Alterna preview/source/design del panel de documento activo. */
  const toggleDocViewMode = (panel: string) => {
    if (panel === "mdd") setMddViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "mdd-inicial") setMddInicialViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "spec") setSpecViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "architecture") setArchitectureViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "use-cases") setUseCasesViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "user-stories") setUserStoriesViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "ux-ui-guide") setUxUiGuideViewMode((m) => m === "design" ? "preview" : m === "preview" ? "source" : "design");
    else if (panel === "aem") setAemViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "blueprint") setBlueprintViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "api-contracts") setApiContractsViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "logic-flows") setLogicFlowsViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "infra") setInfraViewMode((m) => (m === "preview" ? "source" : "preview"));
    else if (panel === "brd") setBrdDocViewMode((m) => (m === "preview" ? "source" : "preview"));
  };

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
    | "aem"
    | "adrs";
  const centralPanel = useWorkshopStore((s) => s.workshopActiveDocPanel) as DocPanel;
  const setCentralPanel = useWorkshopStore((s) => s.setWorkshopActiveDocPanel);
  /** Por debajo de `lg`: una columna con control de Chat / Documentos / Semáforo. */
  type WorkshopMobileColumn = "chat" | "workspace" | "metrics";
  const [mobileWorkshopColumn, setMobileWorkshopColumn] = useState<WorkshopMobileColumn>("workspace");
  const [isLgLayout, setIsLgLayout] = useState(() =>
    typeof globalThis.matchMedia === "function"
      ? globalThis.matchMedia("(min-width: 1024px)").matches
      : false,
  );
  const [lgMetricsFlyoutOpen, setLgMetricsFlyoutOpen] = useState(false);
  const lgMetricsFlyoutRef = useRef<HTMLDivElement>(null);
  const workspaceScrollRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLElement>(null);
  const metricsSectionRef = useRef<HTMLElement>(null);
  const [scrollFabDirection, setScrollFabDirection] = useState<"down" | "up">("down");
  /** Mobile-only: show scroll FAB only when the active column has overflow (chat / docs / estado). */
  const [mobileScrollFabScrollable, setMobileScrollFabScrollable] = useState(false);

  const getActiveScrollContainer = useCallback((): HTMLElement | null => {
    if (mobileWorkshopColumn === "workspace") return findVerticalScrollHost(workspaceScrollRef.current);
    if (mobileWorkshopColumn === "chat") return findVerticalScrollHost(chatSectionRef.current);
    if (mobileWorkshopColumn === "metrics") return findVerticalScrollHost(metricsSectionRef.current);
    return null;
  }, [mobileWorkshopColumn]);

  useEffect(() => {
    if (isLgLayout) {
      setMobileScrollFabScrollable(false);
      setScrollFabDirection("down");
      return;
    }

    let detached = false;
    let rafId = 0;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let container: HTMLElement | null = null;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    const update = () => {
      if (detached) return;
      const c = getActiveScrollContainer();
      if (!c) {
        setMobileScrollFabScrollable(false);
        setScrollFabDirection("down");
        return;
      }
      const scrollable = c.scrollHeight > c.clientHeight + 1;
      setMobileScrollFabScrollable(scrollable);
      if (scrollable) {
        const atBottom = c.scrollTop + c.clientHeight >= c.scrollHeight - 20;
        setScrollFabDirection(atBottom ? "up" : "down");
      } else {
        setScrollFabDirection("down");
      }
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    function cleanupContainer() {
      window.removeEventListener("resize", scheduleUpdate);
      if (!container) return;
      container.removeEventListener("scroll", scheduleUpdate);
      ro?.disconnect();
      ro = null;
      mo?.disconnect();
      mo = null;
      container = null;
    }

    function bindToCurrent(): boolean {
      cleanupContainer();
      const c = getActiveScrollContainer();
      if (!c) {
        setMobileScrollFabScrollable(false);
        setScrollFabDirection("down");
        return false;
      }
      container = c;
      scheduleUpdate();
      c.addEventListener("scroll", scheduleUpdate, { passive: true });
      window.addEventListener("resize", scheduleUpdate, { passive: true });
      ro = new ResizeObserver(scheduleUpdate);
      ro.observe(c);
      for (const ch of Array.from(c.children)) {
        if (ch instanceof HTMLElement) ro.observe(ch);
      }
      mo = new MutationObserver(scheduleUpdate);
      mo.observe(c, { childList: true, subtree: true, characterData: true });
      return true;
    }

    function tryBind(attempt: number) {
      if (detached) return;
      if (bindToCurrent()) return;
      if (attempt > 30) return;
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
      retryTimer = globalThis.setTimeout(() => tryBind(attempt + 1), 50);
    }

    tryBind(0);

    return () => {
      detached = true;
      cancelAnimationFrame(rafId);
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
      cleanupContainer();
    };
  }, [isLgLayout, mobileWorkshopColumn, getActiveScrollContainer, centralPanel]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const mq = globalThis.matchMedia("(min-width: 1024px)");
    function handleMediaChange() {
      setIsLgLayout(mq.matches);
      if (!mq.matches) setLgMetricsFlyoutOpen(false);
    }
    handleMediaChange();
    mq.addEventListener("change", handleMediaChange);
    return () => mq.removeEventListener("change", handleMediaChange);
  }, []);

  useEffect(() => {
    if (!lgMetricsFlyoutOpen || !isLgLayout) return;
    function handlePointerDown(event: PointerEvent) {
      const root = lgMetricsFlyoutRef.current;
      if (root && !root.contains(event.target as Node)) setLgMetricsFlyoutOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLgMetricsFlyoutOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [lgMetricsFlyoutOpen, isLgLayout]);

  const [revaluateBusy, setRevaluateBusy] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [flowOrderModalOpen, setFlowOrderModalOpen] = useState(false);
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
    brdTobeServerSnap.current = { stageId: "", brd: "" };
    setBrdWorkshopDraft("");
    setBrdDocViewMode("preview");
  }, [projectId]);

  /** Sincroniza BRD draft desde el stage cuando el contenido del servidor cambia, preservando ediciones del usuario. */
  useEffect(() => {
    if (!activeWorkshopStage || activeWorkshopStage.id !== activeStageId) return;
    const id = activeWorkshopStage.id;
    const brd = activeWorkshopStage.brdContent ?? "";

    const cur = brdTobeServerSnap.current;
    if (cur.stageId !== id) {
      brdTobeServerSnap.current = { stageId: id, brd };
      setBrdWorkshopDraft(brd);
      setBrdDocViewMode("preview");
      return;
    }

    if (cur.brd !== brd) {
      setBrdWorkshopDraft((d) => (d === cur.brd ? brd : d));
      brdTobeServerSnap.current.brd = brd;
    }
  }, [
    activeStageId,
    activeWorkshopStage?.id,
    activeWorkshopStage?.brdContent,
  ]);

  /** Fuerza sincronización cuando una operación de BRD acaba de completarse (loading pasó de true a false). */
  useEffect(() => {
    const wasGeneratingBrd =
      prevLoadingReasonRef.current === "brd-from-dbga" ||
      prevLoadingReasonRef.current === "legacy-brd-suggest";
    if (!loading && wasGeneratingBrd && activeWorkshopStage) {
      setBrdWorkshopDraft(activeWorkshopStage.brdContent ?? "");
      brdTobeServerSnap.current = {
        stageId: activeWorkshopStage.id,
        brd: activeWorkshopStage.brdContent ?? "",
      };
    }
    prevLoadingReasonRef.current = loadingReason;
  }, [loading, loadingReason, activeWorkshopStage?.id, activeWorkshopStage?.brdContent]);

  const brdWorkshopDirty = useMemo(
    () => brdWorkshopDraft !== (activeWorkshopStage?.brdContent ?? ""),
    [brdWorkshopDraft, activeWorkshopStage?.brdContent],
  );
  const persistBrdWorkshopDraft = useCallback(async () => {
    if (!activeStageId || !brdWorkshopDirty) return;
    setBrdTobePersistBusy(true);
    await patchWorkshopStage(activeStageId, { brdContent: brdWorkshopDraft });
    setBrdTobePersistBusy(false);
  }, [activeStageId, brdWorkshopDirty, brdWorkshopDraft, patchWorkshopStage]);

  /** Desktop: chat column collapsed + width (resize). */
  const lgChatCollapsedStorageKey = projectId
    ? `theforge:workshop:lg-chat-collapsed:${projectId}`
    : null;
  const lgChatWidthStorageKey = projectId
    ? `theforge:workshop:lg-chat-width-px:${projectId}`
    : null;
  const [lgWorkshopChatCollapsed, setLgWorkshopChatCollapsedState] = useState(false);
  const [lgChatPanelWidthPx, setLgChatPanelWidthPx] = useState(LG_CHAT_PANEL_DEFAULT_PX);
  const [lgChatPanelResizing, setLgChatPanelResizing] = useState(false);
  const lgChatResizeDragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const lgChatResizeLastPreviewRef = useRef<number>(LG_CHAT_PANEL_DEFAULT_PX);

  useEffect(() => {
    if (!projectId) return;
    try {
      const collapsed =
        lgChatCollapsedStorageKey != null &&
        globalThis.localStorage?.getItem(lgChatCollapsedStorageKey) === "1";
      let width = LG_CHAT_PANEL_DEFAULT_PX;
      const raw =
        lgChatWidthStorageKey != null ? globalThis.localStorage?.getItem(lgChatWidthStorageKey) : null;
      if (raw != null && raw !== "") {
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed)) width = clampLgChatPanelWidthPx(parsed);
      }
      setLgWorkshopChatCollapsedState(collapsed);
      setLgChatPanelWidthPx(width);
    } catch {
      setLgWorkshopChatCollapsedState(false);
      setLgChatPanelWidthPx(LG_CHAT_PANEL_DEFAULT_PX);
    }
  }, [projectId, lgChatCollapsedStorageKey, lgChatWidthStorageKey]);

  const handleSetLgWorkshopChatCollapsed = useCallback(
    (collapsed: boolean, opts?: { persistOpenWidthPx?: number }) => {
      if (collapsed) {
        const toSave =
          opts?.persistOpenWidthPx != null
            ? clampLgChatPanelWidthPx(opts.persistOpenWidthPx)
            : clampLgChatPanelWidthPx(lgChatPanelWidthPx);
        try {
          if (lgChatWidthStorageKey) globalThis.localStorage?.setItem(lgChatWidthStorageKey, String(toSave));
        } catch {
          /* localStorage unavailable */
        }
      } else {
        let restore = LG_CHAT_PANEL_DEFAULT_PX;
        try {
          const raw =
            lgChatWidthStorageKey != null ? globalThis.localStorage?.getItem(lgChatWidthStorageKey) : null;
          if (raw != null && raw !== "") {
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isNaN(parsed)) restore = clampLgChatPanelWidthPx(parsed);
          }
        } catch {
          /* */
        }
        setLgChatPanelWidthPx(restore);
      }

      setLgWorkshopChatCollapsedState(collapsed);

      if (!lgChatCollapsedStorageKey) return;
      try {
        if (collapsed) globalThis.localStorage?.setItem(lgChatCollapsedStorageKey, "1");
        else globalThis.localStorage?.removeItem(lgChatCollapsedStorageKey);
      } catch {
        /* localStorage unavailable */
      }
    },
    [lgChatCollapsedStorageKey, lgChatWidthStorageKey, lgChatPanelWidthPx],
  );

  const handleLgChatResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isLgLayout || lgWorkshopChatCollapsed) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      lgChatResizeDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: lgChatPanelWidthPx,
      };
      lgChatResizeLastPreviewRef.current = lgChatPanelWidthPx;
      setLgChatPanelResizing(true);
    },
    [isLgLayout, lgWorkshopChatCollapsed, lgChatPanelWidthPx],
  );

  const handleLgChatResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = lgChatResizeDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const next = Math.round(drag.startWidth + (event.clientX - drag.startX));
    const preview = Math.min(LG_CHAT_PANEL_WIDTH_MAX_PX, Math.max(72, next));
    lgChatResizeLastPreviewRef.current = preview;
    setLgChatPanelWidthPx(preview);
  }, []);

  const finishLgChatResizePointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = lgChatResizeDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* not captured */
      }
      lgChatResizeDragRef.current = null;
      setLgChatPanelResizing(false);

      const raw = Math.round(drag.startWidth + (event.clientX - drag.startX));
      const preview = Math.min(LG_CHAT_PANEL_WIDTH_MAX_PX, Math.max(72, raw));

      if (preview < LG_CHAT_PANEL_WIDTH_MIN_PX) {
        handleSetLgWorkshopChatCollapsed(true, { persistOpenWidthPx: drag.startWidth });
        return;
      }

      const clamped = clampLgChatPanelWidthPx(preview);
      setLgChatPanelWidthPx(clamped);
      try {
        if (lgChatWidthStorageKey) globalThis.localStorage?.setItem(lgChatWidthStorageKey, String(clamped));
      } catch {
        /* localStorage unavailable */
      }
    },
    [handleSetLgWorkshopChatCollapsed, lgChatWidthStorageKey],
  );

  const handleLgChatResizeLostPointerCapture = useCallback(() => {
    const drag = lgChatResizeDragRef.current;
    if (!drag) return;
    const startWidthBeforeDrag = drag.startWidth;
    lgChatResizeDragRef.current = null;
    setLgChatPanelResizing(false);
    const preview = lgChatResizeLastPreviewRef.current;
    if (preview < LG_CHAT_PANEL_WIDTH_MIN_PX) {
      handleSetLgWorkshopChatCollapsed(true, { persistOpenWidthPx: startWidthBeforeDrag });
      return;
    }
    const clamped = clampLgChatPanelWidthPx(preview);
    setLgChatPanelWidthPx(clamped);
    try {
      if (lgChatWidthStorageKey) globalThis.localStorage?.setItem(lgChatWidthStorageKey, String(clamped));
    } catch {
      /* localStorage unavailable */
    }
  }, [handleSetLgWorkshopChatCollapsed, lgChatWidthStorageKey]);

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

  // Legacy: si el panel activo es un documento que no tiene contenido y NO es etapa 1 (AS-IS),
  // redirigir a Modificación. En etapa 1 todos los paneles deben ser accesibles.
  useEffect(() => {
    if (project?.projectType !== "LEGACY") return;
    // Etapa 1 (ordinal 1) = AS-IS: todos los paneles accesibles con botón "Generar desde MDD Inicial"
    if (activeWorkshopStage?.ordinal === 1) return;
    const emptyLegacyPanels: DocPanel[] = [
      "spec", "architecture", "use-cases", "user-stories", "blueprint",
      "api-contracts", "logic-flows", "tasks", "infra",
    ];
    if (!emptyLegacyPanels.includes(centralPanel as DocPanel)) return;
    const contentByPanel: Record<string, string | null> = {
      spec: specContent ?? null,
      architecture: architectureContent ?? null,
      "use-cases": useCasesContent ?? null,
      "user-stories": userStoriesContent ?? null,
      blueprint: blueprintContent ?? null,
      "api-contracts": apiContractsContent ?? null,
      "logic-flows": logicFlowsContent ?? null,
      tasks: tasksContent ?? null,
      infra: infraContent ?? null,
    };
    const content = contentByPanel[centralPanel as string];
    if (!(content ?? "").trim()) setCentralPanel("legacy");
  }, [
    project?.projectType,
    activeWorkshopStage?.ordinal,
    centralPanel,
    specContent,
    architectureContent,
    useCasesContent,
    userStoriesContent,
    blueprintContent,
    apiContractsContent,
    logicFlowsContent,
    tasksContent,
    infraContent,
  ]);

  // ─── Auto-save hooks ────
  const { handleBlur: handleSpecBlur, isDirty: specDirty } = useAutoSaveContent(specContent, project?.specContent, persistSpecContent, projectId);
  const { handleBlur: handleAemBlur, isDirty: aemDirty } = useAutoSaveContent(aemContent, project?.aemContent, persistAemContent, projectId);
  const { handleBlur: handleArchitectureBlur, isDirty: architectureDirty } = useAutoSaveContent(architectureContent, project?.architectureContent, persistArchitectureContent, projectId);
  const { handleBlur: handleUseCasesBlur, isDirty: useCasesDirty } = useAutoSaveContent(useCasesContent, project?.useCasesContent, persistUseCasesContent, projectId);
  const { handleBlur: handleUserStoriesBlur, isDirty: userStoriesDirty } = useAutoSaveContent(userStoriesContent, project?.userStoriesContent, persistUserStoriesContent, projectId);
  const { handleBlur: handleBlueprintBlur, isDirty: blueprintDirty } = useAutoSaveContent(blueprintContent, project?.blueprintContent, persistBlueprintContent, projectId);
  const { handleBlur: handleApiContractsBlur, isDirty: apiContractsDirty } = useAutoSaveContent(apiContractsContent, project?.apiContractsContent, persistApiContractsContent, projectId);
  const { handleBlur: handleLogicFlowsBlur, isDirty: logicFlowsDirty } = useAutoSaveContent(logicFlowsContent, project?.logicFlowsContent, persistLogicFlowsContent, projectId);
  const { handleBlur: handleInfraBlur, isDirty: infraDirty } = useAutoSaveContent(infraContent, project?.infraContent, persistInfraContent, projectId);
  const { handleBlur: handleBenchmarkBlur } = useAutoSaveContent(dbgaContent, project?.dbgaContent, persistDbgaContent, projectId);
  const { handleBlur: handlePhase0SummaryBlur } = useAutoSaveContent(phase0SummaryContent, project?.phase0SummaryContent, persistPhase0SummaryContent, projectId);

  // tasks auto-save (view-only, no blur needed)
  useEffect(() => {
    if (!projectId || !project || (tasksContent ?? "") === (project.tasksContent ?? "")) return;
    const t = setTimeout(() => persistTasksContent(tasksContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [tasksContent, projectId, project?.tasksContent, project, persistTasksContent]);

  // ux-ui-guide auto-save (special: replaceYamlFrontMatter before persist)
  useEffect(() => {
    if (!projectId || !project || (uxUiGuideContent ?? "") === (project.uxUiGuideContent ?? "")) return;
    const t = setTimeout(() => {
      const content = replaceYamlFrontMatter(uxUiGuideContent ?? "", projectName);
      if (content !== (uxUiGuideContent ?? "")) setUxUiGuideContent(content);
      persistUxUiGuideContent(content);
    }, 1500);
    return () => clearTimeout(t);
  }, [uxUiGuideContent, projectId, project?.uxUiGuideContent, project, persistUxUiGuideContent, projectName]);

  // ux-ui-guide blur (special: replaceYamlFrontMatter)
  const handleUxUiGuideBlur = useCallback(() => {
    if (uxUiGuideContent != null) {
      const content = replaceYamlFrontMatter(uxUiGuideContent, projectName);
      if (content !== uxUiGuideContent) setUxUiGuideContent(content);
      persistUxUiGuideContent(content);
    }
  }, [uxUiGuideContent, persistUxUiGuideContent, projectName]);

  // Consultar si Hermes Agent está configurado en el backend
  useEffect(() => {
    if (!projectId) return;
    import("../utils/apiClient").then(({ apiFetch, API_BASE }) => {
      apiFetch(`${API_BASE}/projects/hermes-status`)
        .then((r) => r.json() as Promise<{ configured: boolean }>)
        .then((data) => setHermesConfigured(data.configured === true))
        .catch(() => setHermesConfigured(false));
    });
  }, [projectId]);

  /** Imprime el documento visible actual (encuentra .markdown-preview en el DOM). */
  const handlePrintDocument = useCallback(() => {
    const preview = document.querySelector<HTMLElement>(".markdown-preview");
    if (!preview) return;
    const printContent = preview.cloneNode(true) as HTMLElement;
    const printWin = window.open("", "_blank");
    if (!printWin) {
      document.body.classList.add("printing-md-content");
      window.print();
      return;
    }
    const styles = Array.from(document.styleSheets)
      .map((s) => {
        try { return Array.from(s.cssRules || []).map((r) => r.cssText).join("\n"); }
        catch { return ""; }
      })
      .join("\n");
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Imprimir documento</title>
  <style>${styles}</style>
  <style>
    body { padding: 2rem; background: #fff; color: #111; }
    * { color: #111 !important; background: transparent !important; }
    .markdown-preview { max-width: 900px; margin: 0 auto; }
    img { max-width: 100%; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 8px; }
    pre { overflow-x: auto; border: 1px solid #ddd; padding: 12px; background: #f5f5f5; }
    code { background: #f5f5f5; padding: 2px 4px; }
    @page { margin: 2cm; }
  </style>
</head>
<body>
  ${printContent.innerHTML}
</body>
</html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => printWin.print(), 500);
  }, []);

  const mddDirty = (mddContent ?? "") !== (project?.mddContent ?? "");
  const uxUiGuideDirty = (uxUiGuideContent ?? "") !== (project?.uxUiGuideContent ?? "");

  if (error && !project) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))] mb-4">{error}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="text-[var(--primary)] hover:underline"
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
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--primary)]" />
        <p className="text-[var(--muted-foreground)]">Cargando proyecto…</p>
        {onBack && (
          <button
            onClick={onBack}
            className="text-[var(--primary)] hover:underline text-sm"
          >
            Volver
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-workshop-root
      className="workshop-root flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] antialiased"
    >
      <header className="shrink-0 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_35%,var(--background))] px-3 py-2.5 max-sm:py-2.5 sm:px-5 sm:py-3">
        {/* Main toolbar: grid on sm+ keeps title, stage controls, and actions on one axis */}
        <div
          className={cn(
            "grid grid-cols-1 gap-3 max-sm:gap-2.5 sm:items-center sm:gap-x-4 sm:gap-y-0",
            "sm:grid-cols-[minmax(0,1fr)_auto]",
          )}
        >
          {/* Column 1 — title + sync + legacy (single baseline on desktop) */}
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 max-sm:justify-between sm:flex-nowrap sm:gap-x-3">
              <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-[var(--foreground)] max-sm:text-[0.9375rem] max-sm:leading-tight sm:flex-1 sm:text-lg">
                {projectName ?? project?.name ?? "Workshop"}
              </h1>
              {project?.projectType === "LEGACY" && (
                <span
                  className="shrink-0 rounded border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-xs font-medium text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))]"
                  title="Proyecto legacy: documentación de cambios con Relic"
                >
                  Legacy
                </span>
              )}
              {project && (
                <button
                  type="button"
                  onClick={async () => {
                    const newVis = project.visibility === "SHARED" ? "PRIVATE" : "SHARED";
                    try {
                      const r = await apiFetch(`${API_BASE}/projects/${project.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ visibility: newVis }),
                      });
                      if (r.ok) {
                        const data = await r.json();
                        useWorkshopStore.getState().setProject(data);
                      }
                    } catch {}
                  }}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium transition-colors",
                    project.visibility === "SHARED"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      : "border-zinc-500/40 bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20",
                  )}
                  title={
                    project.visibility === "SHARED"
                      ? "Compartido — todos los usuarios pueden ver y editar. Click para hacer privado."
                      : "Privado — solo tú puedes ver y editar. Click para compartir."
                  }
                >
                  {project.visibility === "SHARED" ? (
                    <><Globe className="h-3 w-3" aria-hidden /> Compartido</>
                  ) : (
                    <><Lock className="h-3 w-3" aria-hidden /> Privado</>
                  )}
                </button>
              )}
              <span
                role="status"
                aria-live="polite"
                aria-label={
                  error
                    ? `Error de sincronización: ${error}`
                    : synced
                      ? "Sincronizado con el servidor"
                      : "Sincronizando con el servidor"
                }
                className={cn(
                  "flex shrink-0 items-center gap-1.5 text-xs text-[var(--foreground-subtle)]",
                  "max-sm:rounded-full max-sm:border max-sm:border-[color-mix(in_oklch,var(--border)_80%,transparent)] max-sm:bg-[color-mix(in_oklch,var(--card)_40%,transparent)] max-sm:px-2 max-sm:py-1",
                )}
                title={
                  error
                    ? `Sin conexión — toca para reintentar`
                    : synced
                      ? "Sincronizado"
                      : "Sincronizando"
                }
                onClick={error ? () => { setError(null); apiFetch(`${API_BASE}/projects/${projectId ?? ""}`).catch(() => {}); } : undefined}
                style={error ? { cursor: "pointer" } : undefined}
              >
                {error ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" aria-hidden />
                    <span className="hidden sm:inline">Sin conexión</span>
                  </>
                ) : synced ? (
                  <>
                    <Cloud className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />
                    <span className="hidden sm:inline">Sincronizado</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
                    <span className="hidden sm:inline">Sincronizando…</span>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Column 2 — stages + icon actions: selector, Nueva etapa, ZIP, Hermes, Ayuda (sin etapas: ZIP, Hermes, Ayuda en desktop) */}
          {workshopStagesList.length > 0 ? (
            <TooltipProvider delayDuration={280}>
              <div
                className={cn(
                  "flex min-w-0 flex-nowrap items-center gap-1.5",
                  "max-sm:w-full max-sm:gap-2",
                  "sm:max-w-none sm:justify-self-end",
                  "overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] sm:overflow-visible sm:pb-0",
                )}
              >
                <Layers
                  className="hidden h-4 w-4 shrink-0 text-[var(--foreground-subtle)] sm:block"
                  strokeWidth={2}
                  aria-hidden
                />
                <label htmlFor="workshop-stage-select" className="sr-only">
                  Vista en vivo: etapa del Workshop (MDD y semáforo)
                </label>
                <div className="relative min-w-[12rem] max-w-[240px] flex-1 sm:min-w-[14rem] sm:flex-none">
                  <select
                    id="workshop-stage-select"
                    className={cn(
                      WORKSHOP_HEADER_CTL,
                      WORKSHOP_HEADER_CTL_HOVER,
                      "w-full min-w-0 cursor-pointer appearance-none py-0 pl-3 pr-10 leading-10 sm:leading-9",
                    )}
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
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 z-[1] h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-[color-mix(in_oklch,var(--foreground)_72%,var(--muted-foreground))]"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setNewStageName("");
                        setCopyMddSourceStageId(activeStageId ?? "");
                        setShowStageModal(true);
                      }}
                      className={WORKSHOP_HEADER_ICON_BTN}
                      aria-label="Nueva etapa"
                    >
                      <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Nueva etapa</TooltipContent>
                </Tooltip>

                <WorkshopDownloadZipButton
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
                        aemContent: aemContent ?? project?.aemContent ?? null,
                      },
                      projectName ?? project?.name ?? "Workshop",
                    );
                    if (ok) setError(null);
                    else setError("No hay documentos con contenido para descargar.");
                  }}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("¿Lanzar este proyecto a Hermes Agent para desarrollo?")) return;
                        launchHermes(projectId)
                          .then((res: { success: boolean; status: number } | undefined) => {
                            if (res?.success) setError("✅ Proyecto enviado a Hermes Agent");
                          })
                          .catch((err: Error) => setError(err.message));
                      }}
                      disabled={loading || hermesConfigured === false}
                      className={cn(
                        WORKSHOP_HEADER_ICON_BTN,
                        hermesConfigured === false && "cursor-not-allowed opacity-60",
                      )}
                      title={
                        hermesConfigured === null
                          ? "Verificando configuración…"
                          : hermesConfigured
                            ? "Lanzar proyecto a Hermes Agent"
                            : "Hermes no configurado"
                      }
                      aria-label={
                        hermesConfigured === null
                          ? "Verificando Hermes"
                          : hermesConfigured
                            ? "Lanzar proyecto a Hermes Agent"
                            : "Hermes no configurado"
                      }
                    >
                      {loading && loadingReason === "launch-hermes" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Rocket className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {hermesConfigured === null
                      ? "Verificando Hermes…"
                      : hermesConfigured
                        ? "Lanzar proyecto a Hermes Agent"
                        : "Hermes no configurado (HERMES_WEBHOOK_URL / HERMES_API_KEY)"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowHelpModal(true)}
                      className={WORKSHOP_HEADER_ICON_BTN}
                      title="Manual de uso del Workshop"
                      aria-label="Ayuda — manual del Workshop"
                    >
                      <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Manual del Workshop</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : (
            <TooltipProvider delayDuration={280}>
              <div className="flex min-w-0 flex-nowrap items-center justify-end gap-1.5 sm:justify-self-end">
                <WorkshopDownloadZipButton
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
                        aemContent: aemContent ?? project?.aemContent ?? null,
                      },
                      projectName ?? project?.name ?? "Workshop",
                    );
                    if (ok) setError(null);
                    else setError("No hay documentos con contenido para descargar.");
                  }}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("¿Lanzar este proyecto a Hermes Agent para desarrollo?")) return;
                        launchHermes(projectId)
                          .then((res: { success: boolean; status: number } | undefined) => {
                            if (res?.success) setError("✅ Proyecto enviado a Hermes Agent");
                          })
                          .catch((err: Error) => setError(err.message));
                      }}
                      disabled={loading || hermesConfigured === false}
                      className={cn(
                        WORKSHOP_HEADER_ICON_BTN,
                        hermesConfigured === false && "cursor-not-allowed opacity-60",
                      )}
                      title={
                        hermesConfigured === null
                          ? "Verificando configuración…"
                          : hermesConfigured
                            ? "Lanzar proyecto a Hermes Agent"
                            : "Hermes no configurado"
                      }
                      aria-label={
                        hermesConfigured === null
                          ? "Verificando Hermes"
                          : hermesConfigured
                            ? "Lanzar proyecto a Hermes Agent"
                            : "Hermes no configurado"
                      }
                    >
                      {loading && loadingReason === "launch-hermes" ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Rocket className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {hermesConfigured === null
                      ? "Verificando Hermes…"
                      : hermesConfigured
                        ? "Lanzar proyecto a Hermes Agent"
                        : "Hermes no configurado"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowHelpModal(true)}
                      className={WORKSHOP_HEADER_ICON_BTN}
                      title="Manual de uso del Workshop"
                      aria-label="Ayuda — manual del Workshop"
                    >
                      <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Manual del Workshop</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}

        </div>

        {project?.projectType === "LEGACY" && project?.theforgeProjectId?.trim() ? (
          <div className="mt-3 rounded-lg border border-[color-mix(in_oklch,var(--border)_70%,transparent)] bg-[color-mix(in_oklch,var(--muted)_25%,transparent)] px-2.5 py-1.5 sm:mt-3">
            <span
              className="font-mono text-[10px] leading-snug text-[var(--foreground-subtle)] sm:text-[11px]"
              title={`UUID guardado (theforgeProjectId). La API resuelve: ingest proyecto (ask_codebase, get_modification_plan) = id workspace; grafo/semantic = roots[].id; scope.repoIds en ask/plan. ${project.theforgeProjectId}`}
            >
              <span className="text-[color-mix(in_oklch,var(--foreground-subtle)_82%,var(--background))] select-none" aria-hidden>
                MCP{" "}
              </span>
              <span className="break-all text-[var(--muted-foreground)]">{project.theforgeProjectId}</span>
            </span>
          </div>
        ) : null}
      </header>

      {showStageModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-stage-title"
        >
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <h2 id="new-stage-title" className="text-lg font-semibold text-[var(--primary)]">
              Nueva etapa
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Se activará la nueva etapa (las demás pasan a SUPERSEDED). Puedes partir de un MDD en blanco o copiar uno de una etapa previa.
            </p>
            <div>
              <label className="block text-xs text-[var(--foreground-subtle)] mb-1">Nombre</label>
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ej. Fase 2 — API"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="copy-mdd-from-stage" className="block text-xs text-[var(--foreground-subtle)] mb-1">
                Copiar MDD desde
              </label>
              <select
                id="copy-mdd-from-stage"
                value={copyMddSourceStageId}
                onChange={(e) => setCopyMddSourceStageId(e.target.value)}
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--foreground)]"
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
                className="px-3 py-1.5 rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] text-sm"
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
                className="px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      <WorkshopHelpModal open={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <WorkshopFlowOrderModal
        open={flowOrderModalOpen}
        onOpenChange={setFlowOrderModalOpen}
        isLegacyProject={isLegacyProject}
      />

      {error && (
        <div className="shrink-0 px-4 py-2 bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] border-b border-[color-mix(in_oklch,var(--destructive)_35%,var(--border))] flex items-center justify-between gap-2">
          <p className="text-sm text-[color-mix(in_oklch,var(--destructive)_65%,white)]">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[color-mix(in_oklch,var(--destructive)_75%,white)] hover:text-[var(--foreground)] text-xs"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="shrink-0">
        <ComplexityPendingBanner />
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex lg:flex-row lg:items-stretch lg:min-h-0">
        {/* Columna A: Chat + rail “mostrar” (solo lg; ancho animado) */}
        <div
          className={cn(
            "flex min-h-0 shrink-0 flex-col lg:flex-row lg:items-stretch lg:overflow-visible",
            mobileWorkshopColumn === "chat" ? "flex min-h-0 flex-1" : "hidden lg:flex lg:h-full lg:min-h-0",
          )}
        >
          <div
            className={cn(
              "relative min-h-0 min-w-0 overflow-hidden border-r border-[var(--border)] flex flex-col lg:shrink-0",
              mobileWorkshopColumn === "chat" ? "flex-1" : "lg:h-full lg:min-h-0",
              !lgChatPanelResizing &&
                "lg:transition-[width] lg:duration-300 lg:ease-out motion-reduce:lg:transition-none",
              isLgLayout && lgWorkshopChatCollapsed
                ? "lg:w-0 lg:min-w-0 lg:border-transparent lg:pointer-events-none"
                : "lg:max-w-[420px]",
            )}
            style={
              isLgLayout && !lgWorkshopChatCollapsed
                ? { width: lgChatPanelWidthPx, minWidth: 0 }
                : undefined
            }
          >
            <section
              ref={chatSectionRef}
              className={cn(
                "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden",
                mobileWorkshopColumn === "chat" ? "min-h-0 flex-1" : "lg:h-full lg:min-h-0 lg:flex-col",
              )}
              aria-hidden={isLgLayout && lgWorkshopChatCollapsed ? true : undefined}
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
            {!lgWorkshopChatCollapsed ? (
              <div
                className={cn(
                  "pointer-events-auto hidden lg:block absolute inset-y-0 right-0 z-30 w-3 shrink-0 cursor-col-resize touch-none select-none",
                  "hover:bg-[color-mix(in_oklch,var(--primary)_16%,transparent)] active:bg-[color-mix(in_oklch,var(--primary)_22%,transparent)]",
                )}
                style={{ cursor: "col-resize" }}
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar el chat. Si sueltas con el panel más estrecho que el mínimo, se colapsa; usa el botón Chat o el icono en la barra del documento para volver a mostrarlo."
                onPointerDown={handleLgChatResizePointerDown}
                onPointerMove={handleLgChatResizePointerMove}
                onPointerUp={finishLgChatResizePointer}
                onPointerCancel={finishLgChatResizePointer}
                onLostPointerCapture={handleLgChatResizeLostPointerCapture}
              />
            ) : null}
          </div>
          <div
            className={cn(
              "hidden min-h-0 flex-col border-r border-[var(--border)] bg-transparent transition-[width,opacity,min-width,padding] duration-300 ease-out motion-reduce:transition-none lg:flex",
              lgWorkshopChatCollapsed
                ? "w-[2rem] min-w-[2rem] shrink-0 self-stretch items-center justify-center py-2"
                : "w-0 min-w-0 overflow-hidden border-transparent p-0 opacity-0 pointer-events-none",
            )}
            aria-hidden={!lgWorkshopChatCollapsed}
          >
            <TooltipProvider delayDuration={280}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleSetLgWorkshopChatCollapsed(false)}
                    className={cn(
                      "group/pull-tab-chat relative z-[2] flex w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-0 bg-transparent px-0.5 py-3 shadow-none ring-0",
                      "text-[8px] font-semibold uppercase tracking-[0.14em] text-[color-mix(in_oklch,var(--foreground)_82%,var(--muted-foreground))]",
                      "transition-[color,background-color] duration-200 ease-out",
                      "hover:bg-[color-mix(in_oklch,var(--muted)_35%,transparent)] hover:text-[var(--primary)]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                    )}
                    title="Mostrar conversación"
                    aria-label="Mostrar conversación"
                  >
                    <MessageSquare
                      className="h-3 w-3 shrink-0 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] transition-colors duration-200 group-hover/pull-tab-chat:text-[var(--primary)]"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="select-none uppercase leading-tight [writing-mode:vertical-rl] rotate-180">
                      Chat
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[14rem]">
                  Mostrar conversación
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Columna B: Contenido del tab (documento o Paso 0 = benchmark + deep research) */}
        <section
          className={cn(
            "min-h-0 min-w-0 overflow-hidden border-r border-[var(--border)] lg:min-h-0 lg:flex-1",
            "flex flex-col",
            mobileWorkshopColumn === "workspace"
              ? "flex min-h-0 flex-1"
              : "hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col",
          )}
        >
          <div className="flex shrink-0 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_45%,var(--background))] px-3 py-2.5 text-sm text-[var(--muted-foreground)] sm:px-4 sm:py-3 lg:h-16 lg:min-h-16 lg:max-h-16 lg:items-center lg:overflow-hidden lg:py-0 lg:pl-4 lg:pr-4">
            <TooltipProvider delayDuration={280}>
            <div className="flex min-h-0 w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3 lg:flex-nowrap lg:items-center">
              <WorkshopDocToolbarHint
                tier={effectiveComplexityForTabs as WorkshopComplexityTier}
                isLegacyProject={isLegacyProject}
              />
              <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:justify-end sm:gap-2 sm:pt-0.5 lg:flex-nowrap lg:pt-0">
                {isLgLayout && lgWorkshopChatCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={WORKSHOP_DOC_TOOLBAR_ICON_BTN}
                        aria-label="Mostrar conversación"
                        onClick={() => handleSetLgWorkshopChatCollapsed(false)}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[14rem]">
                      Mostrar panel de conversación
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                {centralPanel !== "benchmark" && (["spec", "mdd", "ux-ui-guide", "aem", "blueprint", "tasks", "api-contracts", "logic-flows", "architecture", "use-cases", "user-stories", "infra", "brd"] as const).includes(
                  centralPanel as any,
                ) && (
                    (centralPanel === "spec" ||
                      centralPanel === "mdd" ||
                      centralPanel === "ux-ui-guide" ||
                      centralPanel === "aem" ||
                      (centralPanel === "blueprint" && blueprintContent) ||
                      (centralPanel === "tasks" && tasksContent) ||
                      (centralPanel === "api-contracts" && apiContractsContent) ||
                      (centralPanel === "architecture" && architectureContent) ||
                      (centralPanel === "use-cases" && useCasesContent) ||
                      (centralPanel === "user-stories" && userStoriesContent) ||
                      (centralPanel === "logic-flows" && logicFlowsContent) ||
                      (centralPanel === "infra" && infraContent) ||
                      (centralPanel === "mdd-inicial" && (activeLegacyState?.codebaseDoc || mddInicialLocalContent)) ||
                      (centralPanel === "brd" && !!activeStageId)) &&
                     centralPanel !== "tasks" && (() => {
                      const activeDocViewMode = getWorkshopDocToolbarActiveViewMode(centralPanel, {
                        mddViewMode,
                        mddInicialViewMode,
                        specViewMode,
                        architectureViewMode,
                        useCasesViewMode,
                        userStoriesViewMode,
                        uxUiGuideViewMode,
                        aemViewMode,
                        blueprintViewMode,
                        apiContractsViewMode,
                        logicFlowsViewMode,
                        brdDocViewMode,
                        infraViewMode,
                      });
                      const { Icon: DocToggleIcon, tooltip: docToggleTooltip } = workshopDocSourceTogglePresentation(
                        centralPanel,
                        activeDocViewMode,
                      );
                      return (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={WORKSHOP_DOC_TOOLBAR_ICON_BTN}
                        aria-label={docToggleTooltip}
                        onClick={() => toggleDocViewMode(centralPanel)}
                          >
                            <DocToggleIcon className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" align="end" className="max-w-[14rem]">
                          {docToggleTooltip}
                        </TooltipContent>
                      </Tooltip>
                      );
                    })()
                )}
                {effectiveComplexityForTabs === "HIGH" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={WORKSHOP_DOC_TOOLBAR_ICON_BTN}
                        aria-label="Ver orden completo de flujo"
                        onClick={() => setFlowOrderModalOpen(true)}
                      >
                        <ListOrdered className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
                      Ver orden completo de flujo
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={WORKSHOP_DOC_TOOLBAR_ICON_BTN}
                      aria-label="Imprimir documento"
                      onClick={handlePrintDocument}
                    >
                      <Printer className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[10rem]">
                    Imprimir
                  </TooltipContent>
                </Tooltip>
                {centralPanel === "architecture" && !!architectureContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    loading={loading}
                    ariaLabel="Regenerar arquitectura desde el MDD"
                  />
                )}
                {centralPanel === "use-cases" && !!useCasesContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateUseCases(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    loading={loading}
                    ariaLabel="Regenerar casos de uso desde el MDD"
                  />
                )}
                {centralPanel === "user-stories" && !!userStoriesContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateUserStories(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    loading={loading}
                    ariaLabel="Regenerar historias de usuario desde el MDD"
                  />
                )}
                {centralPanel === "blueprint" && !!blueprintContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateBlueprint(projectId)}
                    disabled={loading || mddReviewing || !effectiveMddTrimmed}
                    loading={loading}
                    ariaLabel="Regenerar blueprint desde el MDD"
                    tooltip="Regenerar blueprint desde el MDD"
                  />
                )}
                {centralPanel === "api-contracts" && !!apiContractsContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateApiContracts(projectId)}
                    disabled={loading || mddReviewing || !effectiveMddTrimmed || apiBlueprintDmBlocked}
                    loading={loading}
                    ariaLabel={apiBlueprintDmBlocked ? apiBlueprintBlockedHint : "Regenerar contratos API desde el MDD"}
                    tooltip={apiBlueprintDmBlocked ? apiBlueprintBlockedHint : "Regenerar contratos API desde el MDD"}
                  />
                )}
                {centralPanel === "logic-flows" && !!logicFlowsContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateLogicFlows(projectId)}
                    disabled={loading || mddReviewing || !effectiveMddTrimmed}
                    loading={loading}
                    ariaLabel="Regenerar flujos de lógica desde el MDD"
                  />
                )}
                {centralPanel === "infra" && !!infraContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateInfra(projectId)}
                    disabled={loading || mddReviewing || !effectiveMddTrimmed}
                    loading={loading}
                    ariaLabel="Regenerar infraestructura desde el MDD"
                    tooltip="Regenerar infraestructura desde el MDD"
                  />
                )}
                {centralPanel === "mdd-inicial" &&
                  isLegacyProject &&
                  projectId &&
                  !!(activeLegacyState?.codebaseDoc ?? "").trim() && (
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                        className={WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER}
                        aria-label="Regenerar documentación de partida del codebase (AriadneSpecs)"
                      >
                        {loading && loadingReason === "legacy-codebase-doc" ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        ) : (
                          <RefreshCw className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
                      Regenerar documentación de partida del codebase vía AriadneSpecs
                    </TooltipContent>
                  </Tooltip>
                )}
                {centralPanel === "mdd-inicial" && mddInicialViewMode === "source" && (mddInicialLocalContent || activeLegacyState?.codebaseDoc) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={async () => {
                          setMddInicialSaving(true);
                          await legacyUpdateCodebaseDoc(projectId, mddInicialLocalContent);
                          setMddInicialSaving(false);
                        }}
                        disabled={mddInicialSaving || mddInicialLocalContent === (activeLegacyState?.codebaseDoc ?? "")}
                        className={WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER}
                        aria-label="Guardar cambios en la documentación de partida"
                      >
                        {mddInicialSaving ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        ) : (
                          <Save className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
                      Guardar cambios en la documentación
                    </TooltipContent>
                  </Tooltip>
                )}
                {centralPanel === "brd" && brdDocViewMode === "source" && activeStageId && brdWorkshopDirty && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => void persistBrdWorkshopDraft()}
                        disabled={brdTobePersistBusy}
                        className={WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER}
                        aria-label="Guardar BRD en la etapa activa"
                      >
                        {brdTobePersistBusy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        ) : (
                          <Save className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
                      Guardar BRD en la etapa activa
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* to-be save button removed */}
                {centralPanel === "spec" && !!specContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateSpec(projectId)}
                    disabled={loading}
                    loading={loading}
                    ariaLabel="Regenerar Spec desde Benchmark y alcance"
                  />
                )}
                {centralPanel === "tasks" && !!tasksContent?.trim() && (
                  <WorkshopRegenButton
                    onClick={() => generateTasks(projectId)}
                    disabled={loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
                    loading={loading}
                    ariaLabel="Regenerar Tasks desde MDD y Blueprint"
                  />
                )}
                {centralPanel === "ux-ui-guide" && !!uxUiGuideContent?.trim() && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={repairUxGuide}
                        disabled={uxGenerating || loading}
                        className={WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER}
                        aria-label="Reparar YAML frontmatter de la guía UX/UI desde el contenido existente"
                      >
                        <Wrench className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
                      Reparar YAML frontmatter — genera el YAML estructurado desde el markdown existente
                    </TooltipContent>
                  </Tooltip>
                )}
                {centralPanel === "ux-ui-guide" && !!uxUiGuideContent?.trim() && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={generateUxGuideSequential}
                        disabled={uxGenerating || loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
                        className={WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER}
                        aria-label={uxGenProgress ?? "Regenerar guía UX/UI desde MDD y Blueprint"}
                      >
                        {uxGenerating ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        ) : (
                          <RefreshCw className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
                      {uxGenProgress ?? "Regenerar guía UX/UI desde MDD y Blueprint"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            </TooltipProvider>
          </div>
          <div
            ref={workspaceScrollRef}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4"
          >
            {canGenerateFromCodebase && (
              <div className="shrink-0 mb-3 rounded-lg border border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] px-3 py-2.5">
                <p className="text-sm font-medium text-[color-mix(in_oklch,var(--primary)_65%,var(--foreground))] mb-2">
                  Etapa 1 — Documentación AS-IS
                </p>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  Estás en la etapa inicial del proyecto legacy. Los paneles vacíos tienen un botón para generar su documento desde el <strong>MDD Inicial (codebase)</strong>.
                  También puedes ir al panel <strong>MDD</strong> y usar "Generar todos los documentos" para generar todo de una vez.
                </p>
              </div>
            )}
            {centralPanel === "mdd-inicial" && project?.projectType === "LEGACY" && projectId && (
              <div className="rounded-lg bg-[color-mix(in_oklch,var(--card)_88%,transparent)] border border-[var(--border)] p-6 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] text-sm space-y-4 flex flex-col min-h-0 flex-1">
                <div className="shrink-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 font-medium text-[color-mix(in_oklch,var(--primary)_88%,var(--foreground))] leading-snug pr-1">
                      MDD Inicial — Documentación del codebase (partida)
                    </p>
                    {(mddInicialLocalContent || activeLegacyState?.codebaseDoc)?.trim() ? (
                      <button
                        type="button"
                        title="Copiar el markdown del MDD inicial al portapapeles (p. ej. para pegar en un chat con IA)"
                        onClick={() => void copyMddInicialMarkdown()}
                        className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] px-2.5 py-1.5 text-[11px] font-medium text-[color-mix(in_oklch,var(--primary)_62%,var(--foreground))] hover:bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))]"
                      >
                        {mddInicialCopyOk ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {mddInicialCopyOk ? "Copiado" : "Copiar MDD"}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-[var(--foreground-subtle)] text-xs leading-relaxed max-w-3xl">
                    Reconstrucción AS-IS desde el índice AriadneSpecs (equivalente al “primer paso” de documentación). Opcional: puedes ir directo a <strong>Modificación</strong> si solo quieres un cambio puntual; para volcar todo el conocimiento del repo aquí, usa el botón de abajo.
                  </p>
                  <details className="w-full min-w-0 rounded-lg border border-[var(--border)]/60 bg-[color-mix(in_oklch,var(--background)_35%,var(--muted))] text-left [&_summary::-webkit-details-marker]:hidden open:[&_summary_.ingest-mode-chevron]:rotate-180">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-[11px] font-medium text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklch,var(--card)_75%,var(--background))] sm:px-4">
                      <span>Modo ingest (ask_codebase)</span>
                      <ChevronDown
                        className="ingest-mode-chevron h-4 w-4 shrink-0 text-[var(--foreground-subtle)] transition-transform duration-200"
                        aria-hidden
                      />
                    </summary>
                    <fieldset
                      disabled={loading && loadingReason === "legacy-codebase-doc"}
                      className="m-0 min-w-0 border-0 p-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4"
                    >
                      <div className="space-y-2">
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-[var(--card)]/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-[var(--primary)]"
                            checked={codebaseDocResponseMode === "default"}
                            onChange={() => setCodebaseDocResponseMode("default")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-[var(--foreground)]">Chat normal</span>
                            <span className="mt-0.5 block text-xs text-[var(--foreground-subtle)] leading-relaxed">
                              Prosa; ReAct en retrieve (hasta 4 vueltas LLM en backend).
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-[var(--card)]/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-[var(--primary)]"
                            checked={codebaseDocResponseMode === "evidence_first"}
                            onChange={() => setCodebaseDocResponseMode("evidence_first")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-[var(--foreground)]">MDD / SDD (pesado)</span>
                            <span className="mt-0.5 block text-xs text-[var(--foreground-subtle)] leading-relaxed">
                              JSON MDD 7§ vía orchestrator/ingest: puede tardar muchos minutos en repos grandes.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-[var(--card)]/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-[var(--primary)]"
                            checked={codebaseDocResponseMode === "raw_evidence"}
                            onChange={() => setCodebaseDocResponseMode("raw_evidence")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-[var(--foreground)]">Evidencia bruta (recomendado)</span>
                            <span className="mt-0.5 block text-xs text-[var(--foreground-subtle)] leading-relaxed">
                              Retrieve determinista; suele ser el mejor equilibrio tiempo/calidad para doc. partida.
                            </span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-2.5 items-start rounded-md px-1 py-1.5 hover:bg-[var(--card)]/60 sm:px-2">
                          <input
                            type="radio"
                            name="codebase-doc-response-mode"
                            className="mt-1 shrink-0 accent-[var(--primary)]"
                            checked={codebaseDocResponseMode === "ingest_mdd"}
                            onChange={() => setCodebaseDocResponseMode("ingest_mdd")}
                          />
                          <span className="min-w-0">
                            <span className="text-sm text-[var(--foreground)]">MDD ingest (solo Ariadne)</span>
                            <span className="mt-0.5 block text-xs text-[var(--foreground-subtle)] leading-relaxed">
                              Una llamada <code className="text-[var(--muted-foreground)]">evidence_first</code>: salida normalizada del
                              orchestrator. Sin agente escalonado ni segunda pasada en The Forge; si falla, fallback
                              clásico <code className="text-[var(--muted-foreground)]">raw_evidence</code>.
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
                        <div className="rounded border border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_78%,var(--card))] p-4">
                          <MddViewer content={mddInicialLocalContent || activeLegacyState?.codebaseDoc || ""} />
                        </div>
                      ) : (
                        <textarea
                          value={mddInicialLocalContent}
                          onChange={(e) => setMddInicialLocalContent(e.target.value)}
                          placeholder="# Documentación del Codebase (partida)\n\nGenera la documentación o escribe aquí..."
                          className="flex-1 min-h-[200px] w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                          spellCheck={false}
                        />
                      )}
                    </div>
                    <LegacyMcpDebugPanel trace={legacyMcpDebugTrace} />
                    <div className="shrink-0 pt-4 border-t border-[var(--border)] mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const hasLocalChanges = mddInicialLocalContent?.trim() && mddInicialViewMode === "source" && mddInicialLocalContent !== (activeLegacyState?.codebaseDoc ?? "");
                          if (hasLocalChanges) await legacyUpdateCodebaseDoc(projectId, mddInicialLocalContent);
                          const res = await legacySuggestBrdFromCodebaseDoc(projectId, activeStageId ?? undefined);
                          if (res?.brdContent) setBrdWorkshopDraft(res.brdContent);
                          setCentralPanel("brd");
                        }}
                        disabled={loading || !(mddInicialLocalContent || activeLegacyState?.codebaseDoc)?.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        title="Genera el BRD (Business Requirements Document) a partir del MDD Inicial del codebase"
                      >
                        {loading && loadingReason === "legacy-brd-suggest" ? (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 shrink-0" />
                        )}
                        Generar BRD desde MDD Inicial
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const hasLocalChanges = mddInicialLocalContent?.trim() && mddInicialViewMode === "source" && mddInicialLocalContent !== (activeLegacyState?.codebaseDoc ?? "");
                          if (hasLocalChanges) await legacyUpdateCodebaseDoc(projectId, mddInicialLocalContent);
                          if (projectId) setCentralPanel("mdd");
                          await legacyGenerateMdd(projectId, activeStageId ?? undefined);
                        }}
                        disabled={loading || !(mddInicialLocalContent || activeLegacyState?.codebaseDoc)?.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        title="Genera el MDD completo desde el MDD Inicial y el BRD de la etapa activa"
                      >
                        {loading && loadingReason === "legacy-mdd" ? (
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        ) : (
                          <RefreshCw className="w-4 h-4 shrink-0" />
                        )}
                        Generar MDD Completo
                      </button>
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
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[color-mix(in_oklch,var(--success)_88%,var(--foreground))] hover:bg-[color-mix(in_oklch,var(--success)_28%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Genera Spec, Arq., Casos, Blueprint, API, etc. desde la documentación del codebase (ingeniería inversa)"
                      >
                        {loading && loadingReason === "legacy-deliverables" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Generar entregables (ingeniería inversa)
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded border border-dashed border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_50%,var(--card))] p-8 text-center text-[var(--foreground-subtle)] space-y-4">
                    {loading && loadingReason === "legacy-codebase-doc" ? (
                      <p className="flex items-center justify-center gap-2 text-[color-mix(in_oklch,var(--primary)_72%,var(--muted-foreground))]">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        {LEGACY_CODEBASE_DOC_STEPS[legacyStepIndex % LEGACY_CODEBASE_DOC_STEPS.length]}
                      </p>
                    ) : (
                      <>
                        <p className="text-[var(--muted-foreground)] text-sm max-w-md mx-auto">
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
                          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[color-mix(in_oklch,var(--primary)_22%,transparent)] text-[color-mix(in_oklch,var(--primary)_72%,var(--foreground))] border border-[color-mix(in_oklch,var(--primary)_40%,var(--border))] hover:bg-[color-mix(in_oklch,var(--primary)_28%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                        >
                          {loading && loadingReason === "legacy-codebase-doc" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : null}
                          Generar MDD inicial desde AriadneSpecs
                        </button>
                        <p className="text-xs text-[color-mix(in_oklch,var(--foreground-subtle)_82%,var(--background))]">
                          También: &quot;Generar documentación de partida&quot; en la barra superior (misma acción).
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {centralPanel === "legacy" && project?.projectType === "LEGACY" && projectId && (
              <div className="rounded-lg bg-[color-mix(in_oklch,var(--card)_88%,transparent)] border border-[var(--border)] p-6 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] text-sm space-y-6">
                <p className="font-medium text-[color-mix(in_oklch,var(--primary)_88%,var(--foreground))]">Flujo de modificación (Legacy)</p>
                {!activeLegacyState?.codebaseDoc?.trim() ? (
                  <div className="rounded-lg border border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))] px-4 py-3 space-y-3 text-sm text-[color-mix(in_oklch,var(--primary)_55%,var(--foreground))]">
                    <p>
                      <strong className="text-[color-mix(in_oklch,var(--primary)_72%,var(--foreground))]">Primera documentación del repo:</strong> en la pestaña{" "}
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
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-[color-mix(in_oklch,var(--primary)_58%,var(--foreground))] border border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] hover:bg-[color-mix(in_oklch,var(--primary)_34%,transparent)] text-xs font-medium disabled:opacity-50"
                      >
                        {loading && loadingReason === "legacy-codebase-doc" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : null}
                        Generar MDD inicial (Ariadne)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCentralPanel("mdd-inicial")}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--border)] text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-xs"
                      >
                        Ir a MDD Inicial
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--foreground-subtle)]">
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
                      className="w-full min-h-[120px] bg-[var(--background)] border border-[var(--border)] rounded-lg p-3 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] outline-none resize-y"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await legacyStart(projectId, legacyDescriptionInput, activeStageId ?? undefined);
                        if (res) setLegacyDescriptionInput("");
                      }}
                      disabled={loading || !legacyDescriptionInput.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Analizar con AriadneSpecs
                    </button>
                  </>
                ) : (
                  <>
                    {activeLegacyState?.filesToModify?.length ? (
                      <div>
                        <h4 className="text-[var(--muted-foreground)] font-medium mb-2">Archivos a modificar</h4>
                        <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1">
                          {activeLegacyState.filesToModify.map((f, i) => {
                            const path = typeof f === "string" ? f : f.path;
                            const repoId = typeof f === "string" ? null : f.repoId;
                            return (
                              <li key={i} className="font-mono text-xs">
                                {path}
                                {repoId ? <span className="text-[var(--foreground-subtle)] ml-1">(repo: {repoId.slice(0, 8)}…)</span> : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    {activeLegacyState?.questions?.length ? (
                      <div>
                        <h4 className="text-[var(--muted-foreground)] font-medium mb-2">Preguntas para afinar</h4>
                        {activeLegacyState.suggestedAnswers && Object.keys(activeLegacyState.suggestedAnswers).length > 0 ? (
                          <p className="text-[var(--foreground-subtle)] text-xs mb-2">Respuestas sugeridas por AriadneSpecs (puedes editarlas).</p>
                        ) : null}
                        <div className="space-y-3">
                          {activeLegacyState.questions.map((q, i) => (
                            <div key={i}>
                              <label className="block text-[var(--muted-foreground)] text-xs mb-1">{q}</label>
                              <input
                                type="text"
                                value={legacyAnswersInput[i] ?? activeLegacyState?.answers?.[String(i)] ?? activeLegacyState?.suggestedAnswers?.[i] ?? ""}
                                onChange={(e) => setLegacyAnswersInput((prev) => ({ ...prev, [i]: e.target.value }))}
                                placeholder={activeLegacyState?.suggestedAnswers?.[i] ? undefined : "Escribe tu respuesta…"}
                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--foreground)] focus:ring-2 focus:ring-[var(--primary)] outline-none"
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
                        className="px-3 py-1.5 rounded bg-[var(--muted)] text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] hover:bg-[var(--muted)] text-sm disabled:opacity-50"
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
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50"
                      >
                        {loading ? (
                          <span className="text-[var(--primary)]" aria-hidden>
                            <AiGenerativeDots />
                          </span>
                        ) : null}
                        Generar MDD
                      </button>
                    </div>
                    {loading && loadingReason === "legacy-mdd" && (
                      <p className="mt-2 flex items-center gap-2 text-xs text-[color-mix(in_oklch,var(--primary)_65%,var(--muted-foreground))]">
                        <span className="shrink-0 text-[var(--primary)]" aria-hidden>
                          <AiGenerativeDots />
                        </span>
                        {LEGACY_MDD_STEPS[legacyStepIndex % LEGACY_MDD_STEPS.length]}
                      </p>
                    )}
                  </>
                )}
                {((project.mddContent ?? "").trim() || (activeLegacyState?.codebaseDoc ?? "").trim()) ? (
                  <div className="border-t border-[var(--border)] pt-4">
                    <button
                      type="button"
                      onClick={async () => {
                        await legacyGenerateDeliverables(projectId);
                        if (projectId) fetchProject(projectId);
                      }}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[color-mix(in_oklch,var(--success)_88%,var(--foreground))] hover:bg-[color-mix(in_oklch,var(--success)_28%,transparent)] disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {(project.mddContent ?? "").trim() ? "Generar entregables" : "Generar entregables (ingeniería inversa)"}
                    </button>
                    {loading && loadingReason === "legacy-deliverables" && (
                      <p className="mt-2 text-[color-mix(in_oklch,var(--success)_55%,var(--muted-foreground))] text-xs flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        {LEGACY_DELIVERABLES_STEPS[legacyStepIndex % LEGACY_DELIVERABLES_STEPS.length]}
                      </p>
                    )}
                  </div>
                ) : null}
                {error ? <p className="text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))] text-xs">{error}</p> : null}
              </div>
            )}
            {centralPanel === "benchmark" && (
              <>
                {/* Pestañas internas: Fase 0 | Benchmark */}
                <div className="shrink-0 flex border-b border-[var(--border)] mb-4">
                  <button
                    type="button"
                    onClick={() => setBenchmarkPhaseTab("fase0")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                      benchmarkPhaseTab === "fase0"
                        ? "border-[var(--primary)] text-[var(--primary)]"
                        : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border)]",
                    )}
                  >
                    Fase 0
                  </button>
                  <button
                    type="button"
                    onClick={() => setBenchmarkPhaseTab("benchmark")}
                    className={cn(
                      "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                      benchmarkPhaseTab === "benchmark"
                        ? "border-[var(--primary)] text-[var(--primary)]"
                        : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border)]",
                    )}
                  >
                    Benchmark
                  </button>
                </div>

                {benchmarkPhaseTab === "fase0" ? (
                  <>
                    {loading && loadingReason === "phase0-deep-research" && (
                      <div className="shrink-0 rounded-lg bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] border border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] px-4 py-2 mb-2 text-sm text-[color-mix(in_oklch,var(--primary)_65%,var(--foreground))] flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Generando Deep Research… Suele tardar 1–2 minutos; no cierres la página.</span>
                      </div>
                    )}
                    <div className="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
                      <button
                        type="button"
                        onClick={async () => {
                          await suggestBrdFromDbga(projectId, { stageId: activeStageId ?? undefined });
                          setCentralPanel("brd");
                        }}
                        disabled={loading && loadingReason === "brd-from-dbga"}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generar BRD desde el Benchmark (DBGA); luego revisa y aprueba en el tab BRD"
                      >
                        {loading && loadingReason === "brd-from-dbga" ? (
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
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm"
                        title="Ir a BRD y editar manualmente o usar el chat"
                      >
                        Ir a BRD (editar)
                      </button>
                      {dbgaContent != null && dbgaContent !== "" && (
                        <button
                          type="button"
                          onClick={() => projectId && clearDbgaContent(projectId)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))] hover:bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-sm"
                          title="Borrar el contenido de Fase 0 (podrás generar uno nuevo después)"
                        >
                          <Trash2 className="w-4 h-4" />
                          Borrar Fase 0
                        </button>
                      )}
                    </div>

                    {/* Generar Deep Research — siempre visible en Fase 0 */}
                    <div className="shrink-0 flex items-center gap-2 mb-3">
                      <button
                        type="button"
                        onClick={async () => {
                          await phase0DeepResearch(projectId, {
                            userIdea: lastBenchmarkIdea.trim() || undefined,
                            includeBenchmark: true,
                          });
                          setBenchmarkPhaseTab("benchmark");
                        }}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Generar Benchmark & Deep Research desde la Fase 0; luego ve a la pestaña Benchmark para revisarlo"
                      >
                        {loading && loadingReason === "phase0-deep-research" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Rocket className="w-4 h-4" />
                        )}
                        {loading && loadingReason === "phase0-deep-research" ? "Generando…" : "Generar Benchmark"}
                      </button>
                      <span className="text-[var(--foreground-subtle)] text-xs">(puede tardar 1–2 min)</span>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border)] pt-4">
                        <h3 className="shrink-0 text-sm font-medium text-[var(--muted-foreground)] mb-2">Análisis (DBGA) — Fase 0</h3>
                        <div className="shrink-0 flex items-center justify-end gap-2 mb-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setBenchmarkViewMode((m) => (m === "preview" ? "source" : "preview"))}
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm"
                          >
                            {benchmarkViewMode === "preview" ? (
                              <><Pencil className="w-4 h-4" /> Editar</>
                            ) : (
                              <><FileText className="w-4 h-4" /> Ver previsualización</>
                            )}
                          </button>
                        </div>
                        <div className="flex-1 flex flex-col min-h-0">
                          {benchmarkViewMode === "preview" && dbgaContent != null && dbgaContent !== "" ? (
                            <div className="flex-1 min-h-[200px] overflow-auto">
                              <MddViewer content={dbgaContent} />
                            </div>
                          ) : (
                            <textarea
                              value={dbgaContent ?? ""}
                              onChange={(e) => setDbgaContent(e.target.value)}
                              onBlur={handleBenchmarkBlur}
                              placeholder="# Domain Benchmark & Gap Analysis..."
                              className="flex-1 min-h-[200px] w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                              spellCheck={false}
                            />
                          )}
                        </div>
                      </div>
                  </>
                ) : (
                  <>
                      <div className="flex-1 flex flex-col min-h-0">
                        <div className="shrink-0 flex items-center justify-end gap-2 mb-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setPhase0SummaryViewMode((m) => (m === "preview" ? "source" : "preview"))}
                            className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm"
                          >
                            {phase0SummaryViewMode === "preview" ? (
                              <><Pencil className="w-4 h-4" /> Editar</>
                            ) : (
                              <><FileText className="w-4 h-4" /> Ver previsualización</>
                            )}
                          </button>
                          {phase0SummaryContent != null && phase0SummaryContent !== "" && (
                            <button
                              type="button"
                              onClick={() => projectId && clearPhase0SummaryContent(projectId)}
                              className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))] hover:bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-sm"
                              title="Borrar el resumen Benchmark (podrás generar uno nuevo desde Fase 0)"
                            >
                              <Trash2 className="w-4 h-4" />
                              Borrar benchmark
                            </button>
                          )}
                        </div>
                        <div className="flex-1 flex flex-col min-h-0">
                          {phase0SummaryViewMode === "preview" && phase0SummaryContent != null && phase0SummaryContent !== "" ? (
                            <div className="flex-1 min-h-[200px] overflow-auto">
                              <MddViewer content={phase0SummaryContent ?? ""} />
                            </div>
                          ) : phase0SummaryViewMode === "preview" ? (
                            <div className="flex-1 flex items-center justify-center min-h-[200px]">
                              <div className="text-center">
                                <Globe className="w-8 h-8 mx-auto mb-2 text-[var(--muted-foreground)] opacity-40" />
                                <p className="text-sm text-[var(--muted-foreground)]">
                                  Aún no hay Benchmark. Ve a la pestaña <strong>Fase 0</strong>, completa el análisis y presiona <strong>Generar Benchmark</strong>.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <textarea
                              value={phase0SummaryContent ?? ""}
                              onChange={(e) => setPhase0SummaryContent(e.target.value || null)}
                              onBlur={handlePhase0SummaryBlur}
                              placeholder="# Resumen Deep Research..."
                              className="flex-1 min-h-[200px] w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                              spellCheck={false}
                            />
                          )}
                        </div>
                      </div>
                  </>
                )}
              </>
            )}
            {centralPanel === "mdd" && (
              <>
                {mddJustGeneratedFromBenchmark && (
                  <div className="shrink-0 flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-[color-mix(in_oklch,var(--success)_12%,transparent)] border border-[color-mix(in_oklch,var(--success)_30%,var(--border))] mb-3">
                    <span className="text-sm text-[color-mix(in_oklch,var(--success)_72%,var(--foreground))]">
                      Revisa el MDD en esta pestaña y refina con el chat si algo no cuadra.
                    </span>
                    <button
                      type="button"
                      onClick={clearMddJustGeneratedFromBenchmark}
                      className="shrink-0 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] text-sm"
                      aria-label="Cerrar aviso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div
                  className="mb-3 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_38%,var(--background))] p-3 sm:p-4"
                  role="region"
                  aria-label="Generar o regenerar el MDD"
                >
                  {loading && (loadingReason === "mdd" || loadingReason === "legacy-mdd") ? (
                    <AiGenerationPanel
                      title={mddContent?.trim() ? "Regenerando el MDD…" : "Generando el MDD…"}
                      subtitle={
                        isLegacyProject
                          ? "A partir de BRD y To-Be de la etapa activa (y documentación de partida si aplica)."
                          : "A partir del DBGA / Benchmark guardado en Paso 0. Puede tardar unos minutos."
                      }
                    />
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
                        <button
                          type="button"
                          onClick={() => void (isLegacyProject ? legacyGenerateMdd(projectId, activeStageId ?? undefined) : generateMddFromBenchmark(projectId))}
                          disabled={loading && (loadingReason === "mdd" || loadingReason === "legacy-mdd")}
                          className={cn(
                            WORKSHOP_MDD_ACTION_PRIMARY,
                            "w-full justify-center lg:w-auto lg:min-w-0",
                            "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]",
                          )}
                        >
                          {mddContent?.trim() ? (
                            <>
                              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                              Regenerar MDD
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                              Generar MDD
                            </>
                          )}
                        </button>
                        {effectiveMddTrimmed.length > 200 && (
                          <button
                            type="button"
                            onClick={handleGenerateDeliverables}
                            disabled={!canGenerate || cascadeRunning || mddReviewing}
                            className={cn(
                              WORKSHOP_MDD_ACTION_PRIMARY,
                              "w-full justify-center lg:w-auto lg:min-w-0",
                              "bg-[var(--success)] text-[var(--success-foreground)] hover:bg-[color-mix(in_oklch,var(--success)_88%,black)]",
                            )}
                          >
                            {cascadeRunning ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-[var(--success-foreground)]">
                                  <AiGenerativeDots />
                                </span>
                              </span>
                            ) : (
                              <Layers className="h-4 w-4 shrink-0" aria-hidden />
                            )}
                            {cascadeRunning
                              ? cascadeCompleted > 0
                                ? `Generando documentos (${cascadeCompleted}/${cascadeTotal})`
                                : "Generando documentos…"
                              : "Generar todos los documentos"}
                          </button>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-[var(--foreground-subtle)]">
                        {isLegacyProject
                          ? "Genera el MDD desde BRD y To-Be de la etapa activa (y doc. de partida si aplica)."
                          : "Genera el MDD a partir del DBGA / Benchmark guardado en Paso 0."}
                      </p>
                    </>
                  )}
                </div>
                {mddDirty && (
                  <div className="shrink-0 flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] border border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] mb-3">
                    <span className="text-sm text-[color-mix(in_oklch,var(--primary)_62%,var(--foreground))]">Tienes cambios sin guardar. Graba para revisar consistencia (ER, etc.).</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => revertMddContent()}
                        disabled={mddReviewing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] hover:text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <X className="w-4 h-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => persistAndReviewMdd()}
                        disabled={mddReviewing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
              </>
            )}
            {centralPanel === "architecture" && (
              <StandardDocPanel
                icon={Layers}
                title="Arquitectura"
                description="Módulos, datos, APIs y flujos del producto, alineados con el MDD y el codebase."
                content={architectureContent}
                onContentChange={(v) => setArchitectureContent(v)}
                onSave={() => void persistArchitectureContent(architectureContent ?? "")}
                isDirty={architectureDirty}
                viewMode={architectureViewMode}
                onGenerate={() => generateArchitecture(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading}
                placeholder="# Arquitectura del sistema\n\nMódulos, datos, APIs y flujos del producto (según MDD y codebase)..."
                onBlur={handleArchitectureBlur}
              />
            )}
            {centralPanel === "use-cases" && (
              <StandardDocPanel
                icon={Target}
                title="Casos de uso"
                description="Escenarios de interacción y flujos transaccionales derivados del MDD."
                content={useCasesContent}
                onContentChange={(v) => setUseCasesContent(v)}
                onSave={() => void persistUseCasesContent(useCasesContent ?? "")}
                isDirty={useCasesDirty}
                viewMode={useCasesViewMode}
                onGenerate={() => generateUseCases(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading}
                placeholder="# Casos de Uso\n\nDescribe los escenarios de interacción y flujos transaccionales..."
                onBlur={handleUseCasesBlur}
              />
            )}
            {centralPanel === "user-stories" && (
              <StandardDocPanel
                icon={MessageSquare}
                title="Historias de usuario"
                description="Requisitos en formato ágil (Como / Quiero / Para) a partir del MDD."
                content={userStoriesContent}
                onContentChange={(v) => setUserStoriesContent(v)}
                onSave={() => void persistUserStoriesContent(userStoriesContent ?? "")}
                isDirty={userStoriesDirty}
                viewMode={userStoriesViewMode}
                onGenerate={() => generateUserStories(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading}
                placeholder="# Historias de Usuario\n\nDefine los requisitos en formato Agile (Como... quiero... para...)..."
                onBlur={handleUserStoriesBlur}
              />
            )}
            {centralPanel === "ux-ui-guide" && (
              <ErrorBoundary>
              <UxUiGuidePanel
                key={uxUiGuideContent ? "populated" : "empty"}
                content={uxUiGuideContent}
                onContentChange={(v) => setUxUiGuideContent(v)}
                onSave={() => {
                  const content = replaceYamlFrontMatter(uxUiGuideContent ?? "", projectName);
                  if (content !== (uxUiGuideContent ?? "")) setUxUiGuideContent(content);
                  void persistUxUiGuideContent(content);
                }}
                isDirty={uxUiGuideDirty}
                viewMode={uxUiGuideViewMode}
                onGenerate={generateUxGuideSequential}
                canGenerate={!!(effectiveMddTrimmed && blueprintContent?.trim())}
                isLoading={loading}
                isGenerating={uxGenerating}
                placeholder="# Guía UX/UI\n\nConversa con la IA sobre marca, estilos, prioridades y componentes; el contenido se irá generando aquí."
                onBlur={handleUxUiGuideBlur}
              />
              </ErrorBoundary>
            )}
            {centralPanel === "spec" && (
              <StandardDocPanel
                icon={ListOrdered}
                title="Spec"
                description="Spec = Benchmark + alcance. Alimenta el MDD; revísalo antes de dar por cerrado el MDD."
                content={specContent}
                onContentChange={(v) => setSpecContent(v)}
                onSave={() => void persistSpecContent(specContent ?? "")}
                isDirty={specDirty}
                viewMode={specViewMode}
                onGenerate={() => generateSpec(projectId)}
                canGenerate={!!(dbgaContent?.trim() || effectiveMddTrimmed)}
                isLoading={loading}
                placeholder="# Spec\n\nEl contenido del Spec se genera aquí o puedes escribirlo manualmente..."
                onBlur={handleSpecBlur}
                legacyGenerateLabel={canGenerateFromCodebase ? "Generar Spec desde MDD Inicial" : undefined}
                onLegacyGenerate={canGenerateFromCodebase ? () => legacyGenerateFromCodebaseDoc(projectId, "spec", activeStageId ?? undefined) : undefined}
                legacyGenerateLoading={loading && loadingReason === "legacy-brd-suggest"}
              />
            )}
            {centralPanel === "aem" && (
              <StandardDocPanel
                icon={FileText}
                title="AEM"
                description="Análisis y Estrategia de Mercado — define el mercado, competencia, posicionamiento y estrategia comercial del proyecto."
                content={aemContent}
                onContentChange={(v) => setAemContent(v)}
                onSave={() => void persistAemContent(aemContent ?? "")}
                isDirty={aemDirty}
                viewMode={aemViewMode}
                onGenerate={() => {}}
                canGenerate={false}
                isLoading={false}
                placeholder="# AEM\n\nAnálisis y Estrategia de Mercado — contenido sobre mercado, competencia, posicionamiento..."
                onBlur={handleAemBlur}
                hideGenerate
              />
            )}
            {centralPanel === "brd" && projectId && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                {/* Legacy: generar BRD desde codebaseDoc (AS-IS) antes de describir cambios */}
                {isLegacyProject && (activeLegacyState?.codebaseDoc ?? "").trim().length > 0 && !brdWorkshopDraft.trim() && (
                  <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] px-3 py-2.5">
                    <span className="text-sm text-[color-mix(in_oklch,var(--primary)_62%,var(--foreground))]">
                      Documenta requisitos AS-IS desde el codebase existente.
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await legacySuggestBrdFromCodebaseDoc(projectId, activeStageId ?? undefined);
                        if (res?.brdContent) setBrdWorkshopDraft(res.brdContent);
                      }}
                      disabled={loading && loadingReason === "legacy-brd-suggest"}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading && loadingReason === "legacy-brd-suggest" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Generar BRD desde MDD Inicial
                    </button>
                  </div>
                )}
                {brdWorkshopDirty && (
                  <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg border border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] px-3 py-2">
                    <span className="text-sm text-[color-mix(in_oklch,var(--primary)_62%,var(--foreground))]">Cambios sin guardar en el BRD de esta etapa.</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setBrdWorkshopDraft(activeWorkshopStage?.brdContent ?? "")}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void persistBrdWorkshopDraft()}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {brdTobePersistBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Grabar
                      </button>
                    </div>
                  </div>
                )}
                <BrdStagePanel
                  projectId={projectId}
                  activeStageId={activeStageId}
                  brdContent={brdWorkshopDraft}
                  onBrdContentChange={setBrdWorkshopDraft}
                  docViewMode={brdDocViewMode}
                />
              </div>
            )}
            {/* to-be tab removed — secciones To-Be y As-Is eliminadas del sistema */}
            {centralPanel === "blueprint" && (
              <StandardDocPanel
                icon={LayoutTemplate}
                title="Blueprint"
                description="El blueprint se genera a partir del MDD guardado (vista previa antes de guardar)."
                content={blueprintContent}
                onContentChange={(v) => setBlueprintContent(v)}
                onSave={() => void persistBlueprintContent(blueprintContent ?? "")}
                isDirty={blueprintDirty}
                viewMode={blueprintViewMode}
                onGenerate={() => generateBlueprint(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading || mddReviewing}
                placeholder="# Blueprint\n\nEl contenido del blueprint se genera desde el MDD..."
                onBlur={handleBlueprintBlur}
                legacyGenerateLabel={canGenerateFromCodebase ? "Generar Blueprint desde MDD Inicial" : undefined}
                onLegacyGenerate={canGenerateFromCodebase ? () => legacyGenerateFromCodebaseDoc(projectId, "blueprint", activeStageId ?? undefined) : undefined}
                legacyGenerateLoading={loading && loadingReason === "legacy-brd-suggest"}
              />
            )}
            {centralPanel === "tasks" && (
              tasksContent ? (
                <MddViewer content={tasksContent} />
              ) : (
                <DocEmptyState
                  icon={ListTodo}
                  title="Tasks"
                  description="Breakdown desde MDD + Blueprint."
                  onGenerate={() => generateTasks(projectId)}
                  loading={loading}
                  hasMdd={!!(effectiveMddTrimmed && blueprintContent?.trim())}
                  legacyGenerateLabel={canGenerateFromCodebase ? "Generar Tasks desde MDD Inicial" : undefined}
                  onLegacyGenerate={canGenerateFromCodebase ? () => legacyGenerateFromCodebaseDoc(projectId, "tasks", activeStageId ?? undefined) : undefined}
                  legacyGenerateLoading={loading && loadingReason === "legacy-brd-suggest"}
                />
              )
            )}
            {centralPanel === "api-contracts" && (
              <StandardDocPanel
                icon={FileCode}
                title="Contratos de API"
                description="OpenAPI/Swagger desde el MDD (vista previa antes de guardar)."
                content={apiContractsContent}
                onContentChange={(v) => setApiContractsContent(v)}
                onSave={() => void persistApiContractsContent(apiContractsContent ?? "")}
                isDirty={apiContractsDirty}
                viewMode={apiContractsViewMode}
                onGenerate={() => generateApiContracts(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading || mddReviewing}
                placeholder="# Contratos de API (OpenAPI/Swagger)\n\n..."
                onBlur={handleApiContractsBlur}
                generateBlocked={apiBlueprintDmBlocked}
                generateBlockedReason={apiBlueprintBlockedHint}
                legacyGenerateLabel={canGenerateFromCodebase ? "Generar API Contracts desde MDD Inicial" : undefined}
                onLegacyGenerate={canGenerateFromCodebase ? () => legacyGenerateFromCodebaseDoc(projectId, "api-contracts", activeStageId ?? undefined) : undefined}
                legacyGenerateLoading={loading && loadingReason === "legacy-brd-suggest"}
              />
            )}
            {centralPanel === "logic-flows" && (
              <StandardDocPanel
                icon={GitBranch}
                title="Casos de Uso y Flujos"
                description="Diagramas de secuencia, MFA y reglas de validación desde el MDD."
                content={logicFlowsContent}
                onContentChange={(v) => setLogicFlowsContent(v)}
                onSave={() => void persistLogicFlowsContent(logicFlowsContent ?? "")}
                isDirty={logicFlowsDirty}
                viewMode={logicFlowsViewMode}
                onGenerate={() => generateLogicFlows(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading || mddReviewing}
                placeholder="# Casos de Uso y Flujos de Lógica\n\n..."
                onBlur={handleLogicFlowsBlur}
              />
            )}
            {centralPanel === "infra" && (
              <StandardDocPanel
                icon={Server}
                title="Infraestructura y Despliegue"
                description="Dockerfile, docker-compose desde el MDD (vista previa antes de guardar)."
                content={infraContent}
                onContentChange={(v) => setInfraContent(v)}
                onSave={() => void persistInfraContent(infraContent ?? "")}
                isDirty={infraDirty}
                viewMode={infraViewMode}
                onGenerate={() => generateInfra(projectId)}
                canGenerate={!!effectiveMddTrimmed}
                isLoading={loading || mddReviewing}
                placeholder="# Infraestructura\n\n..."
                onBlur={handleInfraBlur}
                legacyGenerateLabel={canGenerateFromCodebase ? "Generar Infra desde MDD Inicial" : undefined}
                onLegacyGenerate={canGenerateFromCodebase ? () => legacyGenerateFromCodebaseDoc(projectId, "infra", activeStageId ?? undefined) : undefined}
                legacyGenerateLoading={loading && loadingReason === "legacy-brd-suggest"}
              />
            )}
            {centralPanel === "adrs" && (
              <AdrsPanel
                adrs={adrs}
                projectId={projectId}
                onRefresh={fetchAdrs}
              />
            )}
          </div>
        </section>

        {/* Columna C: métricas — solo móvil (panel completo). En lg la pestaña flota sobre el área de trabajo (sin tercera columna). */}
        <section
          ref={metricsSectionRef}
          className={cn(
            "workshop-metrics-column min-h-0 min-w-0 bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] text-xs leading-snug lg:min-h-0",
            "flex flex-col",
            mobileWorkshopColumn === "metrics"
              ? "flex flex-1 min-h-0 overflow-y-auto lg:hidden"
              : "hidden",
            "overflow-y-auto p-2.5 sm:p-3",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <WorkshopMetricsColumnInner
              projectId={projectId}
              conformanceUseLlm={conformanceUseLlm}
              onConformanceUseLlmChange={(checked) => {
                setConformanceUseLlm(checked);
                void fetchConformance(projectId, { useLlm: checked });
              }}
              onOpenAuditModal={() => setShowAuditModal(true)}
            />
          </div>
        </section>

        {isLgLayout ? (
          <div
            ref={lgMetricsFlyoutRef}
            className="absolute right-0 top-1/2 z-[35] -translate-y-1/2 overflow-visible"
            onMouseEnter={() => setLgMetricsFlyoutOpen(true)}
            onMouseLeave={() => setLgMetricsFlyoutOpen(false)}
          >
            {/* Clip shows 2rem when closed (left = ceja). Do not translate the row when closed — positive translate-x moves the ceja out of the narrow clip. Animate max-width only; inner width is fixed so layout stays stable. */}
            <div
              className={cn(
                "overflow-hidden min-h-0 min-w-0 shrink-0 self-stretch max-h-[min(calc(100dvh-2.5rem),90dvh)]",
                "transition-[max-width] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] will-change-[max-width]",
                lgMetricsFlyoutOpen
                  ? "max-w-[calc(2rem+min(40rem,calc(100vw-3rem)))]"
                  : "max-w-[2rem]",
              )}
            >
              <div className="flex w-max max-h-[min(calc(100dvh-2.5rem),90dvh)] flex-row items-stretch gap-0">
                <div className="flex shrink-0 flex-col justify-center py-2">
                  <button
                    type="button"
                    className={cn(
                      "group/pull-tab relative z-[2] flex w-[2rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 px-1 py-2",
                      "rounded-l-xl rounded-r-none border border-[var(--border)] border-r-0 bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
                      "text-[8px] font-semibold uppercase tracking-[0.14em] text-[color-mix(in_oklch,var(--foreground)_82%,var(--muted-foreground))]",
                      // Light: crisp outline via border only — ring+shadow stacks read as a dirty halo on cream UI.
                      "shadow-none ring-0 dark:shadow-[0_4px_18px_-6px_rgba(0,0,0,0.42)] dark:ring-1 dark:ring-[color-mix(in_oklch,var(--foreground)_8%,transparent)]",
                      "transition-[color,background-color,box-shadow] duration-200 ease-out",
                      "hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_42%,var(--card))]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                      lgMetricsFlyoutOpen &&
                        cn(
                          "text-[var(--primary)] bg-[color-mix(in_oklch,var(--muted)_38%,var(--primary))]",
                          "ring-0 dark:ring-1 dark:ring-[color-mix(in_oklch,var(--primary)_18%,transparent)]",
                        ),
                    )}
                    aria-expanded={lgMetricsFlyoutOpen}
                    aria-controls="workshop-metrics-flyout-panel"
                    title="Semáforo y estimación"
                  >
                    <Package
                      className="h-3 w-3 shrink-0 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] transition-colors duration-200 group-hover/pull-tab:text-[var(--primary)]"
                      aria-hidden
                    />
                    <span className="select-none uppercase leading-tight [writing-mode:vertical-rl] rotate-180">
                      Semáforo
                    </span>
                  </button>
                </div>
                <div
                  id="workshop-metrics-flyout-panel"
                  role="dialog"
                  aria-label="Semáforo, conformidad y estimación"
                  aria-hidden={!lgMetricsFlyoutOpen}
                  className={cn(
                    "flex min-h-0 min-w-[17.5rem] w-[min(40rem,calc(100vw-3rem))] shrink-0 flex-col overflow-hidden rounded-xl",
                    "border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
                    "shadow-[var(--shadow-lg)] ring-0 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)] dark:ring-1 dark:ring-[color-mix(in_oklch,var(--foreground)_8%,transparent)]",
                    !lgMetricsFlyoutOpen && "pointer-events-none",
                  )}
                >
                  <div className="flex min-h-0 max-h-full w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-3.5 [scrollbar-gutter:stable]">
                    <WorkshopMetricsColumnInner
                      layout="flyout"
                      projectId={projectId}
                      conformanceUseLlm={conformanceUseLlm}
                      onConformanceUseLlmChange={(checked) => {
                        setConformanceUseLlm(checked);
                        void fetchConformance(projectId, { useLlm: checked });
                      }}
                      onOpenAuditModal={() => setShowAuditModal(true)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Mobile-only floating FABs ── */}
        {(() => {
          /** Shared shape; position via wrapper or `fixed` + `bottom` for scroll-only control. */
          const fabVisual =
            "flex h-11 w-11 min-h-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--primary)_70%,transparent)] text-[var(--primary-foreground)] shadow-lg shadow-black/25 transition-transform active:scale-90 hover:scale-105 touch-manipulation";
          const activeDocViewMode = getWorkshopDocToolbarActiveViewMode(centralPanel, {
            mddViewMode,
            mddInicialViewMode,
            specViewMode,
            architectureViewMode,
            useCasesViewMode,
            userStoriesViewMode,
            uxUiGuideViewMode,
            aemViewMode,
            blueprintViewMode,
            apiContractsViewMode,
            logicFlowsViewMode,
            brdDocViewMode,
            infraViewMode,
          });
          const { Icon: DocToggleIcon, tooltip: docToggleTooltip } = workshopDocSourceTogglePresentation(
            centralPanel,
            activeDocViewMode,
          );
          const showDocToggle =
            centralPanel !== "benchmark" &&
            centralPanel !== "tasks" &&
            (["spec", "mdd", "ux-ui-guide", "aem", "blueprint", "api-contracts", "logic-flows", "architecture", "use-cases", "user-stories", "infra", "brd", "mdd-inicial"] as const).includes(centralPanel as any) &&
            (centralPanel === "spec" ||
              centralPanel === "mdd" ||
              centralPanel === "ux-ui-guide" ||
              centralPanel === "aem" ||
              (centralPanel === "blueprint" && blueprintContent) ||
              (centralPanel === "api-contracts" && apiContractsContent) ||
              (centralPanel === "architecture" && architectureContent) ||
              (centralPanel === "use-cases" && useCasesContent) ||
              (centralPanel === "user-stories" && userStoriesContent) ||
              (centralPanel === "logic-flows" && logicFlowsContent) ||
              (centralPanel === "infra" && infraContent) ||
              (centralPanel === "mdd-inicial" && (activeLegacyState?.codebaseDoc || mddInicialLocalContent)) ||
              (centralPanel === "brd" && !!activeStageId));
          const showFlowOrder = effectiveComplexityForTabs === "HIGH";

          /** Chat tab: scroll FAB just above the border above the composer (nav + composer shell + tight gap). */
          const mobileScrollFabBottom =
            mobileWorkshopColumn === "chat"
              ? "calc(3.25rem + 6rem + env(safe-area-inset-bottom, 0px))"
              : "calc(3.25rem + 0.5rem + env(safe-area-inset-bottom, 0px))";

          /** Mobile: doc toggle + flow order only on Docs tab; hidden on Chat and Estado. */
          const showDocOrFlowFabStack =
            mobileWorkshopColumn === "workspace" && (showDocToggle || showFlowOrder);

          return (
            <>
              {mobileScrollFabScrollable ? (
                <button
                  type="button"
                  onClick={() => {
                    const container = getActiveScrollContainer();
                    if (!container) return;
                    if (scrollFabDirection === "down") {
                      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
                    } else {
                      container.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className={cn(fabVisual, "lg:hidden fixed right-4 z-20")}
                  style={{ bottom: mobileScrollFabBottom }}
                  title={scrollFabDirection === "down" ? "Ir al final" : "Ir al inicio"}
                  aria-label={scrollFabDirection === "down" ? "Ir al final del documento" : "Ir al inicio del documento"}
                >
                  {scrollFabDirection === "down" ? (
                    <ArrowDown className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                  )}
                </button>
              ) : null}

              {showDocOrFlowFabStack ? (
                <div className="lg:hidden pointer-events-none fixed right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col items-end gap-3">
                  {showFlowOrder ? (
                    <button
                      type="button"
                      className={cn(fabVisual, "pointer-events-auto")}
                      title="Ver orden completo de flujo"
                      aria-label="Ver orden completo de flujo"
                      onClick={() => setFlowOrderModalOpen(true)}
                    >
                      <ListOrdered className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                    </button>
                  ) : null}

                  {showDocToggle ? (
                    <button
                      type="button"
                      className={cn(fabVisual, "pointer-events-auto")}
                      title={docToggleTooltip}
                      aria-label={docToggleTooltip}
                      onClick={() => toggleDocViewMode(centralPanel)}
                    >
                      <DocToggleIcon className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          );
        })()}

        <nav
          className="lg:hidden shrink-0 sticky bottom-0 z-10 grid grid-cols-3 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_92%,black)] pb-[max(4px,env(safe-area-inset-bottom))]"
          aria-label="Cambiar panel del workshop"
        >
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("chat")}
            aria-current={mobileWorkshopColumn === "chat" ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation",
              mobileWorkshopColumn === "chat"
                ? "text-[var(--primary)] bg-[color-mix(in_oklch,var(--card)_92%,var(--background))] border-t-2 border-t-[var(--primary)] -mt-px"
                : "text-[var(--foreground-subtle)] border-t-2 border-t-transparent active:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
            )}
          >
            <MessageSquare className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            Chat
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("workspace")}
            aria-current={mobileWorkshopColumn === "workspace" ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation",
              mobileWorkshopColumn === "workspace"
                ? "text-[var(--primary)] bg-[color-mix(in_oklch,var(--card)_92%,var(--background))] border-t-2 border-t-[var(--primary)] -mt-px"
                : "text-[var(--foreground-subtle)] border-t-2 border-t-transparent active:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
            )}
          >
            <FileText className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            Docs
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("metrics")}
            aria-current={mobileWorkshopColumn === "metrics" ? "page" : undefined}
            className={cn(
              "flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation",
              mobileWorkshopColumn === "metrics"
                ? "text-[var(--primary)] bg-[color-mix(in_oklch,var(--card)_92%,var(--background))] border-t-2 border-t-[var(--primary)] -mt-px"
                : "text-[var(--foreground-subtle)] border-t-2 border-t-transparent active:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
            )}
          >
            <Package className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
            Estado
          </button>
        </nav>
        {
          showAuditModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowAuditModal(false)}>
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
                  <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[var(--primary)]" />
                    Detalles de Auditoría
                  </h2>
                  <button onClick={() => setShowAuditModal(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  {/* Sección Desglose */}
                  <div>
                    <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-3 uppercase tracking-wider">Desglose de Calificación</h3>
                    {precisionBreakdown ? (
                      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 rounded-lg border border-[var(--border)]">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                            <tr>
                              <th className="px-4 py-3 font-medium">Sección</th>
                              <th className="px-4 py-3 font-medium">Agente</th>
                              <th className="px-4 py-3 font-medium text-right">Calificación</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color-mix(in_oklch,var(--border)_70%,transparent)]">
                            {[
                              { section: "Contexto y alcance", agent: "Clarificador", value: precisionBreakdown.contexto, reasonKey: "contexto" as const },
                              { section: "Modelo de datos", agent: "Arquitecto de Software", value: precisionBreakdown.modeloDatos, reasonKey: "modeloDatos" as const },
                              { section: "Contratos API", agent: "Arquitecto de Software", value: precisionBreakdown.apiContracts, reasonKey: "apiContracts" as const },
                              { section: "Seguridad", agent: "Arquitecto de Seguridad", value: precisionBreakdown.seguridad, reasonKey: "seguridad" as const },
                              { section: "Integración", agent: "Ingeniero de Integración", value: precisionBreakdown.integracion, reasonKey: "integracion" as const },
                            ].map((row, i) => (
                              <tr key={i} className="hover:bg-[var(--card)]/30">
                                <td className="px-4 py-2.5 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] align-top">
                                  {row.section}
                                  {precisionBreakdown.sectionReasons?.[row.reasonKey] && (
                                    <p className="text-[var(--foreground-subtle)] text-xs mt-1 leading-tight max-w-[260px]">
                                      {precisionBreakdown.sectionReasons[row.reasonKey]}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-[var(--muted-foreground)] align-top">{row.agent}</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-medium align-top ${(row.value ?? 0) >= 90 ? "text-[color-mix(in_oklch,var(--success)_88%,var(--foreground))]" : (row.value ?? 0) >= 50 ? "text-[var(--primary)]" : "text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))]"}`}>
                                  {row.value ?? 0}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-[var(--foreground-subtle)] italic">No hay desglose disponible aún.</p>
                    )}

                    {/* Siguientes pasos / readiness hints */}
                    {readinessHints && readinessHints.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-[var(--primary)] mb-2 flex items-center gap-2">
                          <Target className="w-3.5 h-3.5" />
                          Pendiente para llegar a 100%
                        </h4>
                        <ul className="space-y-1.5">
                          {readinessHints.map((hint: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[var(--muted-foreground)]">
                              <span className="text-[var(--primary)] mt-0.5 shrink-0">▶</span>
                              <span>{hint}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Sección Logs */}
                  <div>
                    <h3 className="text-sm font-medium text-[var(--muted-foreground)] mb-3 uppercase tracking-wider flex items-center justify-between">
                      <span>Audit Trail (Logs)</span>
                      <span className="text-xs normal-case text-[var(--foreground-subtle)] font-normal">Secuencia de ejecución de agentes</span>
                    </h3>
                    {auditTrail && auditTrail.length > 0 ? (
                      <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] p-4 overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar">
                        <pre className="font-mono text-xs text-[color-mix(in_oklch,var(--success)_82%,var(--foreground))] whitespace-pre-wrap leading-relaxed">
                          {auditTrail.join(" -> ")}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-[var(--foreground-subtle)] italic">No hay logs de auditoría disponibles aún.</p>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_50%,var(--card))] flex justify-end shrink-0">
                  <button
                    onClick={() => setShowAuditModal(false)}
                    className="px-4 py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--foreground)] text-sm font-medium transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
}
