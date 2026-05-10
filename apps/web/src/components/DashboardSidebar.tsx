/**
 * @fileoverview Left navigation: brand, collapsible rail, project search, nav,
 * theme controls, and user footer. Collapse state is controlled by parent (persisted).
 * With an open workshop project, shows deliverables under the project name and syncs
 * the active document tab via `useWorkshopStore`.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  FolderOpen,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  X,
} from "lucide-react";
import { Input } from "./ui/Input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui";
import type { TheForgeUser } from "@/utils/apiClient";
import { useTheme, type ThemePreference } from "@/theme/ThemeProvider";
import { cn } from "@/lib/utils";
import { useWorkshopStore } from "../store/workshopStore";
import { buildWorkshopDocNavItems, workshopTabDocHasContent } from "../utils/workshopDocNav";

export interface DashboardSidebarProps {
  projectSearchQuery: string;
  onProjectSearchChange: (value: string) => void;
  user: TheForgeUser | null;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenUsers: () => void;
  canManageUsers: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** When set, sidebar shows the workshop project tree instead of the dashboard “Proyectos” shortcut. */
  workshopProject?: { id: string; name: string } | null;
  /** Leave workshop and return to the project dashboard. */
  onExitWorkshop?: () => void;
  /** Runs before scrolling to the projects grid (e.g. close admin Users view). */
  onBeforeNavigateToProjects?: () => void;
}

function getDisplayName(user: TheForgeUser | null): string {
  const n = user?.name?.trim();
  if (n) return n;
  const local = user?.email?.split("@")[0]?.trim();
  if (local) return local;
  return "Usuario";
}

function getUserInitials(user: TheForgeUser | null): string {
  const n = user?.name?.trim() ?? "";
  if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  if (n.length === 1) return (n + (user?.email?.[0] ?? "?")).slice(0, 2).toUpperCase();
  if (!user?.email) return "?";
  const local = user.email.split("@")[0] ?? "";
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return user.email.slice(0, 2).toUpperCase();
}

function closeDetailsFromEvent(e: MouseEvent<HTMLElement>) {
  const root = e.currentTarget.closest("details");
  if (root) (root as HTMLDetailsElement).open = false;
}

/**
 * Tooltip for collapsed rail: native `title` is easy to miss and can behave poorly with nested overflow.
 */
