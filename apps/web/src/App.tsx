/**
 * @fileoverview Raíz de la SPA The Forge: estado de sesión (JWT), lista de proyectos, login OTP y vista principal
 * **Workshop** (`WorkshopView`). Comunicación HTTP centralizada vía `apiClient`.
 *
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Flame,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import WorkshopView from "./views/WorkshopView";
import LoginView from "./views/LoginView";
import { McpSecretCard } from "./components/McpSecretCard";
import { apiFetch, clearAccessToken, getAccessToken, API_BASE } from "./utils/apiClient";
import {
  Button,
  Input,
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
  AlertDialogAction,
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
  theforgeProjectId?: string | null;
  createdAt: string;
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

const statusDotColor: Record<Status, string> = {
  ROJO: "bg-[var(--destructive)]",
  AMARILLO: "bg-[var(--warning)]",
  VERDE: "bg-[var(--success)]",
};

export default function App() {
  const [authed, setAuthed] = useState(() => !!getAccessToken());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [workshopProject, setWorkshopProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showTheForgeModal, setShowTheForgeModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [theforgeModalTab, setTheForgeModalTab] = useState<"projects" | "repos">("projects");
  const [theforgeProjects, setTheForgeProjects] = useState<TheForgeProject[]>([]);
  const [theforgeAvailable, setTheForgeAvailable] = useState(false);
  const [theforgeLoading, setTheForgeLoading] = useState(false);
  const [projectTypeFilter, setProjectTypeFilter] = useState<"all" | "NEW" | "LEGACY">("all");
  const newProjectInputRef = useRef<HTMLInputElement>(null);

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

  const filteredProjects = useMemo(
    () => (projectTypeFilter === "all" ? projects : projects.filter((p) => (p.projectType ?? "NEW") === projectTypeFilter)),
    [projects, projectTypeFilter],
  );

  async function loadProjects() {
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/projects`);
      const data = await r.json();
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), hasUxTeam: false, projectType: "NEW" }),
      });
      if (!r.ok) throw new Error("Error al crear proyecto");
      const created = (await r.json()) as Project;
      setNewName("");
      await loadProjects();
      setWorkshopProject(created);
    } finally {
      setLoading(false);
    }
  }

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

  function openDeleteConfirm(p: Project, e: React.MouseEvent) {
    e.stopPropagation();
    setProjectToDelete(p);
  }

  async function confirmDelete() {
    if (!projectToDelete) return;
    setLoading(true);
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectToDelete.id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Error al borrar");
      setProjectToDelete(null);
      await loadProjects();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!workshopProject) loadProjects();
  }, [workshopProject]);

  useEffect(() => {
    function onAuthExpired() {
      setAuthed(false);
      setWorkshopProject(null);
    }
    window.addEventListener("theforge:auth-expired", onAuthExpired);
    return () => window.removeEventListener("theforge:auth-expired", onAuthExpired);
  }, []);

  if (!authed) {
    return <LoginView onLoggedIn={() => setAuthed(true)} />;
  }

  function logout() {
    clearAccessToken();
    setAuthed(false);
    setWorkshopProject(null);
  }

  if (workshopProject) {
    return (
      <WorkshopView
        projectId={workshopProject.id}
        projectName={workshopProject.name}
        onBack={() => setWorkshopProject(null)}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)] px-4 py-6 sm:p-6 lg:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar proyecto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Borrar &quot;{projectToDelete?.name}&quot;? Se eliminarán sesiones y estimaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setProjectToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={loading}>
              {loading ? "Borrando…" : "Borrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajustes</DialogTitle>
            <DialogDescription>Configuración de tu cuenta y herramientas.</DialogDescription>
          </DialogHeader>
          <McpSecretCard />
        </DialogContent>
      </Dialog>

      <Dialog open={showTheForgeModal} onOpenChange={setShowTheForgeModal}>
        <DialogContent size="lg" className="max-h-[min(80vh,100dvh-2rem)] w-[calc(100vw-1.5rem)] sm:w-full flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Base de conocimientos (TheForge)</DialogTitle>
            <DialogDescription>
              Elige un proyecto (varios repos) o un repositorio individual como base.
            </DialogDescription>
          </DialogHeader>
          {!theforgeAvailable && !theforgeLoading && (
            <p className="text-sm text-[var(--foreground-muted)]">
              TheForge no está configurado o no está disponible. Configura THEFORGE_MCP_URL y MCP_AUTH_TOKEN en el backend.
            </p>
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
                              <FolderGit2 className="w-4 h-4 shrink-0 text-[var(--accent)]" />
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
                              <GitBranch className="w-4 h-4 shrink-0 text-[var(--accent)]" />
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

      <div className="max-w-4xl mx-auto space-y-6">
        <header className="border-b border-[var(--border)] pb-4 sm:pb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--primary)] flex items-center gap-2">
              <Flame className="w-8 h-8" />
              TheForge
            </h1>
            <p className="text-[var(--foreground-muted)] mt-1 text-sm sm:text-base">
              Software Factory — Entrevista proactiva → MDD → Semáforo → Estimación
            </p>
          </div>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="shrink-0 self-start sm:self-auto touch-manipulation min-h-[44px] sm:min-h-9 gap-2">
          <Settings className="w-4 h-4" />
          Ajustes
        </Button>
        <Button variant="outline" size="sm" onClick={logout} className="shrink-0 self-start sm:self-auto touch-manipulation min-h-[44px] sm:min-h-9 gap-2">
          <LogOut className="w-4 h-4" />
          Salir
        </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-[var(--primary)]" />
              Nuevo proyecto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="w-full sm:w-auto sm:min-w-[12rem] sm:max-w-md">
                <label className="block text-sm text-[var(--foreground-muted)] mb-1 sr-only">
                  Nombre del proyecto
                </label>
                <Input
                  ref={newProjectInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                  placeholder="Nombre del proyecto"
                  className="w-full min-h-[44px] sm:min-h-10"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap w-full sm:w-auto">
                <Button className="w-full sm:w-auto touch-manipulation min-h-[44px] sm:min-h-10" onClick={createProject} disabled={loading || !newName.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span className="hidden sm:inline">Crear (proyecto nuevo)</span>
                  <span className="sm:hidden">Crear nuevo</span>
                </Button>
                <Button variant="secondary" className="w-full sm:w-auto touch-manipulation min-h-[44px] sm:min-h-10 text-left sm:text-center whitespace-normal h-auto py-2.5 sm:py-2" onClick={() => openTheForgeModal("projects")} disabled={loading}>
                  <span className="sm:hidden">TheForge · proyecto</span>
                  <span className="hidden sm:inline">Proyecto existente (TheForge)</span>
                </Button>
                <Button variant="secondary" className="w-full sm:w-auto touch-manipulation min-h-[44px] sm:min-h-10 text-left sm:text-center whitespace-normal h-auto py-2.5 sm:py-2" onClick={() => openTheForgeModal("repos")} disabled={loading}>
                  <span className="sm:hidden">TheForge · repo</span>
                  <span className="hidden sm:inline">Repositorio existente (TheForge)</span>
                </Button>
                <Button variant="outline" className="w-full sm:w-auto touch-manipulation min-h-[44px] sm:min-h-10" onClick={loadProjects} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refrescar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[var(--primary)]" />
              Proyectos
            </CardTitle>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setProjectTypeFilter("all")}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  projectTypeFilter === "all"
                    ? "bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--accent)]/10"
                }`}
              >
                Todos ({projects.length})
              </button>
              <button
                onClick={() => setProjectTypeFilter("NEW")}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  projectTypeFilter === "NEW"
                    ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                    : "border-[var(--border)] text-[var(--foreground-muted)] hover:bg-emerald-500/10"
                }`}
              >
                <Sparkles className="w-3 h-3 inline mr-1" />
                Nuevos ({projects.filter((p) => (p.projectType ?? "NEW") === "NEW").length})
              </button>
              <button
                onClick={() => setProjectTypeFilter("LEGACY")}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  projectTypeFilter === "LEGACY"
                    ? "bg-amber-500/20 border-amber-500 text-amber-400"
                    : "border-[var(--border)] text-[var(--foreground-muted)] hover:bg-amber-500/10"
                }`}
              >
                <GitBranch className="w-3 h-3 inline mr-1" />
                Legacy ({projects.filter((p) => p.projectType === "LEGACY").length})
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {filteredProjects.length === 0 && !loading && (
              <EmptyState
                title={projects.length === 0 ? "Aún no hay proyectos" : "No hay proyectos de este tipo"}
                description={projects.length === 0 ? "Crea uno arriba o usa Refrescar si ya existen en el backend." : "Cambia el filtro o crea un proyecto nuevo."}
                icon={FolderGit2}
                action={projects.length === 0 ? {
                  label: "Crear primer proyecto",
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => newProjectInputRef.current?.focus(),
                } : undefined}
              />
            )}
            {filteredProjects.length > 0 && (
              <ul className="space-y-3">
                {filteredProjects.map((p) => (
                  <li key={p.id}>
                    <Card
                      variant="bordered"
                      hoverable
                      className="cursor-pointer"
                      onClick={() => setWorkshopProject(p)}
                    >
                      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 py-3 px-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={`w-3 h-3 rounded-full shrink-0 ${statusDotColor[p.status]}`} title={p.status} />
                          <span className="font-medium min-w-0 flex-1">{p.name}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                            (p.projectType ?? "NEW") === "NEW"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}>
                            {(p.projectType ?? "NEW") === "NEW" ? (
                              <><Sparkles className="w-2.5 h-2.5" /> Nuevo</>
                            ) : (
                              <><GitBranch className="w-2.5 h-2.5" /> Legacy</>
                            )}
                          </span>
                          <ChevronRight className="w-5 h-5 text-[var(--foreground-muted)] shrink-0 sm:hidden" aria-hidden />
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:justify-end sm:shrink-0 flex-wrap sm:flex-nowrap">
                          <span className="text-sm text-[var(--foreground-muted)]">
                            Precisión {p.precisionScore}%
                          </span>
                          <span className="text-sm text-[var(--foreground-muted)]">
                            {new Date(p.createdAt).toLocaleDateString("es-MX")}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => openDeleteConfirm(p, e)}
                            disabled={loading}
                            className="shrink-0 touch-manipulation min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-[var(--foreground-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                            title="Borrar proyecto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <ChevronRight className="w-5 h-5 text-[var(--foreground-muted)] shrink-0 hidden sm:block" aria-hidden />
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
