import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  Code,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
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
  Download,
  Brain,
  HelpCircle,
  Layers,
  MessageSquare,
  Copy,
  Check,
  Rocket,
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
import { WorkshopMetricsColumnInner } from "./WorkshopMetricsColumnInner";
import LegacyMcpDebugPanel from "../components/LegacyMcpDebugPanel/LegacyMcpDebugPanel";
import { BrdTobeStagePanel } from "../components/BrdTobeStagePanel";
import { downloadDocumentsZip } from "../utils/downloadDocumentsZip";
import { isTabVisibleForComplexity, type WorkshopDocTab } from "../utils/complexityTabs";
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
  LEGACY_CODEBASE_DOC_STEPS,
  LEGACY_DELIVERABLES_STEPS,
  LEGACY_MDD_STEPS,
} from "../constants/legacy-workshop-loading-steps";

/** Stage selector + “Nueva etapa” only (primary controls with a light frame). */
const WORKSHOP_HEADER_CTL =
  "h-11 min-h-[44px] sm:h-9 sm:min-h-0 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_78%,var(--muted))] text-sm font-medium text-[var(--foreground)] shadow-sm transition-[background-color,border-color,color] touch-manipulation";

const WORKSHOP_HEADER_CTL_HOVER =
  "hover:bg-[color-mix(in_oklch,var(--muted)_52%,var(--card))] hover:border-[color-mix(in_oklch,var(--border)_88%,var(--foreground))]";

/** Ayuda / ZIP: no default outline — hover tint only (Claude-style toolbar links). */
const WORKSHOP_HEADER_SECONDARY =
  "inline-flex h-11 min-h-[44px] sm:h-9 sm:min-h-0 items-center justify-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-sm font-normal text-[var(--muted-foreground)] transition-[background-color,color] hover:bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] hover:text-[var(--foreground)] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0";

const WORKSHOP_MDD_ACTION_PRIMARY =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:cursor-not-allowed disabled:opacity-50";

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
  toBeDocViewMode: "preview" | "source";
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
  if (centralPanel === "to-be") return modes.toBeDocViewMode;
  return modes.infraViewMode;
}