function CollapsedRailHint({
  rail,
  label,
  children,
}: {
  rail: boolean;
  label: string;
  children: ReactElement;
}) {
  if (!rail) return children;
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ThemeModeToggle({ compact }: { compact: boolean }) {
  const { preference, setPreference } = useTheme();

  const item = (value: ThemePreference, label: string, icon: ReactNode) => {
    const button = (
      <button
        type="button"
        onClick={() => setPreference(value)}
        title={label}
        aria-label={label}
        aria-pressed={preference === value}
        className={cn(
          "flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors",
          compact ? "w-full py-2" : "flex-1 flex-col gap-0.5 py-1.5 text-[10px]",
          preference === value
            ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
            : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
        )}
      >
        <span className={cn("flex items-center justify-center", !compact && "flex-col gap-0.5")}>
          <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
          {!compact ? <span className="leading-none">{label}</span> : null}
        </span>
      </button>
    );
    if (!compact) return button;
    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center" sideOffset={10}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div
      className={cn(
        "mb-2 rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] p-0.5 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)]",
        compact ? "flex flex-col gap-0.5" : "",
      )}
      role="group"
      aria-label="Tema de la interfaz"
    >
      <div className={cn(compact ? "flex flex-col gap-0.5" : "flex gap-0.5")}>
        {item("light", "Claro", <Sun className="h-4 w-4" />)}
        {item("system", "Sistema", <Monitor className="h-4 w-4" />)}
        {item("dark", "Oscuro", <Moon className="h-4 w-4" />)}
      </div>
    </div>
  );
}

export function DashboardSidebar({
  projectSearchQuery,
  onProjectSearchChange,
  user,
  onLogout,
  onOpenSettings,
  onOpenUsers,
  canManageUsers,
  collapsed,
  onToggleCollapsed,
  workshopProject = null,
  onExitWorkshop,
  onBeforeNavigateToProjects,
}: DashboardSidebarProps) {
  const rail = collapsed;
  /** Drawer navigation on viewports below sm; desktop sidebar unchanged from sm. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null);
  /** Expanded/collapsed list under the workshop project name (header toggles this). */
  const [workshopStepsExpanded, setWorkshopStepsExpanded] = useState(true);

  useEffect(() => {
    setWorkshopStepsExpanded(true);
  }, [workshopProject?.id]);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") return;
    const mq = globalThis.matchMedia("(min-width: 640px)");
    function onChange() {
      if (mq.matches) setMobileNavOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleOpenMobileSearch = useCallback(() => {
    setMobileNavOpen(true);
    requestAnimationFrame(() => {
      projectSearchInputRef.current?.focus();
    });
  }, []);

  const handleScrollToProjects = useCallback(() => {
    onBeforeNavigateToProjects?.();
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("dashboard-projects")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [onBeforeNavigateToProjects]);

  const storeProject = useWorkshopStore((s) => s.project);
  const workshopStages = useWorkshopStore((s) => s.workshopStages);
  const activeStageId = useWorkshopStore((s) => s.activeStageId);
  const activeDocPanel = useWorkshopStore((s) => s.workshopActiveDocPanel);
  const setWorkshopActiveDocPanel = useWorkshopStore((s) => s.setWorkshopActiveDocPanel);
  const mddContent = useWorkshopStore((s) => s.mddContent);
  const dbgaContent = useWorkshopStore((s) => s.dbgaContent);
  const phase0SummaryContent = useWorkshopStore((s) => s.phase0SummaryContent);
  const specContent = useWorkshopStore((s) => s.specContent);
  const architectureContent = useWorkshopStore((s) => s.architectureContent);
  const useCasesContent = useWorkshopStore((s) => s.useCasesContent);
  const userStoriesContent = useWorkshopStore((s) => s.userStoriesContent);
  const blueprintContent = useWorkshopStore((s) => s.blueprintContent);
  const uxUiGuideContent = useWorkshopStore((s) => s.uxUiGuideContent);
  const aemContent = useWorkshopStore((s) => s.aemContent);
  const apiContractsContent = useWorkshopStore((s) => s.apiContractsContent);
  const logicFlowsContent = useWorkshopStore((s) => s.logicFlowsContent);
  const tasksContent = useWorkshopStore((s) => s.tasksContent);
  const infraContent = useWorkshopStore((s) => s.infraContent);
  const adrs = useWorkshopStore((s) => s.adrs);

  const activeWorkshopStageForNav = useMemo(() => {
    const stages = workshopStages.length > 0 ? workshopStages : (storeProject?.stages ?? []);
    return stages.find((s) => s.id === activeStageId) ?? null;
  }, [workshopStages, storeProject?.stages, activeStageId]);

  const activeLegacyStateForNav = useMemo(() => {
    if (!storeProject) return null;
    if (storeProject.projectType === "LEGACY" && activeWorkshopStageForNav?.legacyChangeState) {
      return activeWorkshopStageForNav.legacyChangeState;
    }
    return storeProject.legacyFlowState ?? null;
  }, [storeProject, activeWorkshopStageForNav?.legacyChangeState]);

  const isLegacyProject = storeProject?.projectType === "LEGACY";
  const complexity = storeProject?.complexity ?? "HIGH";
  const effectiveMddTrimmed = useMemo(
    () => (mddContent ?? "").trim() || (storeProject?.mddContent ?? "").trim(),
    [mddContent, storeProject?.mddContent],
  );
  const isReverseEngineering =
    !!isLegacyProject &&
    !!((activeLegacyStateForNav?.codebaseDoc ?? "").trim()) &&
    !effectiveMddTrimmed;
  const effectiveComplexityForTabs = isReverseEngineering ? "HIGH" : complexity;

  const workshopDeliverables = useMemo(() => {
    if (!workshopProject || !storeProject || storeProject.id !== workshopProject.id) return [];
    return buildWorkshopDocNavItems({
      isLegacyProject: !!isLegacyProject,
      effectiveComplexityForTabs,
      activeLegacyState: activeLegacyStateForNav,
      phase0SummaryContent,
      dbgaContent,
      activeWorkshopStage: activeWorkshopStageForNav,
      mddContent,
      specContent,
      architectureContent,
      useCasesContent,
      userStoriesContent,
      blueprintContent,
      uxUiGuideContent,
      aemContent,
      apiContractsContent,
      logicFlowsContent,
      tasksContent,
      adrs,
      infraContent,
    });
  }, [
    workshopProject,
    storeProject,
    isLegacyProject,
    effectiveComplexityForTabs,
    activeLegacyStateForNav,
    phase0SummaryContent,
    dbgaContent,
    activeWorkshopStageForNav,
    mddContent,
    specContent,
    architectureContent,
    useCasesContent,
    userStoriesContent,
    blueprintContent,
    uxUiGuideContent,
    aemContent,
    apiContractsContent,
    logicFlowsContent,
    tasksContent,
    adrs,
    infraContent,
  ]);

  const inWorkshop = !!workshopProject && typeof onExitWorkshop === "function";

  const handleExitWorkshopNav = useCallback(() => {
    closeMobileNav();
    onExitWorkshop?.();
  }, [closeMobileNav, onExitWorkshop]);

  return (
    <div className="relative flex w-full shrink-0 flex-col sm:h-full sm:min-h-0 sm:w-auto sm:shrink-0">
      <header
        className="sticky top-0 z-40 flex w-full items-center justify-between gap-2 border-b border-[color-mix(in_oklch,var(--sidebar-border)_90%,var(--sidebar))] bg-[var(--sidebar)] px-3 py-2.5 text-[var(--sidebar-foreground)] sm:hidden"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--sidebar-foreground)_7%,var(--sidebar))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-foreground)_10%,transparent)]">
            <Flame className="h-5 w-5 text-[var(--primary)]" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-[var(--sidebar-foreground)]">TheForge</p>
            <p className="truncate text-[11px] text-[var(--muted-foreground)]">Software Factory</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!inWorkshop ? (
            <button
              type="button"
              onClick={handleOpenMobileSearch}
              title="Buscar proyectos"
              aria-label="Buscar proyectos"
              className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--sidebar-foreground)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]"
            >
              <Search className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            title={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
            aria-label={mobileNavOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
            aria-expanded={mobileNavOpen}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--sidebar-border)_70%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] text-[var(--sidebar-foreground)] shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)] active:scale-[0.97]"
          >
            {mobileNavOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </header>

      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-[color-mix(in_oklch,var(--background)_40%,black)] sm:hidden"
          onClick={closeMobileNav}
        />
      ) : null}

      <TooltipProvider delayDuration={280}>
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] sm:border-b-0 sm:border-r sm:min-h-0 sm:self-stretch sm:sticky sm:top-0 sm:transition-[width] sm:duration-200 sm:ease-out",
        // Mobile: slide-over drawer; desktop: unchanged width and sticky column.
        "max-sm:fixed max-sm:left-0 max-sm:top-0 max-sm:z-50 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-[min(19rem,92vw)] max-sm:overflow-y-auto max-sm:overscroll-y-contain max-sm:border-r max-sm:shadow-2xl max-sm:transition-transform max-sm:duration-200 max-sm:ease-out max-sm:[-webkit-overflow-scrolling:touch]",
        mobileNavOpen
          ? "max-sm:translate-x-0 max-sm:pointer-events-auto"
          : "max-sm:-translate-x-full max-sm:pointer-events-none",
        !inWorkshop && "sm:h-full sm:max-h-[100dvh] sm:min-h-0",
        inWorkshop &&
          "min-h-0 overflow-hidden sm:h-full sm:max-h-[min(100dvh,100svh)] sm:min-h-0",
        // Expanded: 16rem / 256px (common nav width); rail stays 4rem.
        rail ? "sm:w-16 sm:min-w-[4rem]" : "sm:w-64 sm:min-w-64",
      )}
      aria-label="Navegación principal"
    >
      <div
        className={cn(
          "flex flex-col min-h-0",
          inWorkshop
            ? "min-h-0 flex-1 gap-4 overflow-hidden"
            : "min-h-0 gap-4 sm:flex-1 sm:overflow-hidden",
          rail ? "p-3 sm:px-2 sm:py-3" : "px-3 py-3 sm:px-3 sm:py-3",
        )}
      >
        <div
          className={cn(
            "flex w-full gap-2 max-sm:hidden",
            rail ? "sm:flex-col sm:items-center sm:gap-2.5" : "items-center justify-between",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-center gap-2.5",
              rail ? "sm:flex-none sm:justify-center" : "flex-1",
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--sidebar-foreground)_7%,var(--sidebar))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-foreground)_10%,transparent)]">
              <Flame className="h-5 w-5 text-[var(--primary)]" aria-hidden />
            </div>
            <div className={cn("min-w-0", rail && "sm:hidden")}>
              <p className="truncate text-base font-semibold tracking-tight text-[var(--sidebar-foreground)]">
                TheForge
              </p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">Software Factory</p>
            </div>
          </div>
          <CollapsedRailHint rail={rail} label="Expandir barra lateral">
            <button
              type="button"
              onClick={onToggleCollapsed}
              title={rail ? "Expandir barra lateral" : "Contraer barra lateral"}
              aria-expanded={!rail}
              className={cn(
                "hidden shrink-0 flex items-center justify-center rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--sidebar-border)_70%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] p-2 text-[var(--sidebar-foreground)] shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)] active:scale-[0.97] sm:flex",
                rail && "sm:size-10 sm:shrink-0 sm:p-0",
              )}
            >
              <ChevronLeft className={cn("h-5 w-5", rail && "hidden")} aria-hidden />
              <ChevronRight className={cn("hidden h-5 w-5", rail && "block")} aria-hidden />
            </button>
          </CollapsedRailHint>
        </div>

        {!inWorkshop ? (
          <div className={cn("relative", rail && "sm:hidden")}>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <Input
              ref={projectSearchInputRef}
              type="search"
              value={projectSearchQuery}
              onChange={(e) => onProjectSearchChange(e.target.value)}
              placeholder="Buscar proyectos…"
              className="w-full min-h-10 rounded-[var(--radius-lg)] border border-[color-mix(in_oklch,var(--sidebar-border)_65%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_5%,var(--sidebar))] pl-9 pr-3 text-sm text-[var(--sidebar-foreground)] placeholder:text-[color-mix(in_oklch,var(--sidebar-foreground)_55%,var(--sidebar))]"
              aria-label="Buscar en la lista de proyectos"
            />
          </div>
        ) : null}

        <div className={cn("relative hidden", rail && "sm:block", inWorkshop && "sm:hidden")}>
          <CollapsedRailHint rail={rail} label="Buscar proyectos — expandir barra lateral">
            <button
              type="button"
              title="Expandir barra para buscar"
              aria-label="Expandir barra lateral para buscar proyectos"
              onClick={onToggleCollapsed}
              className="flex w-full items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklch,var(--sidebar-border)_65%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_5%,var(--sidebar))] py-2.5 text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
            >
              <Search className="h-5 w-5" />
            </button>
          </CollapsedRailHint>
        </div>

        <nav
          className={cn(
            "flex min-w-0 flex-col gap-1",
            inWorkshop && "min-h-0 flex-1 overflow-hidden",
          )}
          aria-label="Secciones"
        >
          <p
            className={cn(
              "px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]",
              rail && "sm:hidden",
            )}
          >
            {inWorkshop ? "Taller" : "Menú"}
          </p>

          {inWorkshop ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <CollapsedRailHint rail={rail} label="Volver al panel de proyectos">
                <button
                  type="button"
                  onClick={handleExitWorkshopNav}
                  title="Volver al panel de proyectos"
                  className={cn(
                    "flex w-full shrink-0 items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-left text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
                    rail && "sm:justify-center sm:px-0",
                  )}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                  <span className={cn("truncate", rail && "sm:hidden")}>Panel de proyectos</span>
                </button>
              </CollapsedRailHint>

              {/* Not <details>: flex + min-h-0 height math stays reliable; collapse is explicit state on the header button. */}
              <div
                className="group/ws flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                role="group"
                aria-label={`Proyecto ${workshopProject.name}`}
              >
                {rail ? (
                  <div
                    className={cn(
                      "flex shrink-0 items-center gap-2 rounded-[var(--radius-lg)] px-2 py-2",
                      "bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]",
                      "sm:justify-center sm:px-0",
                    )}
                    title={undefined}
                  >
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]">
                          <FolderOpen className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" sideOffset={10}>
                        Proyecto: {workshopProject.name}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-expanded={workshopStepsExpanded}
                    aria-controls="workshop-deliverables-panel"
                    title={workshopProject.name}
                    onClick={() => setWorkshopStepsExpanded((open) => !open)}
                    className={cn(
                      "flex w-full shrink-0 items-center gap-2 rounded-[var(--radius-lg)] px-2 py-2 text-left",
                      "bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]",
                      "outline-none transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_20%,var(--sidebar))] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
                    )}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{workshopProject.name}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
                        workshopStepsExpanded ? "rotate-180" : "rotate-0",
                      )}
                      aria-hidden
                    />
                  </button>
                )}
                {(rail || workshopStepsExpanded) ? (
                <div
                  id="workshop-deliverables-panel"
                  className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1"
                >
                  <p
                    className={cn(
                      "mb-1.5 shrink-0 px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]",
                      rail && "sm:hidden",
                    )}
                  >
                    Pasos del flujo
                  </p>
                  <div
                    className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-0.5 pb-1 [-webkit-overflow-scrolling:touch]"
                    role="list"
                    aria-label="Pasos del workshop"
                  >
                    {!storeProject || storeProject.id !== workshopProject.id ? (
                      <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">Cargando entregables…</p>
                    ) : (
                      <div className="relative">
                        {!rail ? (
                          <span
                            className="pointer-events-none absolute bottom-1 left-[0.8125rem] top-1 w-px bg-[color-mix(in_oklch,var(--sidebar-border)_92%,transparent)]"
                            aria-hidden
                          />
                        ) : null}
                        <ul className="relative m-0 list-none space-y-0.5 p-0 py-0.5">
                          {workshopDeliverables.map((item) => {
                            const done = workshopTabDocHasContent(item.id, item.content);
                            const Icon = item.Icon;
                            const isCurrent = activeDocPanel === item.id;
                            return (
                              <li
                                key={item.id}
                                className={cn(
                                  "relative",
                                  !rail && "pl-5 sm:pl-6",
                                  rail && "flex justify-center py-0.5",
                                )}
                              >
                                {!rail && isCurrent ? (
                                  <span
                                    className="absolute left-[0.8125rem] top-1/2 z-[1] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--sidebar)] bg-[var(--primary)] shadow-sm"
                                    aria-hidden
                                  />
                                ) : null}
                                <CollapsedRailHint
                                  rail={rail}
                                  label={
                                    done ? `${item.label} · Con contenido · ${item.title}` : `${item.label} · ${item.title}`
                                  }
                                >
                                  <button
                                    type="button"
                                    role="listitem"
                                    title={`${item.title}${done ? " — con contenido" : ""}`}
                                    aria-current={isCurrent ? "page" : undefined}
                                    onClick={() => {
                                      closeMobileNav();
                                      setWorkshopActiveDocPanel(item.id);
                                    }}
                                    className={cn(
                                      "flex min-w-0 items-center font-medium transition-colors",
                                      rail
                                        ? cn(
                                            "mx-auto box-border h-9 w-9 shrink-0 items-center justify-center rounded-lg p-0",
                                            "mb-0.5 last:mb-0",
                                            isCurrent
                                              ? "bg-[color-mix(in_oklch,var(--sidebar-accent)_100%,transparent)] text-[var(--primary)]"
                                              : "text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklch,var(--sidebar-accent)_88%,transparent)] hover:text-[var(--sidebar-accent-foreground)]",
                                          )
                                        : cn(
                                            "mb-px w-full gap-2.5 rounded-md px-2 py-1.5 text-left text-sm last:mb-0",
                                            isCurrent
                                              ? "bg-[color-mix(in_oklch,var(--sidebar-accent)_100%,transparent)] text-[var(--sidebar-accent-foreground)]"
                                              : "text-[color-mix(in_oklch,var(--muted-foreground)_96%,var(--sidebar-foreground))] hover:bg-[color-mix(in_oklch,var(--sidebar-accent)_72%,transparent)]",
                                          ),
                                    )}
                                  >
                                    {rail ? (
                                      <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
                                        <Icon
                                          className={cn(
                                            "h-4 w-4",
                                            isCurrent ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
                                          )}
                                        />
                                        {done ? (
                                          <CheckCircle2 className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-[color-mix(in_oklch,var(--success)_90%,var(--sidebar-foreground))] [filter:drop-shadow(0_0_1px_var(--sidebar))]" />
                                        ) : null}
                                      </span>
                                    ) : (
                                      <>
                                        <Icon
                                          className={cn(
                                            "h-4 w-4 shrink-0 opacity-90",
                                            isCurrent
                                              ? "text-[var(--primary)]"
                                              : "text-[color-mix(in_oklch,var(--muted-foreground)_92%,var(--sidebar-foreground))]",
                                          )}
                                          aria-hidden
                                        />
                                        <span className="min-w-0 flex-1 text-left leading-snug">{item.label}</span>
                                        {done ? (
                                          <CheckCircle2
                                            className="h-3.5 w-3.5 shrink-0 text-[color-mix(in_oklch,var(--success)_78%,var(--sidebar-foreground))] opacity-90"
                                            aria-hidden
                                          />
                                        ) : null}
                                      </>
                                    )}
                                  </button>
                                </CollapsedRailHint>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                ) : null}
              </div>
            </div>
          ) : (
            <CollapsedRailHint rail={rail} label="Proyectos">
              <button
                type="button"
                onClick={handleScrollToProjects}
                title="Proyectos"
                className={cn(
                  "flex w-full items-center gap-3 rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] px-3 py-2.5 text-left text-sm font-medium text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_20%,var(--sidebar))]",
                  rail && "sm:justify-center sm:px-0",
                )}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                <span className={cn(rail && "sm:hidden")}>Proyectos</span>
              </button>
            </CollapsedRailHint>
          )}
        </nav>
      </div>

      <div
        className={cn(
          "mt-auto shrink-0 border-t border-[color-mix(in_oklch,var(--sidebar-border)_75%,var(--sidebar))] p-2",
          rail && "sm:px-1.5",
        )}
      >
        <ThemeModeToggle compact={rail} />
        <details className="group relative">
          <summary
            aria-label={
              rail
                ? `Cuenta: ${getDisplayName(user)}, ${user?.email ?? ""}. Abrir menú`
                : undefined
            }
            className={cn(
              "flex cursor-pointer list-none items-center gap-3 rounded-[var(--radius-lg)] px-2 py-2 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-[var(--sidebar-accent)]",
              rail && "sm:flex-col sm:justify-center sm:gap-1 sm:px-0",
            )}
          >
            {rail ? (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex shrink-0 rounded-full outline-none ring-offset-2 ring-offset-[var(--sidebar)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--sidebar-foreground)_9%,var(--sidebar))] text-xs font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-foreground)_12%,transparent)]"
                      aria-hidden
                    >
                      {getUserInitials(user)}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right" align="end" sideOffset={10} className="max-w-[14rem]">
                  <span className="block font-medium text-[var(--popover-foreground)]">{getDisplayName(user)}</span>
                  {user?.email ? (
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--muted-foreground)]">
                      {user.email}
                    </span>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--sidebar-foreground)_9%,var(--sidebar))] text-xs font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-foreground)_12%,transparent)]"
                aria-hidden
              >
                {getUserInitials(user)}
              </div>
            )}
            <div className={cn("min-w-0 flex-1 text-left", rail && "sm:hidden")}>
              <p className="truncate text-sm font-medium text-[var(--sidebar-foreground)]">
                {getDisplayName(user)}
              </p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">{user?.email || ""}</p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180",
                rail && "sm:hidden",
              )}
              aria-hidden
            />
          </summary>
          <div className="absolute bottom-full left-2 right-2 z-[var(--z-popover)] mb-1 min-w-[10rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--popover)] py-1 text-[var(--popover-foreground)] shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--muted)]"
              onClick={(e) => {
                closeDetailsFromEvent(e);
                closeMobileNav();
                onOpenSettings();
              }}
            >
              <Settings className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              Ajustes
            </button>
            {canManageUsers ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--muted)]"
                onClick={(e) => {
                  closeDetailsFromEvent(e);
                  closeMobileNav();
                  onOpenUsers();
                }}
              >
                <Shield className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                Usuarios
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--popover-foreground)] hover:bg-[var(--muted)]"
              onClick={(e) => {
                closeDetailsFromEvent(e);
                closeMobileNav();
                onLogout();
              }}
            >
              <LogOut className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
              Cerrar sesión
            </button>
          </div>
        </details>
      </div>
    </aside>
    </TooltipProvider>
    </div>
  );
}
