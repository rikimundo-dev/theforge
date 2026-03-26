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
  Trash2,
} from "lucide-react";
import WorkshopView from "./views/WorkshopView";
import LoginView from "./views/LoginView";
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
  const [theforgeModalTab, setTheForgeModalTab] = useState<"projects" | "repos">("projects");
  const [theforgeProjects, setTheForgeProjects] = useState<TheForgeProject[]>([]);
  const [theforgeAvailable, setTheForgeAvailable] = useState(false);
  const [theforgeLoading, setTheForgeLoading] = useState(false);
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-8">
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

      <Dialog open={showTheForgeModal} onOpenChange={setShowTheForgeModal}>
        <DialogContent size="lg" className="max-h-[80vh] flex flex-col">
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
        <header className="border-b border-[var(--border)] pb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[var(--primary)] flex items-center gap-2">
              <Flame className="w-8 h-8" />
              TheForge
            </h1>
            <p className="text-[var(--foreground-muted)] mt-1">
              Software Factory — Entrevista proactiva → MDD → Semáforo → Estimación
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={logout} className="shrink-0">
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
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm text-[var(--foreground-muted)] mb-1 sr-only">
                  Nombre del proyecto
                </label>
                <Input
                  ref={newProjectInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                  placeholder="Nombre del proyecto"
                  className="w-64"
                />
              </div>
              <Button onClick={createProject} disabled={loading || !newName.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Crear (proyecto nuevo)
              </Button>
              <Button variant="secondary" onClick={() => openTheForgeModal("projects")} disabled={loading}>
                Proyecto existente (TheForge)
              </Button>
              <Button variant="secondary" onClick={() => openTheForgeModal("repos")} disabled={loading}>
                Repositorio existente (TheForge)
              </Button>
              <Button variant="outline" onClick={loadProjects} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refrescar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[var(--primary)]" />
              Proyectos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {projects.length === 0 && !loading && (
              <EmptyState
                title="Aún no hay proyectos"
                description="Crea uno arriba o usa Refrescar si ya existen en el backend."
                icon={FolderGit2}
                action={{
                  label: "Crear primer proyecto",
                  icon: <Plus className="w-4 h-4" />,
                  onClick: () => newProjectInputRef.current?.focus(),
                }}
              />
            )}
            {projects.length > 0 && (
              <ul className="space-y-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Card
                      variant="bordered"
                      hoverable
                      className="cursor-pointer"
                      onClick={() => setWorkshopProject(p)}
                    >
                      <CardContent className="flex items-center gap-4 py-3 px-4">
                        <span className={`w-3 h-3 rounded-full shrink-0 ${statusDotColor[p.status]}`} title={p.status} />
                        <span className="font-medium flex-1 min-w-0">{p.name}</span>
                        <span className="text-sm text-[var(--foreground-muted)] shrink-0">
                          Precisión {p.precisionScore}%
                        </span>
                        <span className="text-sm text-[var(--foreground-muted)] shrink-0">
                          {new Date(p.createdAt).toLocaleDateString("es-MX")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => openDeleteConfirm(p, e)}
                          disabled={loading}
                          className="shrink-0 text-[var(--foreground-muted)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                          title="Borrar proyecto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <ChevronRight className="w-5 h-5 text-[var(--foreground-muted)] shrink-0" />
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
