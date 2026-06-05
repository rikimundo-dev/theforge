/**
 * @fileoverview Raíz de la SPA The Forge: estado de sesión (JWT), lista de proyectos, login OTP y vista principal
 * **Workshop** (`WorkshopView`). Comunicación HTTP centralizada vía `apiClient`.
 *
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { selectWorkshopAgentsBusy, useWorkshopStore } from "./store/workshopStore";
import {
  AlertTriangle,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Heart,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import WorkshopView from "./views/WorkshopView";
import LoginView from "./views/LoginView";
import SetupView from "./views/SetupView";
import SettingsView from "./views/SettingsView";
import UsersView from "./views/UsersView";
import { CreateProjectWizardDialog } from "./components/CreateProjectWizardDialog";
import { ProjectFolderTile } from "./components/ProjectFolderTile";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { DashboardPanelHeader } from "./components/DashboardPanelHeader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  apiFetch,
  clearAccessToken,
  getAccessToken,
  API_BASE,
  getStoredUser,
  refreshStoredUserFromApi,
} from "./utils/apiClient";
import { cn } from "./lib/utils";
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  EmptyState,
} from "./components/ui";
type Status = "ROJO" | "AMARILLO" | "VERDE";

interface Project {
  id: string;
  name: string;
  status: Status;
  precisionScore: number;
  hasUxTeam: boolean;
  projectType?: "NEW" | "LEGACY";
  visibility?: "PRIVATE" | "SHARED";
  theforgeProjectId?: string | null;
  createdAt: string;
  isFavorite?: boolean;
}

interface TheForgeProjectRoot {
  id: string;
  name?: string;
  branch?: string;
}

interface TheForgeProject {
  id: string;
  name: string;
  roots?: TheForgeProjectRoot[];
  rootPath?: string;
  branch?: string;
}

interface TheForgeRepository {
  id: string;
  name: string;
  branch?: string;
}

const SIDEBAR_COLLAPSED_KEY = "theforge-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getAccessToken());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [workshopProject, setWorkshopProject] = useState<Project | null>(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Project[] | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [showTheForgeModal, setShowTheForgeModal] = useState(false);
  const [usersViewOpen, setUsersViewOpen] = useState(false);
  const [settingsViewOpen, setSettingsViewOpen] = useState(false);
  const [showIaCost, setShowIaCost] = useState(() => localStorage.getItem("theforge_show_ia_cost") !== "0");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [theforgeModalTab, setTheForgeModalTab] = useState<"projects" | "repos">("projects");
  const [theforgeProjects, setTheForgeProjects] = useState<TheForgeProject[]>([]);
  const [theforgeAvailable, setTheForgeAvailable] = useState(false);
  const [theforgeLoading, setTheForgeLoading] = useState(false);
  const [projectTypeFilter, setProjectTypeFilter] = useState<
    "all" | "NEW" | "LEGACY" | "favorites"
  >("all");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);

  const handleToggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const theforgeRepositories = useMemo((): TheForgeRepository[] => {
    const byId = new Map<string, TheForgeRepository>();
    for (const p of theforgeProjects) {
      if (p.roots?.length) {
        for (const r of p.roots) {
          if (!byId.has(r.id))
            byId.set(r.id, { id: r.id, name: r.name ?? r.id, branch: r.branch });
        }
      } else {
        byId.set(p.id, { id: p.id, name: p.name, branch: p.branch });
      }
    }
    return Array.from(byId.values());
  }, [theforgeProjects]);

  const projectList = useMemo(
    () => (Array.isArray(projects) ? projects : []),
    [projects],
  );

  const favoriteProjectCount = useMemo(
    () => projectList.filter((p) => p.isFavorite).length,
    [projectList],
  );

  const filteredProjects = useMemo(() => {
    if (projectTypeFilter === "all") return projectList;
    if (projectTypeFilter === "favorites") {
      return projectList.filter((p) => p.isFavorite);
    }
    return projectList.filter((p) => (p.projectType ?? "NEW") === projectTypeFilter);
  }, [projectList, projectTypeFilter]);

  const displayedProjects = useMemo(() => {
    const q = projectSearchQuery.trim().toLowerCase();
    if (!q) return filteredProjects;
    return filteredProjects.filter((p) => p.name.toLowerCase().includes(q));
  }, [filteredProjects, projectSearchQuery]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/projects`);
      const raw = await r.text();
      let data: unknown = null;
      if (raw) {
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          data = null;
        }
      }
      if (!r.ok || !Array.isArray(data)) {
        setProjects([]);
        return;
      }
      setProjects(data as Project[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleToggleFavorite = useCallback(async (id: string) => {
    try {
      const r = await apiFetch(`${API_BASE}/projects/${id}/favorite`, {
        method: "POST",
      });
      if (!r.ok) return;
      const result = (await r.json()) as { favorited: boolean };
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isFavorite: result.favorited } : p)),
      );
    } catch {
      // silencioso
    }
  }, []);

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nombre vacío");
      setLoading(true);
      try {
        const r = await apiFetch(`${API_BASE}/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed, hasUxTeam: false, projectType: "NEW" }),
        });
        if (!r.ok) throw new Error("Error al crear proyecto");
        const created = (await r.json()) as Project;
        await loadProjects();
        setWorkshopProject(created);
      } finally {
        setLoading(false);
      }
    },
    [loadProjects],
  );

  async function loadTheForgeProjects() {
    setTheForgeLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/theforge/projects`);
      const data = (await r.json()) as { projects: TheForgeProject[]; theforgeAvailable: boolean };
      setTheForgeProjects(data.projects ?? []);
      setTheForgeAvailable(data.theforgeAvailable ?? false);
    } finally {
      setTheForgeLoading(false);
    }
  }

  function openTheForgeModal(tab: "projects" | "repos" = "projects") {
    setTheForgeModalTab(tab);
    setShowTheForgeModal(true);
    loadTheForgeProjects();
  }

  async function createLegacyProject(source: { id: string; name: string }) {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: source.name,
          hasUxTeam: false,
          projectType: "LEGACY",
          theforgeProjectId: source.id,
        }),
      });
      if (!r.ok) throw new Error("Error al crear proyecto legacy");
      const created = (await r.json()) as Project;
      setShowTheForgeModal(false);
      await loadProjects();
      setWorkshopProject(created);
    } finally {
      setLoading(false);
    }
  }

  const handleToggleProjectSelect = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
  }, []);

  const handleClearProjectSelection = useCallback(() => {
    setSelectedProjectIds([]);
  }, []);

  const openBulkDeleteConfirm = useCallback(() => {
    const targets = displayedProjects.filter((p) => selectedProjectIds.includes(p.id));
    if (targets.length === 0) return;
    setBulkDeleteError(null);
    setBulkDeleteTargets(targets);
    setBulkDeleteDialogOpen(true);
  }, [displayedProjects, selectedProjectIds]);

  const confirmBulkDelete = useCallback(async () => {
    if (!bulkDeleteTargets?.length) return;
    setBulkDeleteError(null);
    setLoading(true);
    try {
      for (const p of bulkDeleteTargets) {
        const r = await apiFetch(`${API_BASE}/projects/${p.id}`, {
          method: "DELETE",
        });
        if (!r.ok) {
          const msg =
            r.status === 403
              ? "No tienes permiso para borrar proyectos."
              : r.status === 404
                ? "Proyecto no encontrado."
                : "Error al borrar";
          throw new Error(msg);
        }
      }
      setBulkDeleteDialogOpen(false);
      setBulkDeleteTargets(null);
      setSelectedProjectIds([]);
      await loadProjects();
    } catch (err) {
      setBulkDeleteError(err instanceof Error ? err.message : "Error al borrar");
    } finally {
      setLoading(false);
    }
  }, [bulkDeleteTargets, loadProjects]);

  useEffect(() => {
    const allowed = new Set(displayedProjects.map((p) => p.id));
    setSelectedProjectIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [displayedProjects]);

  useEffect(() => {
    if (!authed) return;
    void refreshStoredUserFromApi();
  }, [authed]);

  useEffect(() => {
    if (!authed || workshopProject) return;
    void loadProjects();
  }, [authed, workshopProject, loadProjects]);

  // Check if first-run setup is needed (no users exist)
  useEffect(() => {
    if (authed) return;
    fetch(`${API_BASE}/auth/has-users`)
      .then((r) => r.json())
      .then((data: { hasUsers?: boolean }) => {
        setNeedsSetup(data.hasUsers === false);
      })
      .catch(() => setNeedsSetup(false));
  }, [authed]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, "").trim();
    if (hash === "settings") {
      setSettingsViewOpen(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    function onAuthExpired() {
      setAuthed(false);
      setWorkshopProject(null);
      setUsersViewOpen(false);
      setSettingsViewOpen(false);
    }
    window.addEventListener("theforge:auth-expired", onAuthExpired);
    return () => window.removeEventListener("theforge:auth-expired", onAuthExpired);
  }, []);

  const openSettings = useCallback(() => {
    setUsersViewOpen(false);
    setSettingsViewOpen(true);
  }, []);

  const openUsers = useCallback(() => {
    setSettingsViewOpen(false);
    setUsersViewOpen(true);
  }, []);

  const handleExitWorkshop = useCallback(() => {
    const store = useWorkshopStore.getState();
    if (selectWorkshopAgentsBusy(store)) return;
    store.reset();
    store.setWorkshopActiveDocPanel("mdd");
    setWorkshopProject(null);
    setUsersViewOpen(false);
    setSettingsViewOpen(false);
  }, []);

  const closePanelViews = useCallback(() => {
    setUsersViewOpen(false);
    setSettingsViewOpen(false);
  }, []);

  if (!authed) {
    if (needsSetup === null) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-[var(--background)] p-6 text-[var(--foreground)]">
          <p className="text-sm text-[var(--foreground-muted)]">Cargando...</p>
        </div>
      );
    }
    if (needsSetup) {
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <SetupView onComplete={() => setNeedsSetup(false)} />
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <LoginView onLoggedIn={() => window.location.reload()} />
      </div>
    );
  }

  function logout() {
    clearAccessToken();
    setAuthed(false);
    setWorkshopProject(null);
    setUsersViewOpen(false);
    setSettingsViewOpen(false);
    setProjects([]);
    setProjectSearchQuery("");
  }

  const userRole = getStoredUser()?.role;
  const isAdmin = userRole === "admin" || userRole === "super_admin";

  const settingsPanel = settingsViewOpen ? (
    <SettingsView
      showIaCost={showIaCost}
      onToggleIaCost={() => {
        const next = !showIaCost;
        localStorage.setItem("theforge_show_ia_cost", next ? "1" : "0");
        setShowIaCost(next);
      }}
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <ErrorBoundary>
      <CreateProjectWizardDialog
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
        loading={loading}
        onCreateNew={createProject}
        onContinueLegacy={openTheForgeModal}
      />

      <AlertDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !loading) {
            setBulkDeleteDialogOpen(false);
            setBulkDeleteTargets(null);
            setBulkDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteTargets && bulkDeleteTargets.length > 1 ? "Borrar proyectos" : "Borrar proyecto"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán sesiones y estimaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
            {bulkDeleteError ? (
              <p
                role="alert"
                className="rounded-md border border-[color-mix(in_oklch,var(--destructive)_42%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))] px-3 py-2 text-sm text-[var(--destructive)]"
              >
                {bulkDeleteError}
              </p>
            ) : null}
            {bulkDeleteTargets && bulkDeleteTargets.length > 0 ? (
              <ul className="max-h-40 list-inside list-disc overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--muted)]/30 py-2 pl-4 pr-2 text-sm text-[var(--foreground)]">
                {bulkDeleteTargets.slice(0, 12).map((p) => (
                  <li key={p.id} className="truncate">
                    {p.name}
                  </li>
                ))}
                {bulkDeleteTargets.length > 12 ? (
                  <li className="list-none text-[var(--foreground-muted)]">
                    …y {bulkDeleteTargets.length - 12} más
                  </li>
                ) : null}
              </ul>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              disabled={loading}
              onClick={() => {
                setBulkDeleteDialogOpen(false);
                setBulkDeleteTargets(null);
                setBulkDeleteError(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={loading}
              onClick={() => void confirmBulkDelete()}
            >
              {loading ? "Borrando…" : bulkDeleteTargets && bulkDeleteTargets.length > 1 ? `Borrar (${bulkDeleteTargets.length})` : "Borrar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showTheForgeModal} onOpenChange={setShowTheForgeModal}>
        <DialogContent size="lg" className="max-h-[min(80vh,100dvh-2rem)] w-[calc(100vw-1.5rem)] sm:w-full flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Base de conocimientos (TheForge)</DialogTitle>
            <DialogDescription>
              Elige un proyecto (varios repos) o un repositorio individual como base.
            </DialogDescription>
          </DialogHeader>
          {!theforgeAvailable && !theforgeLoading && (
            <div
              role="alert"
              className="rounded-[var(--radius-md)] border border-[color-mix(in_oklch,var(--destructive)_42%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_14%,var(--card))] p-4 shadow-sm"
            >
              <div className="flex gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))]"
                  aria-hidden
                />
                <div className="min-w-0 space-y-3 text-sm">
                  <p className="font-semibold leading-snug text-[var(--foreground)]">
                    TheForge no está configurado o no está disponible.
                  </p>
                  <p className="leading-relaxed text-[var(--foreground-muted)]">
                    Configura estas variables en el backend:
                  </p>
                  <ul className="flex flex-col gap-2 font-mono text-xs text-[var(--foreground)]">
                    <li className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_55%,var(--card))] px-3 py-2">
                      THEFORGE_MCP_URL
                    </li>
                    <li className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_55%,var(--card))] px-3 py-2">
                      MCP_AUTH_TOKEN
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          {theforgeLoading && (
            <div className="flex items-center gap-2 text-[var(--foreground-muted)] py-6">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando proyectos y repositorios…
            </div>
          )}
          {theforgeAvailable && !theforgeLoading && (
            <>
              <div className="flex gap-2 mb-3 border-b border-[var(--border)] pb-2">
                <Button
                  variant={theforgeModalTab === "projects" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheForgeModalTab("projects")}
                >
                  Proyectos
                </Button>
                <Button
                  variant={theforgeModalTab === "repos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheForgeModalTab("repos")}
                >
                  Repositorios
                </Button>
              </div>
              {theforgeModalTab === "projects" && (
                <>
                  {theforgeProjects.length === 0 ? (
                    <p className="text-sm text-[var(--foreground-muted)]">No hay proyectos indexados en TheForge.</p>
                  ) : (
                    <ul className="space-y-2 overflow-y-auto flex-1 min-h-0">
                      {theforgeProjects.map((rp) => (
                        <li key={rp.id}>
                          <Button
                            variant="outline"
                            className="w-full justify-start h-auto py-3 px-4 flex flex-col gap-1"
                            onClick={() => createLegacyProject(rp)}
                            disabled={loading}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <FolderGit2 className="w-4 h-4 shrink-0 text-[var(--primary)]" />
                              <span className="font-medium truncate">{rp.name}</span>
                              {rp.roots?.length != null && rp.roots.length > 0 && (
                                <Badge variant="secondary" className="shrink-0 text-xs">
                                  {rp.roots.length} repo(s)
                                </Badge>
                              )}
                              {rp.branch != null && rp.branch !== "" && !rp.roots?.length && (
                                <Badge variant="outline" className="shrink-0 text-xs">
                                  rama: {rp.branch}
                                </Badge>
                              )}
                            </div>
                            {rp.rootPath && (
                              <span className="text-xs text-[var(--foreground-muted)] truncate pl-6">{rp.rootPath}</span>
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {theforgeModalTab === "repos" && (
                <>
                  {theforgeRepositories.length === 0 ? (
                    <p className="text-sm text-[var(--foreground-muted)]">No hay repositorios (derivados de los proyectos indexados).</p>
                  ) : (
                    <ul className="space-y-2 overflow-y-auto flex-1 min-h-0">
                      {theforgeRepositories.map((repo) => (
                        <li key={repo.id}>
                          <Button
                            variant="outline"
                            className="w-full justify-start h-auto py-3 px-4 flex flex-col gap-1"
                            onClick={() => createLegacyProject(repo)}
                            disabled={loading}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <GitBranch className="w-4 h-4 shrink-0 text-[var(--primary)]" />
                              <span className="font-medium truncate">{repo.name}</span>
                              {repo.branch != null && repo.branch !== "" && (
                                <Badge variant="outline" className="shrink-0 text-xs">
                                  rama: {repo.branch}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-[var(--foreground-muted)] truncate pl-6 font-mono">{repo.id}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {workshopProject ? (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:flex-row">
          <DashboardSidebar
            projectSearchQuery={projectSearchQuery}
            onProjectSearchChange={setProjectSearchQuery}
            user={getStoredUser()}
            onLogout={logout}
            onOpenSettings={openSettings}
            onOpenUsers={openUsers}
            canManageUsers={isAdmin}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={handleToggleSidebarCollapsed}
            workshopProject={{ id: workshopProject.id, name: workshopProject.name }}
            onExitWorkshop={handleExitWorkshop}
            onBeforeNavigateToProjects={closePanelViews}
            onBeforeNavigateToWorkshopDoc={closePanelViews}
          />
          <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden">
            {settingsViewOpen ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {settingsPanel}
              </div>
            ) : usersViewOpen && isAdmin ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <UsersView />
              </div>
            ) : (
              <WorkshopView
                projectId={workshopProject.id}
                projectName={workshopProject.name}
                onBack={handleExitWorkshop}
                onOpenSettings={openSettings}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] lg:flex-row">
          <DashboardSidebar
            projectSearchQuery={projectSearchQuery}
            onProjectSearchChange={setProjectSearchQuery}
            dashboardProjects={displayedProjects.map((p) => ({
              id: p.id,
              name: p.name,
              isFavorite: p.isFavorite,
            }))}
            projectsLoading={loading}
            onOpenProject={(item) => {
              const project = projectList.find((p) => p.id === item.id);
              if (project) {
                closePanelViews();
                setWorkshopProject(project);
              }
            }}
            user={getStoredUser()}
            onLogout={logout}
            onOpenSettings={openSettings}
            onOpenUsers={openUsers}
            canManageUsers={isAdmin}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={handleToggleSidebarCollapsed}
            onBeforeNavigateToProjects={closePanelViews}
          />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {settingsViewOpen ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{settingsPanel}</div>
        ) : usersViewOpen && isAdmin ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <UsersView />
          </div>
        ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[min(100%,88rem)] space-y-6 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
        <DashboardPanelHeader
          loading={loading}
          onCreateProject={() => setShowCreateWizard(true)}
          onRefresh={() => void loadProjects()}
        />

        <Card id="dashboard-projects">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-h-9 min-w-0 w-full shrink-0 items-center sm:max-w-xl sm:flex-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <FolderOpen className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
                Proyectos
              </CardTitle>
            </div>
            <div
              className="flex w-full shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Filtrar proyectos"
            >
              <button
                type="button"
                role="tab"
                aria-selected={projectTypeFilter === "all"}
                onClick={() => setProjectTypeFilter("all")}
                className={`shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-colors min-h-[44px] sm:min-h-9 sm:py-1.5 ${
                  projectTypeFilter === "all"
                    ? "border-[var(--primary)] bg-[var(--primary)]/18 text-[var(--primary)]"
                    : "border-[var(--border)] bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                Todos ({projectList.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={projectTypeFilter === "favorites"}
                onClick={() => setProjectTypeFilter("favorites")}
                className={`shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-colors min-h-[44px] sm:min-h-9 sm:py-1.5 ${
                  projectTypeFilter === "favorites"
                    ? "border-rose-500 bg-rose-500/20 text-rose-700 dark:text-rose-300"
                    : "border-[var(--border)] bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Heart
                  className={cn(
                    "mr-1 inline h-3 w-3 align-text-bottom",
                    projectTypeFilter === "favorites" && "fill-current",
                  )}
                  aria-hidden
                />
                Favoritos ({favoriteProjectCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={projectTypeFilter === "NEW"}
                onClick={() => setProjectTypeFilter("NEW")}
                className={`shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-colors min-h-[44px] sm:min-h-9 sm:py-1.5 ${
                  projectTypeFilter === "NEW"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "border-[var(--border)] bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Sparkles className="mr-1 inline h-3 w-3 align-text-bottom" aria-hidden />
                Nuevos ({projectList.filter((q) => (q.projectType ?? "NEW") === "NEW").length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={projectTypeFilter === "LEGACY"}
                onClick={() => setProjectTypeFilter("LEGACY")}
                className={`shrink-0 touch-manipulation whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition-colors min-h-[44px] sm:min-h-9 sm:py-1.5 ${
                  projectTypeFilter === "LEGACY"
                    ? "border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-300"
                    : "border-[var(--border)] bg-transparent text-[var(--foreground-muted)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <GitBranch className="mr-1 inline h-3 w-3 align-text-bottom" aria-hidden />
                Legacy ({projectList.filter((q) => q.projectType === "LEGACY").length})
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {displayedProjects.length === 0 && !loading && (
              <EmptyState
                title={
                  projectList.length === 0
                    ? "Aún no hay proyectos"
                    : projectSearchQuery.trim()
                      ? "Sin coincidencias"
                      : projectTypeFilter === "favorites"
                        ? "Sin proyectos favoritos"
                        : "No hay proyectos de este tipo"
                }
                description={
                  projectList.length === 0
                    ? "Usa «Crear nuevo proyecto» para el asistente, o Refrescar si el backend ya tiene datos."
                    : projectSearchQuery.trim()
                      ? "Prueba otras palabras o borra el buscador del panel lateral."
                      : projectTypeFilter === "favorites"
                        ? "Marca el corazón en una carpeta para añadirla a favoritos."
                        : "Cambia el filtro o crea un proyecto nuevo desde el encabezado."
                }
                icon={FolderGit2}
                action={projectList.length === 0 ? {
                  label: "Crear primer proyecto",
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => setShowCreateWizard(true),
                } : undefined}
              />
            )}
            {displayedProjects.length > 0 && (
              <ul
                className="grid list-none gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                aria-label="Carpetas de proyectos"
              >
                {displayedProjects.map((p) => (
                  <li key={p.id} className="min-h-0">
<ProjectFolderTile
    id={p.id}
    name={p.name}
    status={p.status}
    precisionScore={p.precisionScore}
    projectType={p.projectType}
    visibility={p.visibility}
    selected={selectedProjectIds.includes(p.id)}
    selectable={isAdmin}
    isFavorite={p.isFavorite}
    onToggleFavorite={handleToggleFavorite}
    onOpen={() => setWorkshopProject(p)}
    onToggleSelect={() => handleToggleProjectSelect(p.id)}
/>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {isAdmin && selectedProjectIds.length > 0 ? (
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
            role="presentation"
          >
            <div
              role="toolbar"
              aria-label="Acciones para carpetas seleccionadas"
              className="pointer-events-auto flex max-w-lg flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_92%,black)] px-4 py-3 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:px-5"
            >
              <p className="text-center text-sm font-medium text-[var(--foreground)] sm:text-left">
                <span className="tabular-nums text-[var(--primary)]">{selectedProjectIds.length}</span>
                {" "}
                {selectedProjectIds.length === 1 ? "carpeta seleccionada" : "carpetas seleccionadas"}
              </p>
              <div className="flex flex-1 flex-wrap items-center justify-center gap-2 sm:justify-end">
                <Button type="button" variant="outline" size="sm" onClick={handleClearProjectSelection} disabled={loading}>
                  Quitar selección
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={openBulkDeleteConfirm}
                  disabled={loading}
                  className="touch-manipulation"
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                  Borrar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        </div>
        </div>
        )}
      </main>
        </div>
      )}
      </div>
    </ErrorBoundary>
    </div>
  );
}
