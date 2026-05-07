/**
 * @fileoverview Left navigation: brand, collapsible rail, project search, nav,
 * theme controls, and user footer. Collapse state is controlled by parent (persisted).
 * With an open workshop project, shows deliverables under the project name and syncs
 * the active document tab via `useWorkshopStore`.
 */
import { useCallback, useMemo, type MouseEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  FolderOpen,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import { Input } from "./ui/Input";
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

function ThemeModeToggle({ compact }: { compact: boolean }) {
  const { preference, setPreference } = useTheme();

  const item = (value: ThemePreference, label: string, icon: ReactNode) => (
    <button
      type="button"
      key={value}
      onClick={() => setPreference(value)}
      title={label}
      aria-label={label}
      aria-pressed={preference === value}
      className={cn(
        "flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-colors",
        compact ? "w-full py-2.5" : "flex-1 flex-col gap-0.5 py-2 text-[11px]",
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

  return (
    <div
      className={cn(
        "mb-3 rounded-[var(--radius-lg)] bg-[color-mix(in_oklch,var(--sidebar-foreground)_6%,var(--sidebar))] p-1 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--sidebar-foreground)_8%,transparent)]",
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
}: DashboardSidebarProps) {
  const rail = collapsed;

  const handleScrollToProjects = useCallback(() => {
    document.getElementById("dashboard-projects")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <aside
      className={cn(
        "flex w-full shrink-0 flex-col border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)] sm:border-b-0 sm:border-r sm:min-h-0 sm:self-stretch sm:sticky sm:top-0 sm:transition-[width] sm:duration-200 sm:ease-out",
        inWorkshop && "sm:overflow-hidden",
        rail ? "sm:w-[4.5rem] sm:min-w-[4.5rem]" : "sm:w-[272px]",
      )}
      aria-label="Navegación principal"
    >
      <div
        className={cn(
          "flex flex-col sm:min-h-0 sm:flex-1",
          inWorkshop ? "gap-4 sm:flex sm:flex-col sm:overflow-hidden" : "gap-6 sm:overflow-y-auto",
          rail ? "p-4 sm:px-2 sm:py-4" : "p-4",
        )}
      >
        <div
          className={cn(
            "flex w-full gap-2",
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
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={rail ? "Expandir barra lateral" : "Contraer barra lateral"}
            aria-expanded={!rail}
            className={cn(
              "hidden shrink-0 rounded-[var(--radius-md)] p-2 text-[var(--sidebar-foreground)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] sm:flex",
              rail && "sm:w-10 sm:shrink-0 sm:items-center sm:justify-center sm:p-2",
            )}
          >
            <ChevronLeft className={cn("h-5 w-5", rail && "hidden")} aria-hidden />
            <ChevronRight className={cn("hidden h-5 w-5", rail && "block")} aria-hidden />
          </button>
        </div>

        {!inWorkshop ? (
          <div className={cn("relative", rail && "sm:hidden")}>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <Input
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
          <button
            type="button"
            title="Expandir barra para buscar"
            aria-label="Expandir barra lateral para buscar proyectos"
            onClick={onToggleCollapsed}
            className="flex w-full items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_oklch,var(--sidebar-border)_65%,var(--sidebar))] bg-[color-mix(in_oklch,var(--sidebar-foreground)_5%,var(--sidebar))] py-2.5 text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        <nav
          className={cn("flex min-w-0 flex-col gap-1", inWorkshop && "min-h-0 flex-1")}
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
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:min-h-0">
              <button
                type="button"
                onClick={onExitWorkshop}
                title="Volver al panel de proyectos"
                className={cn(
                  "flex w-full shrink-0 items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 text-left text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
                  rail && "sm:justify-center sm:px-0",
                )}
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                <span className={cn("truncate", rail && "sm:hidden")}>Panel de proyectos</span>
              </button>

              <details open className="group/ws flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <summary
                  className={cn(
                    "flex shrink-0 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-lg)] px-2 py-2 marker:content-none [&::-webkit-details-marker]:hidden",
                    "bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] text-[var(--sidebar-foreground)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]",
                    rail && "sm:justify-center sm:px-0",
                  )}
                  title={workshopProject.name}
                >
                  <FolderOpen className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
                  <span className={cn("min-w-0 flex-1 truncate text-left text-sm font-medium", rail && "sm:hidden")}>
                    {workshopProject.name}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open/ws:rotate-180",
                      rail && "sm:hidden",
                    )}
                    aria-hidden
                  />
                </summary>
                <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-1">
                  <p
                    className={cn(
                      "mb-1.5 shrink-0 px-1 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]",
                      rail && "sm:hidden",
                    )}
                  >
                    Pasos del flujo
                  </p>
                  <div
                    className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-0.5 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable]"
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
                                <button
                                  type="button"
                                  role="listitem"
                                  title={`${item.title}${done ? " — con contenido" : ""}`}
                                  aria-current={isCurrent ? "page" : undefined}
                                  onClick={() => setWorkshopActiveDocPanel(item.id)}
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
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            </div>
          ) : (
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
          )}
        </nav>
      </div>

      <div
        className={cn(
          "mt-auto border-t border-[color-mix(in_oklch,var(--sidebar-border)_75%,var(--sidebar))] p-3",
          rail && "sm:px-2",
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
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--sidebar-foreground)_9%,var(--sidebar))] text-xs font-semibold text-[var(--primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-foreground)_12%,transparent)]"
              aria-hidden
            >
              {getUserInitials(user)}
            </div>
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
  );
}
