import { useEffect, useRef, useState } from "react";
import {
  Flame,
  FolderGit2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import WorkshopView from "./views/WorkshopView";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

type Status = "ROJO" | "AMARILLO" | "VERDE";

interface Project {
  id: string;
  name: string;
  status: Status;
  precisionScore: number;
  hasUxTeam: boolean;
  createdAt: string;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [workshopProject, setWorkshopProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const newProjectInputRef = useRef<HTMLInputElement>(null);

  async function loadProjects() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/projects`);
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
      await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), hasUxTeam: false }),
      });
      setNewName("");
      await loadProjects();
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
      const r = await fetch(`${API_BASE}/projects/${projectToDelete.id}`, {
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-brand-500/30 selection:text-brand-200">
      {projectToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setProjectToDelete(null)}
        >
          <div
            className="glass-card bg-zinc-900/90 rounded-3xl p-8 shadow-2xl max-w-md w-full border-white/5 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/10 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white">Borrar Proyecto</h2>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed mb-8">
              ¿Estás seguro de que deseas eliminar <span className="text-white font-bold">&quot;{projectToDelete.name}&quot;</span>? Esta acción es irreversible y se perderán todos los documentos generados.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-bold transition-all border border-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold shadow-lg shadow-red-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto space-y-12 py-16 px-6">
        <header className="space-y-4 animate-fade-in relative">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-brand-500/10 blur-[100px] rounded-full" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-brand-500/10 rounded-2xl shadow-[0_0_20px_rgba(17,141,230,0.1)]">
              <Flame className="w-10 h-10 text-brand-400 animate-pulse-subtle" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-2">
                The Forge
              </h1>
              <p className="text-sm font-bold text-zinc-500 uppercase tracking-[0.2em] mt-1">
                Software Engineering Factory Pro
              </p>
            </div>
          </div>
          <p className="text-zinc-400 max-w-2xl text-lg leading-relaxed border-l-2 border-brand-500/30 pl-6 py-2">
            Entrevista proactiva impulsada por IA, generación de <span className="text-brand-400 font-bold">MDD</span>, validación por semáforo de precisión y motores de estimación económica en tiempo real.
          </p>
        </header>

        <div className="grid lg:grid-cols-[1fr_2fr] gap-12">
          <section className="space-y-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="glass-panel rounded-3xl p-8 border-white/5 space-y-6">
              <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-400" />
                Nueva Iniciativa
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">
                    Identificador del Proyecto
                  </label>
                  <input
                    ref={newProjectInputRef}
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createProject()}
                    placeholder="Ej. Sistema de Pagos 2.0"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-zinc-100 placeholder:text-zinc-600 focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={createProject}
                    disabled={loading || !newName.trim()}
                    className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-30 text-white font-bold py-4 rounded-2xl shadow-xl shadow-brand-500/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Crear Proyecto
                      </>
                    )}
                  </button>
                  <button
                    onClick={loadProjects}
                    disabled={loading}
                    className="w-full bg-white/5 hover:bg-white/10 text-zinc-400 font-bold py-3 rounded-2xl border border-white/5 transition-all text-sm inline-flex items-center justify-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar Proyectos
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <h2 className="text-xs font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-2">
              <FolderGit2 className="w-4 h-4 text-brand-400" />
              Proyectos Registrados
            </h2>

            {projects.length === 0 && !loading ? (
              <div className="glass-panel border-white/5 rounded-3xl p-16 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                  <FolderGit2 className="w-10 h-10 text-zinc-600" />
                </div>
                <p className="text-xl font-bold text-zinc-300">Vacío Operativo</p>
                <p className="text-zinc-500 mt-2 max-w-[240px]">
                  No se detectan proyectos activos. Comienza creando uno nuevo en el panel lateral.
                </p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {projects.map((p, idx) => (
                  <div
                    key={p.id}
                    onClick={() => setWorkshopProject(p)}
                    className="group glass-card rounded-3xl p-6 border-white/5 cursor-pointer hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-500/5 transition-all duration-300 animate-fade-in"
                    style={{ animationDelay: `${0.1 + idx * 0.05}s` }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${p.status === 'VERDE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          p.status === 'AMARILLO' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-red-500/10 text-red-500 border border-red-500/20'
                          }`}
                      >
                        {p.status}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => openDeleteConfirm(p, e)}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-brand-400 transition-colors line-clamp-1 mb-6">
                      {p.name}
                    </h3>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Precisión</span>
                        <span className="text-sm font-bold text-zinc-300 font-mono">{p.precisionScore}%</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-tighter">Creado</span>
                        <span className="text-sm font-bold text-zinc-500">{new Date(p.createdAt).toLocaleDateString("es-MX")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
