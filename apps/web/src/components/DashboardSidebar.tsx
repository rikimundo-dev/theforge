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
  CircleCheck,
  ChevronDown,
  Flame,
  FolderOpen,
  Heart,
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

/** Project row shown under the dashboard “Proyectos” menu group. */
export interface DashboardSidebarProjectItem {
  id: string;
  name: string;
  isFavorite?: boolean;
}

export interface DashboardSidebarProps {
  projectSearchQuery: string;
  onProjectSearchChange: (value: string) => void;
  /** Filtered project list for the dashboard sidebar submenu (respects search). */
  dashboardProjects?: DashboardSidebarProjectItem[];
  projectsLoading?: boolean;
  onOpenProject?: (project: DashboardSidebarProjectItem) => void;
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
  /** Runs before switching workshop doc tab (e.g. close Settings / Users overlay). */
  onBeforeNavigateToWorkshopDoc?: () => void;
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

/** Shared 40×40 control for the collapsed (rail) sidebar — one shape, surface, and focus ring. */
const RAIL_CONTROL_SIZE = "size-10 shrink-0";
const RAIL_CONTROL_RADIUS = "rounded-[var(--radius-md)]";
const RAIL_CONTROL_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]";
const RAIL_CONTROL_SURFACE =
  "border border-[color-mix(in_oklch,var(--sidebar-border)_70%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)]";
const RAIL_CONTROL_INTERACTIVE =
  "transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] active:scale-[0.97]";
const railControlClass = (extra?: string) =>
  cn(
    "flex items-center justify-center",
    RAIL_CONTROL_SIZE,
    RAIL_CONTROL_RADIUS,
    RAIL_CONTROL_SURFACE,
    RAIL_CONTROL_FOCUS,
    RAIL_CONTROL_INTERACTIVE,
    extra,
  );
const railControlActiveClass = (extra?: string) =>
  cn(
    "flex items-center justify-center",
    RAIL_CONTROL_SIZE,
    RAIL_CONTROL_RADIUS,
    RAIL_CONTROL_FOCUS,
    "border border-[color-mix(in_oklch,var(--primary)_28%,transparent)] bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)] transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_20%,var(--sidebar))]",
    extra,
  );

/** Solid success badge on workshop step icons (rail + expanded). */
const STEP_DONE_BADGE_CLASS =
  "fill-[color-mix(in_oklch,var(--success)_92%,transparent)] text-[var(--sidebar)] stroke-[var(--sidebar)]";