/** Icon + tooltip for preview/source (and UX guide design) toggle on the doc toolbar. */
function workshopDocSourceTogglePresentation(
  centralPanel: string,
  activeViewMode: string,
): { Icon: LucideIcon; tooltip: string } {
  if (centralPanel === "ux-ui-guide") {
    if (activeViewMode === "preview") return { Icon: Code, tooltip: "Ver markdown" };
    if (activeViewMode === "design") return { Icon: Palette, tooltip: "Ver preview diseño" };
    return { Icon: FileText, tooltip: "Ver preview visual" };
  }
  if (activeViewMode === "preview") return { Icon: Code, tooltip: "Ver fuente" };
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
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--foreground-subtle)] sm:max-w-[min(100%,52rem)]">
        {fullText}
      </p>
    );
  }

  return (
    <div className="min-w-0 flex-1 sm:max-w-[min(100%,52rem)]">
      <p className="text-xs font-medium leading-snug text-[var(--foreground)]">{summaryLine}</p>
    </div>
  );
}

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
        <p className="text-xs text-[var(--primary)] max-w-md">{generateBlockedReason}</p>
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

  const pendingDeliverablePreviewRaw = useWorkshopStore((s) => s.pendingDeliverablePreview);
  const pendingDeliverablePreview = useMemo(() => pendingDeliverablePreviewRaw, [pendingDeliverablePreviewRaw]);
  const synced = useWorkshopStore((s) => s.synced);
  const loading = useWorkshopStore((s) => s.loading);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);
  const cascadeRunning = loading && (loadingReason === "deliverables-cascade" || loadingReason === "legacy-deliverables");
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
  const generateUxGuideSequential = useCallback(async () => {
    const { apiFetch, API_BASE } = await import("../utils/apiClient");
    const mdd = effectiveMddTrimmed || "";
    const blueprint = blueprintContent?.trim() || "";
    const spec = specContent?.trim() || "";
    const contextMd = [
      mdd ? `## MDD\n${mdd.slice(0, 3000)}` : "",
      blueprint ? `## Blueprint (data model)\n${blueprint.slice(0, 2000)}` : "",
      spec ? `## Spec\n${spec.slice(0, 2000)}` : "",
    ].filter(Boolean).join("\n\n");

    const projectName = project?.name || "Proyecto";
    const step = async (instruction: string): Promise<string> => {
      setUxGenProgress(instruction.slice(0, 60));
      const body: Record<string, unknown> = {
        projectId,
        message: `Eres un diseñador UX/UI experto. Genera EXACTAMENTE lo que se pide a continuación, sin incluir nada más.\n\n${instruction}\n\nContexto del proyecto:\n${contextMd}`,
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
      if (!reader) throw new Error("No reader");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const block of parts) {
          let dataStr = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>;
            if (data.content) result += data.content;
          } catch { /* ignore */ }
        }
      }
      return result.trim();
    };

    try {
      setUxGenerating(true);
      setUxGenProgress("Generando paleta de colores\u2026");

      // 1. Colors
      const colorsYaml = await step(
        `Genera SOLO la secci\u00f3n \`colors:\` del YAML front matter para el DESIGN.md de "${projectName}".\n` +
        "Debe incluir TODOS estos keys con valores reales del proyecto:\n" +
        "primary, secondary, tertiary, neutral, foreground, background, muted, border, danger, success, warning, info\n" +
        "Responde \u00daNICAMENTE con el bloque YAML (sin \`\`\`yaml ni explicaciones), empezando por \'colors:\'."
      );

      setUxGenProgress("Generando escala tipogr\u00e1fica\u2026");

      // 2. Typography
      const typographyYaml = await step(
        `Genera SOLO la secci\u00f3n \`typography:\` del YAML front matter para el DESIGN.md de "${projectName}".\n` +
        "Debe incluir TODOS: font-sans (fontFamily), h1, h2, h3, h4, body-md, body-sm, label-sm, caption, overline\n" +
        "Cada uno con: fontSize, fontWeight, lineHeight, y letterSpacing cuando aplique.\n" +
        "Responde \u00daNICAMENTE con el bloque YAML, empezando por \'typography:\'."
      );

      setUxGenProgress("Generando rounded, spacing y elevation\u2026");

      // 3. Rounded + Spacing + Elevation
      const layoutYaml = await step(
        `Genera las secciones YAML de \`rounded:\`, \`spacing:\` y \`elevation:\` para "${projectName}".\n` +
        "rounded: none(0px), sm(6px), md(12px), lg(20px), xl(28px), full(9999px)\n" +
        "spacing: xxs(2px), xs(4px), sm(8px), md(16px), lg(24px), xl(32px), 2xl(48px), 3xl(64px)\n" +
        "elevation: card, dropdown, modal, sticky (con box-shadow realistas)\n" +
        "Responde \u00daNICAMENTE con los 3 bloques YAML seguidos."
      );

      setUxGenProgress("Generando componentes visuales\u2026");

      // 4. Components
      const componentsYaml = await step(
        `Genera SOLO la secci\u00f3n \`components:\` del YAML para "${projectName}".\n` +
        "Debe incluir TODOS: button-primary, button-secondary, button-ghost, button-danger, card, badge, input, modal, toast, skeleton\n" +
        "Cada componente con: backgroundColor, textColor, rounded, padding, typography (usando {token.references} cuando aplique).\n" +
        "Usa los colores del proyecto (primary, secondary, tertiary, danger, neutral, foreground, muted, background).\n" +
        "Responde \u00daNICAMENTE con el bloque YAML, empezando por \'components:\'."
      );

      setUxGenProgress("Generando documentaci\u00f3n markdown\u2026");

      // 5. Markdown documentation sections
      const docSections = await step(
        `Genera las secciones markdown del DESIGN.md para "${projectName}" (sin el YAML front matter).\n` +
        "Secciones: ## Overview, ## Colors, ## Typography, ## Layout, ## Elevation " +
        "Depth, ## Shapes, ## Components, ## Do\'s and Don\'ts.\n" +
        "Incluye criterios WCAG AA (contraste 4.5:1, touch targets 44px, navegaci\u00f3n por teclado).\n" +
        "Usa {token.references} en las descripciones.\n" +
        "Responde \u00daNICAMENTE con las secciones markdown."
      );

      setUxGenProgress("Ensamblando DESIGN.md completo\u2026");

      // 6. Assemble
      const yamlParts = [colorsYaml, typographyYaml, layoutYaml, componentsYaml]
        .map(p => p.replace(/^```yaml\n?/i, "").replace(/```\n?$/i, "").trim())
        .join("\n");

      const fullDesignMd = `---\nname: "${projectName}"\n${yamlParts}\n---\n\n${docSections}`;

      setUxUiGuideContent(fullDesignMd);
      await persistUxUiGuideContent(fullDesignMd);
      setUxGenerating(false);
      setUxGenProgress(null);
    } catch (e) {
      setUxGenerating(false);
      setUxGenProgress(null);
      console.error("Error generating UX guide:", e);
    }
  }, [projectId, project, effectiveMddTrimmed, blueprintContent, specContent, setUxUiGuideContent, persistUxUiGuideContent]);

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
  const [aemViewMode, setAemViewMode] = useState<"preview" | "source">("preview");
  const [hermesConfigured, setHermesConfigured] = useState<boolean | null>(null);
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
    | "adrs"
    | "aem";
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

  const handleAemBlur = useCallback(() => {
    if ((aemContent ?? "") !== (project?.aemContent ?? "")) {
      persistAemContent(aemContent ?? "");
    }
  }, [aemContent, project?.aemContent, project, persistAemContent]);

  useEffect(() => {
    if (!projectId || !project || (aemContent ?? "") === (project.aemContent ?? "")) return;
    const t = setTimeout(() => persistAemContent(aemContent ?? ""), 1500);
    return () => clearTimeout(t);
  }, [aemContent, projectId, project?.aemContent, project, persistAemContent]);

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
  const aemDirty = (aemContent ?? "") !== (project?.aemContent ?? "");

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
      className="workshop-root flex w-full min-h-0 flex-1 flex-col bg-[var(--background)] text-[var(--foreground)] antialiased"
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_35%,var(--background))] px-3 py-2.5 sm:px-5 sm:py-3 shrink-0 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--foreground)] truncate max-w-[min(100%,14rem)] sm:max-w-none">
            {projectName ?? project?.name ?? "Workshop"}
          </h1>
          {project?.projectType === "LEGACY" && (
            <span
              className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--muted)] text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] border border-[var(--border)] shrink-0"
              title="Proyecto legacy: documentación de cambios con Relic"
            >
              Legacy
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-[var(--foreground-subtle)] shrink-0" title={synced ? "Sincronizado" : "Sincronizando"}>
            {synced ? (
              <>
                <Cloud className="w-3.5 h-3.5 text-[var(--success)]" />
                <span className="hidden sm:inline">Sincronizado</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span className="hidden sm:inline">Sincronizando…</span>
              </>
            )}
          </span>
          {project?.projectType === "LEGACY" && project?.theforgeProjectId?.trim() && (
            <span
              className="w-full sm:w-auto min-w-0 font-mono text-[10px] sm:text-[11px] text-[var(--foreground-subtle)] leading-tight"
              title={`UUID guardado (theforgeProjectId). La API resuelve: ingest proyecto (ask_codebase, get_modification_plan) = id workspace; grafo/semantic = roots[].id; scope.repoIds en ask/plan. ${project.theforgeProjectId}`}
            >
              <span className="text-[color-mix(in_oklch,var(--foreground-subtle)_82%,var(--background))] select-none" aria-hidden>
                MCP{" "}
              </span>
              <span className="text-[var(--muted-foreground)] break-all">{project.theforgeProjectId}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 justify-end w-full sm:w-auto sm:gap-2">
          {workshopStagesList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 sm:mr-0.5 w-full sm:w-auto min-w-0">
              <Layers
                className="hidden sm:block h-4 w-4 shrink-0 self-center text-[var(--foreground-subtle)]"
                strokeWidth={2}
                aria-hidden
              />
              <label htmlFor="workshop-stage-select" className="sr-only">
                Vista en vivo: etapa del Workshop (MDD y semáforo)
              </label>
              <div className="relative min-w-0 max-w-full flex-1 sm:max-w-[240px] sm:flex-none">
                <select
                  id="workshop-stage-select"
                  className={cn(
                    WORKSHOP_HEADER_CTL,
                    WORKSHOP_HEADER_CTL_HOVER,
                    "w-full cursor-pointer appearance-none py-0 pl-3 pr-10 leading-10 sm:leading-9",
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
              <button
                type="button"
                onClick={() => {
                  setNewStageName("");
                  setCopyMddSourceStageId(activeStageId ?? "");
                  setShowStageModal(true);
                }}
                className={cn(
                  WORKSHOP_HEADER_CTL,
                  WORKSHOP_HEADER_CTL_HOVER,
                  "shrink-0 whitespace-nowrap px-3 py-0 leading-10 sm:leading-9 inline-flex items-center justify-center",
                )}
              >
                Nueva etapa
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className={WORKSHOP_HEADER_SECONDARY}
            title="Manual de uso del Workshop"
          >
            <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span className="hidden sm:inline">Ayuda</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("¿Lanzar este proyecto a Hermes Agent para desarrollo?")) return;
              launchHermes(projectId).then((res: { success: boolean; status: number } | undefined) => {
                if (res?.success) setError("✅ Proyecto enviado a Hermes Agent");
              }).catch((err: Error) => setError(err.message));
            }}
            disabled={loading || hermesConfigured === false}
            title={
              hermesConfigured === null
                ? "Verificando configuración…"
                : hermesConfigured
                  ? "Lanzar proyecto a Hermes Agent para desarrollo"
                  : "Hermes no configurado — falta HERMES_WEBHOOK_URL y HERMES_API_KEY"
            }
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg text-sm touch-manipulation min-h-[44px] sm:min-h-0 border transition-colors ${
              hermesConfigured === false
                ? "text-zinc-600 border-zinc-700 cursor-not-allowed"
                : "text-zinc-300 hover:text-emerald-400 hover:bg-emerald-900/30 border-zinc-600 hover:border-emerald-700"
            }`}
          >
            {loading && loadingReason === "launch-hermes" ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <Rocket className="w-4 h-4 shrink-0" />
            )}
            <span className="hidden sm:inline">Lanzar</span>
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
                  aemContent: aemContent ?? project?.aemContent ?? null,
                },
                projectName ?? project?.name ?? "Workshop",
              );
              if (ok) setError(null);
              else setError("No hay documentos con contenido para descargar.");
            }}
            className={WORKSHOP_HEADER_SECONDARY}
            title="Descargar todos los documentos del proyecto en un ZIP"
          >
            <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
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

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(260px,380px)_minmax(0,1fr)] lg:grid-rows-1 lg:items-stretch lg:overflow-visible">
        {/* Columna A: Chat (siempre a la izquierda, como en MDD) */}
        <section
          className={cn(
            "min-h-0 overflow-hidden border-r border-[var(--border)] lg:min-h-0",
            "flex flex-col",
            mobileWorkshopColumn === "chat" ? "flex min-h-0 flex-1" : "hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col",
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
            "min-h-0 min-w-0 overflow-hidden border-r border-[var(--border)] lg:min-h-0",
            "flex flex-col",
            mobileWorkshopColumn === "workspace"
              ? "flex min-h-0 flex-1"
              : "hidden lg:flex lg:h-full lg:min-h-0 lg:flex-col",
          )}
        >
          <div className="shrink-0 border-b border-[var(--border)] px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col gap-2.5 text-sm text-[var(--muted-foreground)]">
            <TooltipProvider delayDuration={280}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <WorkshopDocToolbarHint
                tier={effectiveComplexityForTabs as WorkshopComplexityTier}
                isLegacyProject={isLegacyProject}
              />
              <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:justify-end sm:gap-2 sm:pt-0.5">
                {centralPanel !== "benchmark" && (["spec", "mdd", "ux-ui-guide", "aem", "blueprint", "tasks", "api-contracts", "logic-flows", "architecture", "use-cases", "user-stories", "infra", "brd", "to-be"] as const).includes(
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
                      (centralPanel === "brd" && !!activeStageId) ||
                      (centralPanel === "to-be" && !!activeStageId)) &&
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
                        toBeDocViewMode,
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
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-xl text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklch,var(--muted)_52%,var(--card))] hover:text-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] sm:h-9 sm:w-9"
                        aria-label={docToggleTooltip}
                        onClick={() => {
                          if (centralPanel === "mdd") setMddViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "mdd-inicial") setMddInicialViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "spec") setSpecViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "architecture") setArchitectureViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "use-cases") setUseCasesViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "user-stories") setUserStoriesViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "ux-ui-guide") setUxUiGuideViewMode((m) => m === "design" ? "preview" : m === "preview" ? "source" : "design");
                          else if (centralPanel === "aem") setAemViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "blueprint") setBlueprintViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "api-contracts") setApiContractsViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "logic-flows") setLogicFlowsViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "infra") setInfraViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "brd") setBrdDocViewMode((m) => (m === "preview" ? "source" : "preview"));
                          else if (centralPanel === "to-be") setToBeDocViewMode((m) => (m === "preview" ? "source" : "preview"));
                        }}
                          >
                            <DocToggleIcon className="h-4 w-4 shrink-0" aria-hidden />
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
                        className="h-11 w-11 shrink-0 rounded-xl border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_65%,var(--muted))] text-[var(--foreground)] shadow-sm hover:bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] hover:text-[var(--primary)] sm:h-9 sm:w-9"
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
                {centralPanel === "architecture" && (
                  <button
                    type="button"
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    title="Generar arquitectura desde el MDD"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed shrink-0 whitespace-nowrap"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Regenerar
                  </button>
                )}
                {centralPanel === "ux-ui-guide" && (
                  <button
                    type="button"
                    onClick={generateUxGuideSequential}
                    disabled={uxGenerating || loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
                    title="Generar la Guía UX/UI en 5 pasos: colores → tipografía → espaciado → componentes → documentación"
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uxGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {uxGenProgress ?? ((uxUiGuideContent ?? "").trim() ? "Regenerar" : "Generar")}
                  </button>
                )}
              </div>
            </div>
            </TooltipProvider>
          </div>
          <div
            className={
              centralPanel === "brd" || centralPanel === "to-be"
                ? "flex-1 overflow-hidden p-4 min-h-0 flex flex-col min-w-0"
                : "flex-1 overflow-auto p-4 min-h-0 flex flex-col min-w-0"
            }
          >
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
                        <div className="flex-1 overflow-auto rounded border border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_78%,var(--card))] p-4 min-h-0">
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
                    <div className="shrink-0 pt-4 border-t border-[var(--border)] mt-4">
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
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Generar MDD
                      </button>
                    </div>
                    {loading && loadingReason === "legacy-mdd" && (
                      <p className="mt-2 text-[color-mix(in_oklch,var(--primary)_65%,var(--muted-foreground))] text-xs flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
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
                      await suggestBrdTobeFromDbga(projectId, { stageId: activeStageId ?? undefined });
                      setCentralPanel("brd");
                    }}
                    disabled={loading && loadingReason === "brd-tobe-from-dbga"}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                      title="Borrar el Benchmark (podrás generar uno nuevo después)"
                    >
                      <Trash2 className="w-4 h-4" />
                      Borrar benchmark
                    </button>
                  )}
                </div>
                {dbgaContent != null && dbgaContent !== "" && (
                  <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border)] pt-4">
                    <h3 className="shrink-0 text-sm font-medium text-[var(--muted-foreground)] mb-2">Benchmark (DBGA) — opcional</h3>
                    <div className="shrink-0 flex items-center justify-end gap-2 mb-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setBenchmarkViewMode((m) => (m === "preview" ? "source" : "preview"))}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm"
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
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm disabled:opacity-50"
                        title="Generar documento de resumen (deep research); puede tardar 1–2 min"
                      >
                        {loading && loadingReason === "phase0-deep-research" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        {loading && loadingReason === "phase0-deep-research" ? "Generando…" : "Generar Deep Research"}
                      </button>
                      <span className="text-[var(--foreground-subtle)] text-xs self-center">(puede tardar 1–2 min)</span>
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
                          className="flex-1 min-h-[200px] w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                          spellCheck={false}
                        />
                      )}
                    </div>
                  </div>
                )}
                {phase0SummaryContent != null && phase0SummaryContent !== "" && (
                  <div className="flex-1 flex flex-col min-h-0 border-t border-[var(--border)] mt-4 pt-4">
                    <h3 className="shrink-0 text-sm font-medium text-[var(--muted-foreground)] mb-2">Resumen Deep Research</h3>
                    <div className="shrink-0 flex items-center justify-end gap-2 mb-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPhase0SummaryViewMode((m) => (m === "preview" ? "source" : "preview"))}
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm"
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
                        className="flex items-center gap-1.5 px-2 py-1 rounded text-[var(--muted-foreground)] hover:text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))] hover:bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] text-sm"
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
                          className="flex-1 min-h-[200px] w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
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
                <div
                  className="mb-3 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_38%,var(--background))] p-3 sm:p-4"
                  role="region"
                  aria-label="Generar o regenerar el MDD"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void (isLegacyProject ? legacyGenerateMdd(projectId, activeStageId ?? undefined) : generateMddFromBenchmark(projectId))}
                      disabled={(loading && (loadingReason === "mdd" || loadingReason === "legacy-mdd")) || (project?.requireBrdTobeGate === true && (!(activeWorkshopStage?.brdContent ?? "").trim() || !(activeWorkshopStage?.toBeManualContent ?? "").trim()))}
                      className={cn(
                        WORKSHOP_MDD_ACTION_PRIMARY,
                        "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]",
                      )}
                    >
                      {(loading && (loadingReason === "mdd" || loadingReason === "legacy-mdd")) ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      {mddContent?.trim() ? "Regenerar MDD" : "Generar MDD"}
                    </button>
                    {effectiveMddTrimmed.length > 200 && (
                      <button
                        type="button"
                        onClick={handleGenerateDeliverables}
                        disabled={!canGenerate || cascadeRunning || mddReviewing || project?.requireBrdTobeGate === true}
                        className={cn(
                          WORKSHOP_MDD_ACTION_PRIMARY,
                          "bg-[var(--success)] text-[var(--success-foreground)] hover:bg-[color-mix(in_oklch,var(--success)_88%,black)]",
                        )}
                      >
                        {cascadeRunning ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Layers className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        {cascadeRunning ? "Generando documentos…" : "Generar todos los documentos"}
                      </button>
                    )}
                  </div>
                  {(project?.requireBrdTobeGate === true && (!(activeWorkshopStage?.brdContent ?? "").trim() || !(activeWorkshopStage?.toBeManualContent ?? "").trim())) ? (
                    <div
                      className="flex min-w-0 items-start gap-2 rounded-lg border border-[color-mix(in_oklch,var(--destructive)_38%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))] px-3 py-2.5 text-sm leading-snug text-[color-mix(in_oklch,var(--destructive)_92%,var(--foreground))]"
                      role="status"
                      aria-live="polite"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))]" aria-hidden />
                      <span>
                        <span className="font-semibold">BRD / To-Be incompletos.</span> Completa el contenido en sus pestañas antes de generar el MDD o los entregables.
                      </span>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed text-[var(--foreground-subtle)]">
                      {isLegacyProject
                        ? "Genera el MDD desde BRD y To-Be de la etapa activa (y doc. de partida si aplica)."
                        : "Genera el MDD a partir del DBGA / Benchmark guardado en Paso 0."}
                    </p>
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
              <>
                {architectureViewMode === "preview" ? (
                  <MddViewer content={architectureContent || ""} />
                ) : (
                  <textarea
                    value={architectureContent ?? ""}
                    onChange={(e) => setArchitectureContent(e.target.value)}
                    onBlur={handleArchitectureBlur}
                    placeholder="# Arquitectura del sistema\n\nMódulos, datos, APIs y flujos del producto (según MDD y codebase)..."
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateArchitecture(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateUseCases(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => generateUserStories(projectId)}
                    disabled={loading || !effectiveMddTrimmed}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] disabled:opacity-50"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                    spellCheck={false}
                  />
                )}
                <div className="shrink-0 flex items-center justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={generateUxGuideSequential}
                    disabled={uxGenerating || loading || !effectiveMddTrimmed || !blueprintContent?.trim()}
                    title="Generar la Guía UX/UI en 5 pasos: colores → tipografía → espaciado → componentes → documentación"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uxGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {uxGenProgress ?? ((uxUiGuideContent ?? "").trim() ? "Regenerar" : "Generar")} guía
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Regenerar
                      </button>
                      <button
                        type="button"
                        onClick={() => persistSpecContent(specContent || "")}
                        disabled={!specDirty}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)]"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)]"
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
                      className="flex-1 min-h-0 w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
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
            {centralPanel === "aem" && (
              aemContent || aemViewMode === "source" ? (
                aemViewMode === "preview" ? (
                  <div className="flex flex-col gap-2 h-full min-h-0">
                    <MddViewer content={aemContent || ""} />
                    <div className="self-end flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => persistAemContent(aemContent || "")}
                        disabled={!aemDirty}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)]"
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
                        onClick={() => persistAemContent(aemContent || "")}
                        disabled={!aemDirty}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[color-mix(in_oklch,var(--primary)_18%,transparent)]"
                      >
                        <Save className="w-4 h-4" />
                        Guardar
                      </button>
                    </div>
                    <textarea
                      value={aemContent || ""}
                      onChange={(e) => setAemContent(e.target.value)}
                      onBlur={handleAemBlur}
                      placeholder="# AEM\n\nAnálisis y Estrategia de Mercado — contenido sobre mercado, competencia, posicionamiento..."
                      className="flex-1 min-h-0 w-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
                      spellCheck={false}
                    />
                  </div>
                )
              ) : (
                <DocEmptyState
                  icon={FileText}
                  title="AEM"
                  description="Análisis y Estrategia de Mercado — define el mercado, competencia, posicionamiento y estrategia comercial del proyecto."
                  onGenerate={() => {}}
                  loading={false}
                  hasMdd={false}
                />
              )
            )}
            {centralPanel === "brd" && projectId && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
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
                  <div className="shrink-0 flex items-center justify-between gap-2 rounded-lg border border-[color-mix(in_oklch,var(--primary)_28%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] px-3 py-2">
                    <span className="text-sm text-[color-mix(in_oklch,var(--primary)_62%,var(--foreground))]">Cambios sin guardar en To-Be / As-Is de esta etapa.</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setToBeWorkshopDraft(activeWorkshopStage?.toBeManualContent ?? "");
                          setAsIsWorkshopDraft(activeWorkshopStage?.asIsManualContent ?? "");
                        }}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void persistToBeTabWorkshopDrafts()}
                        disabled={brdTobePersistBusy}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-1.5 text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Regenerar
                    </button>
                    <button
                      type="button"
                      onClick={() => persistTasksContent(tasksContent)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
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
                    className="w-full min-h-full bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
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
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--primary)]">Decisiones Arquitectónicas (ADRs)</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">Historial de decisiones persistidas en el Grafo de Memoria Semántica.</p>
                  </div>
                  <button
                    onClick={() => projectId && fetchAdrs(projectId)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--muted)_62%,var(--card))] text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Actualizar
                  </button>
                </div>

                {adrs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center opacity-50">
                    <Brain className="w-12 h-12 mb-4 text-[color-mix(in_oklch,var(--foreground-subtle)_82%,var(--background))]" />
                    <p className="text-[var(--muted-foreground)]">No hay decisiones guardadas aún para este proyecto.</p>
                    <p className="text-xs text-[var(--foreground-subtle)] mt-2">Las decisiones se extraen automáticamente al finalizar el MDD.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {adrs.map((adr, i) => (
                      <div key={i} className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] transition-colors shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-[var(--foreground)] flex items-center gap-2">
                            <CheckCircle2 className={`w-4 h-4 ${adr.status === 'Accepted' ? 'text-[var(--success)]' : 'text-[var(--primary)]'}`} />
                            {adr.title}
                          </h4>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${adr.status === 'Accepted' ? 'bg-[color-mix(in_oklch,var(--success)_12%,transparent)] text-[color-mix(in_oklch,var(--success)_88%,var(--foreground))]' : 'bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] text-[var(--primary)]'}`}>
                            {adr.status}
                          </span>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] font-bold text-[var(--foreground-subtle)] uppercase">Contexto</p>
                            <p className="text-sm text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] leading-relaxed">{adr.context}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-[var(--foreground-subtle)] uppercase">Consecuencia</p>
                            <p className="text-sm text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] leading-relaxed italic border-l-2 border-[var(--border)] pl-3">{adr.consequence}</p>
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

        {/* Columna C: métricas — solo móvil (panel completo). En lg la pestaña flota sobre el área de trabajo (sin tercera columna). */}
        <section
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

        <nav
          className="lg:hidden shrink-0 sticky bottom-0 z-10 grid grid-cols-3 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_92%,black)] backdrop-blur-sm pb-[max(4px,env(safe-area-inset-bottom))]"
          aria-label="Cambiar panel del workshop"
        >
          <button
            type="button"
            onClick={() => setMobileWorkshopColumn("chat")}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium touch-manipulation min-h-[52px]",
              mobileWorkshopColumn === "chat"
                ? "text-[var(--primary)] bg-[color-mix(in_oklch,var(--card)_92%,var(--background))] border-t-2 border-t-[var(--primary)] -mt-px"
                : "text-[var(--foreground-subtle)] border-t-2 border-t-transparent active:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
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
                ? "text-[var(--primary)] bg-[color-mix(in_oklch,var(--card)_92%,var(--background))] border-t-2 border-t-[var(--primary)] -mt-px"
                : "text-[var(--foreground-subtle)] border-t-2 border-t-transparent active:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
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
                        <table className="w-full text-sm text-left min-w-[520px] sm:min-w-0">
                          <thead className="bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                            <tr>
                              <th className="px-4 py-3 font-medium">Sección</th>
                              <th className="px-4 py-3 font-medium">Agente</th>
                              <th className="px-4 py-3 font-medium text-right">Calificación</th>
                              <th className="px-4 py-3 font-medium">Por qué</th>
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
                                <td className="px-4 py-2.5 text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] align-top">{row.section}</td>
                                <td className="px-4 py-2.5 text-[var(--muted-foreground)] align-top">{row.agent}</td>
                                <td className={`px-4 py-2.5 text-right font-mono font-medium align-top ${(row.value ?? 0) >= 90 ? "text-[color-mix(in_oklch,var(--success)_88%,var(--foreground))]" : (row.value ?? 0) >= 50 ? "text-[var(--primary)]" : "text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))]"}`}>
                                  {row.value ?? 0}%
                                </td>
                                <td className="px-4 py-2.5 text-[var(--foreground-subtle)] text-xs max-w-[280px] align-top">
                                  {precisionBreakdown.sectionReasons?.[row.reasonKey] ?? "—"}
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
        {
          pendingDeliverablePreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
                  <h2 className="text-lg font-semibold text-[var(--primary)]">
                    Vista previa: {pendingDeliverablePreview.kind === "blueprint" ? "Blueprint" : pendingDeliverablePreview.kind === "api" ? "Contratos API" : "Infra"}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => discardDeliverable()}
                      className="px-3 py-1.5 rounded bg-[var(--muted)] text-[color-mix(in_oklch,var(--foreground)_88%,var(--muted-foreground))] hover:bg-[var(--muted)] text-sm"
                    >
                      Descartar
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeliverable()}
                      className="px-3 py-1.5 rounded bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] text-[var(--primary)] hover:bg-[color-mix(in_oklch,var(--primary)_26%,transparent)] text-sm font-medium"
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