/** Panel-left toggle (Lucide PanelLeft geometry) with duotone fill on the sidebar column. */
function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("size-5 shrink-0 text-[var(--sidebar-foreground)]", className)}
      aria-hidden
    >
      <rect
        x="3"
        y="3"
        width="6"
        height="18"
        rx="1"
        className="fill-[color-mix(in_oklch,currentColor_24%,transparent)]"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M9 3v18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
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
          "flex items-center justify-center font-medium transition-colors",
          compact
            ? cn(
                RAIL_CONTROL_SIZE,
                RAIL_CONTROL_RADIUS,
                RAIL_CONTROL_FOCUS,
                preference === value
                  ? "border border-[color-mix(in_oklch,var(--primary)_35%,transparent)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary-foreground)_12%,transparent)]"
                  : cn(RAIL_CONTROL_SURFACE, "text-[var(--sidebar-foreground)]", RAIL_CONTROL_INTERACTIVE),
              )
            : cn(
                "flex-1 flex-col gap-0.5 rounded-[var(--radius-md)] py-1.5 text-[10px]",
                preference === value
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
                  : "text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
              ),
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
        "mb-2",
        compact
          ? "flex flex-col items-center gap-2"
          : "rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] p-0.5 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)]",
      )}
      role="group"
      aria-label="Tema de la interfaz"
    >
      <div className={cn(compact ? "flex flex-col items-center gap-2" : "flex gap-0.5")}>
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
  dashboardProjects = [],
  projectsLoading = false,
  onOpenProject,
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
  onBeforeNavigateToWorkshopDoc,
}: DashboardSidebarProps) {
  /** Drawer navigation below lg; fixed sidebar column from lg. */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /** Collapsed icon rail only on lg+; mobile drawer always shows labels and full-width rows. */
  const [isLgViewport, setIsLgViewport] = useState(() =>
    typeof globalThis.matchMedia === "function"
      ? globalThis.matchMedia("(min-width: 1024px)").matches
      : true,
  );
  const rail = collapsed && isLgViewport;
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null);
  /** Expanded/collapsed list under the workshop project name (header toggles this). */
  const [workshopStepsExpanded, setWorkshopStepsExpanded] = useState(true);
  /** Expanded/collapsed list under the dashboard “Proyectos” group. */
  const [projectsNavExpanded, setProjectsNavExpanded] = useState(true);

  const sortedDashboardProjects = useMemo(() => {
    const list = [...dashboardProjects];
    list.sort((a, b) => {
      const favA = a.isFavorite ? 1 : 0;
      const favB = b.isFavorite ? 1 : 0;
      if (favB !== favA) return favB - favA;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return list;
  }, [dashboardProjects]);

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
    const mq = globalThis.matchMedia("(min-width: 1024px)");
    function onChange() {
      setIsLgViewport(mq.matches);
      if (mq.matches) setMobileNavOpen(false);
    }
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleOpenMobileSearch = useCallback(() => {
    setMobileNavOpen(true);
    requestAnimationFrame(() => {
      projectSearchInputRef.current?.focus();
    });
  }, []);

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

  useEffect(() => {
    if (!inWorkshop) setProjectsNavExpanded(true);
  }, [inWorkshop, dashboardProjects.length]);

  const handleOpenDashboardProject = useCallback(
    (project: DashboardSidebarProjectItem) => {
      closeMobileNav();
      onBeforeNavigateToProjects?.();
      onOpenProject?.(project);
    },
    [closeMobileNav, onBeforeNavigateToProjects, onOpenProject],
  );

  const handleExitWorkshopNav = useCallback(() => {
    closeMobileNav();
    onExitWorkshop?.();
  }, [closeMobileNav, onExitWorkshop]);

  return (
    <div className="relative flex w-full shrink-0 flex-col lg:z-40 lg:h-full lg:min-h-0 lg:w-auto lg:shrink-0">
      <header
        className="sticky top-0 z-40 flex w-full items-center justify-between gap-2 border-b border-[color-mix(in_oklch,var(--sidebar-border)_90%,var(--sidebar))] bg-[var(--sidebar)] px-3 py-2.5 text-[var(--sidebar-foreground)] lg:hidden"
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
          className="fixed inset-0 z-30 bg-[color-mix(in_oklch,var(--background)_40%,black)] lg:hidden"
          onClick={closeMobileNav}
        />
      ) : null}

      <TooltipProvider delayDuration={280}>
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] lg:border-b-0 lg:border-r lg:min-h-0 lg:self-stretch lg:sticky lg:top-0 lg:transition-[width] lg:duration-200 lg:ease-out",
        // Mobile: slide-over drawer; desktop: unchanged width and sticky column.
        "max-lg:absolute max-lg:left-0 max-lg:top-0 max-lg:z-50 max-lg:flex max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:w-[min(19rem,92vw)] max-lg:flex-col max-lg:overflow-y-auto max-lg:overscroll-y-contain max-lg:border-r max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-200 max-lg:ease-out max-lg:[-webkit-overflow-scrolling:touch]",
        mobileNavOpen
          ? "max-lg:translate-x-0 max-lg:pointer-events-auto"
          : "max-lg:-translate-x-full max-lg:pointer-events-none",
        !inWorkshop && "lg:h-full lg:max-h-[100dvh] lg:min-h-0",
        inWorkshop &&
          cn(
            "min-h-0 lg:h-full lg:max-h-[min(100dvh,100svh)] lg:min-h-0",
            rail ? "overflow-hidden lg:overflow-visible" : "overflow-hidden",
          ),
        // Expanded: 16rem / 256px (common nav width); rail stays 4rem.
        rail ? "lg:w-16 lg:min-w-[4rem]" : "lg:w-64 lg:min-w-64",
      )}
      aria-label="Navegación principal"
    >
      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-col",
          inWorkshop
            ? cn("min-h-0 flex-1", rail ? "gap-2 overflow-visible" : "gap-4 overflow-hidden")
            : "min-h-0 flex-1 gap-4 lg:overflow-hidden",
          rail ? "p-3 lg:px-2 lg:py-3" : "px-3 py-3 lg:px-3 lg:py-3",
        )}
      >
        <div
          className={cn(
            "flex w-full gap-2 max-lg:hidden",
            rail ? "lg:flex-col lg:items-center lg:gap-2.5" : "items-center justify-between",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 items-center gap-2.5",
              rail ? "lg:flex-none lg:justify-center" : "flex-1",
            )}
          >
            <div
              className={cn(
                rail
                  ? railControlClass("pointer-events-none cursor-default hover:bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))]")
                  : "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--sidebar-foreground)_7%,var(--sidebar))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-foreground)_10%,transparent)]",
              )}
            >
              <Flame className="h-5 w-5 text-[var(--primary)]" aria-hidden />
            </div>
            <div className={cn("min-w-0", rail && "lg:hidden")}>
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
                "hidden shrink-0 items-center justify-center text-[var(--sidebar-foreground)] lg:flex",
                rail
                  ? railControlClass()
                  : "rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--sidebar-border)_70%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] p-2 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)] active:scale-[0.97]",
              )}
            >
              <SidebarToggleIcon />
            </button>
          </CollapsedRailHint>
        </div>

        {!inWorkshop ? (
          <div className={cn("relative", rail && "lg:hidden")}>
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

        <div className={cn("relative hidden", rail && "lg:block", inWorkshop && "lg:hidden")}>
          <CollapsedRailHint rail={rail} label="Buscar proyectos — expandir barra lateral">
            <button
              type="button"
              title="Expandir barra para buscar"
              aria-label="Expandir barra lateral para buscar proyectos"
              onClick={onToggleCollapsed}
              className={railControlClass("mx-auto text-[var(--sidebar-foreground)]")}
            >
              <Search className="h-5 w-5" />
            </button>
          </CollapsedRailHint>
        </div>

        <nav
          className={cn(
            "flex min-w-0 flex-col gap-1",
            inWorkshop && "min-h-0 flex-1",
            inWorkshop && !rail && "overflow-hidden",
          )}
          aria-label="Secciones"
        >
          <p
            className={cn(
              "px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]",
              rail && "lg:hidden",
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
                    "flex shrink-0 items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-left text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
                    rail ? railControlClass("mx-auto text-[var(--sidebar-foreground)]") : "w-full",
                  )}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                  <span className={cn("truncate", rail && "lg:hidden")}>Panel de proyectos</span>
                </button>
              </CollapsedRailHint>

              {/* Not <details>: flex + min-h-0 height math stays reliable; collapse is explicit state on the header button. */}
              <div
                className={cn(
                  "group/ws flex min-h-0 min-w-0 flex-1 flex-col",
                  !rail && "overflow-hidden",
                )}
                role="group"
                aria-label={`Proyecto ${workshopProject.name}`}
              >
                {rail ? (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <div
                        className={railControlActiveClass("mx-auto")}
                        title={undefined}
                      >
                        <FolderOpen className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center" sideOffset={10}>
                      Proyecto: {workshopProject.name}
                    </TooltipContent>
                  </Tooltip>
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
                  className={cn(
                    "mt-2 flex min-h-0 min-w-0 flex-1 flex-col",
                    rail ? "px-0" : "overflow-hidden px-1",
                  )}
                >
                  <p
                    className={cn(
                      "mb-1.5 shrink-0 px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]",
                      rail && "lg:hidden",
                    )}
                  >
                    Pasos del flujo
                  </p>
                  <div
                    className={cn(
                      "relative min-h-0 flex-1 overscroll-y-contain pb-1 [-webkit-overflow-scrolling:touch]",
                      rail
                        ? "scrollbar-rail overflow-y-auto overflow-x-visible"
                        : "overflow-x-hidden overflow-y-auto px-0.5 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5",
                    )}
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
                        <ul
                          className={cn(
                            "relative m-0 list-none p-0",
                            rail ? "flex flex-col items-center gap-1 py-0.5" : "space-y-0.5 py-0.5",
                          )}
                        >
                          {workshopDeliverables.map((item) => {
                            const done = workshopTabDocHasContent(item.id, item.content);
                            const Icon = item.Icon;
                            const isCurrent = activeDocPanel === item.id;
                            return (
                              <li
                                key={item.id}
                                className={cn("relative shrink-0", !rail && "pl-5 lg:pl-6")}
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
                                      onBeforeNavigateToWorkshopDoc?.();
                                      setWorkshopActiveDocPanel(item.id);
                                    }}
                                    className={cn(
                                      "flex min-w-0 items-center font-medium transition-colors",
                                      rail
                                        ? cn(
                                            "mx-auto box-border shrink-0 p-0",
                                            isCurrent
                                              ? railControlActiveClass("text-[var(--primary)]")
                                              : railControlClass("text-[var(--muted-foreground)]"),
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
                                      <span className="relative flex size-5 items-center justify-center" aria-hidden>
                                        <Icon
                                          className={cn(
                                            "size-4",
                                            isCurrent ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]",
                                          )}
                                        />
                                        {done ? (
                                          <CircleCheck
                                            className={cn(
                                              "pointer-events-none absolute bottom-0 right-0 size-3",
                                              STEP_DONE_BADGE_CLASS,
                                            )}
                                            strokeWidth={2}
                                            aria-hidden
                                          />
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
                                          <CircleCheck
                                            className={cn("h-3.5 w-3.5 shrink-0", STEP_DONE_BADGE_CLASS)}
                                            strokeWidth={2}
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
            <div
              className={cn("group/projects flex min-h-0 min-w-0 flex-col", !rail && "max-h-[min(50vh,22rem)]")}
              role="group"
              aria-label="Proyectos"
            >
              {rail ? (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div
                      className={railControlActiveClass("mx-auto")}
                      aria-hidden
                    >
                      <FolderOpen className="h-5 w-5 shrink-0 text-[var(--primary)]" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center" sideOffset={10}>
                    Proyectos ({sortedDashboardProjects.length})
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  aria-expanded={projectsNavExpanded}
                  aria-controls="dashboard-projects-nav-panel"
                  title="Proyectos"
                  onClick={() => setProjectsNavExpanded((open) => !open)}
                  className={cn(
                    "flex w-full shrink-0 items-center gap-2 rounded-[var(--radius-lg)] px-2 py-2 text-left",
                    "bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]",
                    "outline-none transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_20%,var(--sidebar))] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
                  )}
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">Proyectos</span>
                  <span className="shrink-0 tabular-nums text-[11px] text-[var(--muted-foreground)]">
                    {sortedDashboardProjects.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
                      projectsNavExpanded ? "rotate-180" : "rotate-0",
                    )}
                    aria-hidden
                  />
                </button>
              )}
              {rail || projectsNavExpanded ? (
                <div
                  id="dashboard-projects-nav-panel"
                  className={cn("mt-2 flex min-h-0 min-w-0 flex-col", rail ? "px-0" : "overflow-hidden px-1")}
                >
                  <div
                    className={cn(
                      "relative min-h-0 flex-1 overscroll-y-contain pb-1 [-webkit-overflow-scrolling:touch]",
                      rail
                        ? "scrollbar-rail flex flex-col items-center gap-1 overflow-y-auto overflow-x-visible py-0.5"
                        : "max-h-[min(42vh,18rem)] overflow-x-hidden overflow-y-auto px-0.5 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5",
                    )}
                    role="list"
                    aria-label="Lista de proyectos"
                  >
                    {projectsLoading ? (
                      <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">Cargando proyectos…</p>
                    ) : sortedDashboardProjects.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
                        {projectSearchQuery.trim() ? "Sin coincidencias" : "Aún no hay proyectos"}
                      </p>
                    ) : (
                      <div className="relative w-full">
                        {!rail ? (
                          <span
                            className="pointer-events-none absolute bottom-1 left-[0.8125rem] top-1 w-px bg-[color-mix(in_oklch,var(--sidebar-border)_92%,transparent)]"
                            aria-hidden
                          />
                        ) : null}
                        <ul
                          className={cn(
                            "relative m-0 list-none p-0",
                            rail ? "flex flex-col items-center gap-1" : "space-y-0.5 py-0.5",
                          )}
                        >
                          {sortedDashboardProjects.map((project) => (
                            <li
                              key={project.id}
                              className={cn("relative shrink-0", !rail && "pl-5 lg:pl-6")}
                            >
                              <CollapsedRailHint
                                rail={rail}
                                label={project.isFavorite ? `${project.name} · Favorito` : project.name}
                              >
                                <button
                                  type="button"
                                  role="listitem"
                                  title={project.name}
                                  onClick={() => handleOpenDashboardProject(project)}
                                  className={cn(
                                    "flex min-w-0 items-center font-medium transition-colors",
                                    rail
                                      ? railControlClass("mx-auto text-[var(--muted-foreground)]")
                                      : "mb-px w-full gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[color-mix(in_oklch,var(--muted-foreground)_96%,var(--sidebar-foreground))] last:mb-0 hover:bg-[color-mix(in_oklch,var(--sidebar-accent)_72%,transparent)] hover:text-[var(--sidebar-accent-foreground)]",
                                  )}
                                >
                                  {rail ? (
                                    <FolderOpen className="size-4 shrink-0" aria-hidden />
                                  ) : (
                                    <>
                                      <FolderOpen
                                        className="h-4 w-4 shrink-0 text-[color-mix(in_oklch,var(--muted-foreground)_92%,var(--sidebar-foreground))]"
                                        aria-hidden
                                      />
                                      <span className="min-w-0 flex-1 truncate leading-snug">{project.name}</span>
                                      {project.isFavorite ? (
                                        <Heart
                                          className="h-3.5 w-3.5 shrink-0 fill-[var(--primary)] text-[var(--primary)]"
                                          aria-hidden
                                        />
                                      ) : null}
                                    </>
                                  )}
                                </button>
                              </CollapsedRailHint>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </nav>
      </div>

      <div
        className={cn(
          "mt-auto w-full min-w-0 shrink-0 border-t border-[color-mix(in_oklch,var(--sidebar-border)_75%,var(--sidebar))] p-2",
          rail && "lg:relative lg:z-[1] lg:px-1.5",
        )}
      >
        <ThemeModeToggle compact={rail} />
        <details className="group relative w-full min-w-0">
          <summary
            aria-label={
              rail
                ? `Cuenta: ${getDisplayName(user)}, ${user?.email ?? ""}. Abrir menú`
                : undefined
            }
            className={cn(
              "flex w-full min-w-0 cursor-pointer list-none items-center gap-3 rounded-[var(--radius-lg)] px-2 py-2 marker:content-none [&::-webkit-details-marker]:hidden",
              rail
                ? "lg:justify-center lg:gap-0 lg:p-0 lg:hover:bg-transparent"
                : "hover:bg-[var(--sidebar-accent)]",
            )}
          >
            {rail ? (
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      railControlClass("text-xs font-semibold text-[var(--primary)]"),
                      "outline-none",
                    )}
                    aria-hidden
                  >
                    {getUserInitials(user)}
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
            <div className={cn("min-w-0 flex-1 text-left", rail && "lg:hidden")}>
              <p className="truncate text-sm font-medium text-[var(--sidebar-foreground)]">
                {getDisplayName(user)}
              </p>
              <p className="truncate text-xs text-[var(--muted-foreground)]">{user?.email || ""}</p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180",
                rail && "lg:hidden",
              )}
              aria-hidden
            />
          </summary>
          <div
            className={cn(
              "absolute z-[var(--z-popover)] min-w-[10.5rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--popover)] py-1 text-[var(--popover-foreground)] shadow-lg",
              rail
                ? "bottom-0 left-full right-auto mb-0 ml-2 max-lg:bottom-full max-lg:left-2 max-lg:right-2 max-lg:mb-1 max-lg:ml-0"
                : "bottom-full left-2 right-2 mb-1",
            )}
          >
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
