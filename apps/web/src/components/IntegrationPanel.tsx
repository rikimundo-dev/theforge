/**
 * Workshop panel: cross-project integration NEW ↔ LEGACY (handoff, traces, link picker).
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Link2,
  Loader2,
  Plus,
  Send,
  Trash2,
  Download,
} from "lucide-react";
import type {
  IntegrationHandoffItem,
  IntegrationStatusResponse,
  IntegrationTraceRow,
} from "@theforge/shared-types";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { apiFetch, API_BASE } from "@/utils/apiClient";

interface PickerProject {
  id: string;
  name: string;
  projectType: string;
  hasBaselineMdd: boolean;
}

export interface IntegrationPanelProps {
  projectId: string;
  projectType: "NEW" | "LEGACY";
  activeStageId: string | null;
  activeStageOrdinal: number;
  onProjectRefresh: () => void | Promise<void>;
}

export function IntegrationPanel({
  projectId,
  projectType,
  activeStageId,
  activeStageOrdinal,
  onProjectRefresh,
}: IntegrationPanelProps) {
  const [status, setStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerProjects, setPickerProjects] = useState<PickerProject[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [legacyContextPreview, setLegacyContextPreview] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/integration`);
      if (!r.ok) throw new Error("No se pudo cargar integración");
      const data = (await r.json()) as IntegrationStatusResponse;
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (projectType !== "NEW" || !status?.linkedLegacyProject) {
      setLegacyContextPreview(null);
      return;
    }
    void (async () => {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/integration/context`);
      if (!r.ok) return;
      const ctx = (await r.json()) as {
        apiSectionMarkdown?: string;
        contextSectionMarkdown?: string;
      };
      setLegacyContextPreview(
        [ctx.contextSectionMarkdown, ctx.apiSectionMarkdown].filter(Boolean).join("\n\n---\n\n") || null,
      );
    })();
  }, [projectId, projectType, status?.linkedLegacyProject?.id]);

  const openPicker = useCallback(async () => {
    setPickerOpen(true);
    setPickerLoading(true);
    try {
      const target = projectType === "NEW" ? "LEGACY" : "NEW";
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/integration/picker?targetType=${target}`);
      const data = (await r.json()) as PickerProject[];
      setPickerProjects(Array.isArray(data) ? data : []);
    } finally {
      setPickerLoading(false);
    }
  }, [projectId, projectType]);

  const linkProject = useCallback(
    async (targetId: string) => {
      const body =
        projectType === "NEW"
          ? { linkedLegacyProjectId: targetId }
          : { linkedNewProjectId: targetId };
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/integration/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("No se pudo enlazar");
      setPickerOpen(false);
      await loadStatus();
      await onProjectRefresh();
    },
    [projectId, projectType, loadStatus, onProjectRefresh],
  );

  const unlink = useCallback(async () => {
    const body =
      projectType === "NEW" ? { linkedLegacyProjectId: null } : { linkedNewProjectId: null };
    await apiFetch(`${API_BASE}/projects/${projectId}/integration/link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await loadStatus();
    await onProjectRefresh();
  }, [projectId, projectType, loadStatus, onProjectRefresh]);

  const addHandoffItem = useCallback(async () => {
    if (!newTitle.trim() || !newDescription.trim()) return;
    const r = await apiFetch(`${API_BASE}/projects/${projectId}/integration/handoff/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), description: newDescription.trim() }),
    });
    if (!r.ok) {
      setError("No se pudo crear ítem handoff");
      return;
    }
    setNewTitle("");
    setNewDescription("");
    await loadStatus();
  }, [projectId, newTitle, newDescription, loadStatus]);

  const sendHandoff = useCallback(async () => {
    const r = await apiFetch(`${API_BASE}/projects/${projectId}/integration/handoff/send`, {
      method: "POST",
    });
    if (!r.ok) {
      setError("Envía handoff falló — ¿legacy enlazado?");
      return;
    }
    await loadStatus();
  }, [projectId, loadStatus]);

  const importHandoff = useCallback(async () => {
    if (!activeStageId) return;
    const r = await apiFetch(
      `${API_BASE}/projects/${projectId}/integration/stages/${activeStageId}/import-handoff`,
      { method: "POST" },
    );
    if (!r.ok) {
      setError("Importar handoff falló");
      return;
    }
    await loadStatus();
    await onProjectRefresh();
  }, [projectId, activeStageId, loadStatus, onProjectRefresh]);

  const deleteItem = useCallback(
    async (itemId: string) => {
      await apiFetch(`${API_BASE}/projects/${projectId}/integration/handoff/items/${itemId}`, {
        method: "DELETE",
      });
      await loadStatus();
    },
    [projectId, loadStatus],
  );

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted-foreground)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Cargando integración…
      </div>
    );
  }

  const linked =
    projectType === "NEW" ? status?.linkedLegacyProject : status?.linkedNewProject;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-1 py-2 sm:px-2">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] text-[var(--primary)]">
            <Link2 className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Integración Legacy ↔ Nuevo</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Handoff estructurado, trazabilidad NEW-LEG ↔ LEG y contrato AS-IS.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <p className="rounded-md border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      {status?.warnings.length ? (
        <ul className="space-y-2">
          {status.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="rounded-xl bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] p-4">
        <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]">Proyecto enlazado</h3>
        {linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-[var(--foreground)]">{linked.name}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {linked.projectType} · {linked.id}
                {linked.hasBaselineMdd ? " · MDD AS-IS ✓" : " · sin MDD etapa 1"}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void unlink()}>
              Desvincular
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              {projectType === "NEW"
                ? "Selecciona el proyecto LEGACY (etapa 1 AS-IS)."
                : "Selecciona el proyecto NEW que solicita cambios."}
            </p>
            <Button type="button" size="sm" onClick={() => void openPicker()}>
              Enlazar proyecto
            </Button>
          </div>
        )}
      </section>

      {projectType === "NEW" && legacyContextPreview ? (
        <section className="rounded-xl bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">
            Extracto AS-IS legacy (§1 + §4)
          </h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--muted)]/40 p-3 text-xs text-[var(--foreground-muted)]">
            {legacyContextPreview.slice(0, 4000)}
            {legacyContextPreview.length > 4000 ? "\n…" : ""}
          </pre>
        </section>
      ) : null}

      {projectType === "NEW" ? (
        <HandoffEditor
          items={status?.handoff.items ?? []}
          newTitle={newTitle}
          newDescription={newDescription}
          onTitleChange={setNewTitle}
          onDescriptionChange={setNewDescription}
          onAdd={() => void addHandoffItem()}
          onDelete={(id) => void deleteItem(id)}
          onSend={() => void sendHandoff()}
          linked={!!linked}
        />
      ) : null}

      {projectType === "LEGACY" && activeStageOrdinal >= 2 ? (
        <section className="rounded-xl bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--foreground)]">Importar handoff (etapa {activeStageOrdinal})</h3>
          <p className="mb-3 text-sm text-[var(--muted-foreground)]">
            Copia el handoff del proyecto NEW a Modificación y genera MDD/H.U. con trazabilidad.
          </p>
          {status?.handoffImportedAt ? (
            <p className="mb-2 text-xs text-emerald-400">
              Importado: {new Date(status.handoffImportedAt).toLocaleString()}
            </p>
          ) : null}
          <Button type="button" size="sm" onClick={() => void importHandoff()} disabled={!linked}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Importar handoff
          </Button>
        </section>
      ) : null}

      <TraceMatrix traces={status?.traces ?? []} />

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h3 className="font-medium text-[var(--foreground)]">Seleccionar proyecto</h3>
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {pickerLoading ? (
                <p className="p-4 text-center text-sm text-[var(--muted-foreground)]">Cargando…</p>
              ) : pickerProjects.length === 0 ? (
                <p className="p-4 text-center text-sm text-[var(--muted-foreground)]">Sin proyectos</p>
              ) : (
                <ul className="space-y-1">
                  {pickerProjects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                        onClick={() => void linkProject(p.id).catch(() => setError("Enlace fallido"))}
                      >
                        <span className="font-medium text-[var(--foreground)]">{p.name}</span>
                        <span className="ml-2 text-xs text-[var(--muted-foreground)]">{p.projectType}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-[var(--border)] p-3">
              <Button type="button" variant="outline" className="w-full" onClick={() => setPickerOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HandoffEditor({
  items,
  newTitle,
  newDescription,
  onTitleChange,
  onDescriptionChange,
  onAdd,
  onDelete,
  onSend,
  linked,
}: {
  items: IntegrationHandoffItem[];
  newTitle: string;
  newDescription: string;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSend: () => void;
  linked: boolean;
}) {
  return (
    <section className="rounded-xl bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--foreground)]">Handoff NEW-LEG-*</h3>
        <Button type="button" size="sm" variant="default" disabled={!linked || !items.length} onClick={onSend}>
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Enviar al legacy
        </Button>
      </div>
      <div className="mb-4 space-y-2">
        <Input placeholder="Título (p. ej. Token OAuth cotizador)" value={newTitle} onChange={(e) => onTitleChange(e.target.value)} />
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
          placeholder="Descripción de la historia handoff…"
          value={newDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
        />
        <Button type="button" size="sm" variant="outline" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Añadir ítem
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Sin ítems handoff.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs text-[var(--primary)]">{item.id}</span>
                  <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase", statusBadge(item.status))}>
                    {item.status}
                  </span>
                  <p className="mt-1 font-medium text-[var(--foreground)]">{item.title}</p>
                  <p className="mt-0.5 text-[var(--muted-foreground)]">{item.description}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Eliminar ${item.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TraceMatrix({ traces }: { traces: IntegrationTraceRow[] }) {
  if (!traces.length) return null;
  return (
    <section className="rounded-xl bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] p-4">
      <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]">Matriz de trazabilidad</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
              <th className="py-2 pr-3">NEW-LEG</th>
              <th className="py-2 pr-3">LEG</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2">Título</th>
            </tr>
          </thead>
          <tbody>
            {traces.map((t) => (
              <tr key={t.id} className="border-b border-[var(--border)]/60">
                <td className="py-2 pr-3 font-mono text-[var(--primary)]">{t.newLegId}</td>
                <td className="py-2 pr-3 font-mono">{t.legacyStoryId ?? "—"}</td>
                <td className="py-2 pr-3">{t.status}</td>
                <td className="py-2 text-[var(--foreground-muted)]">{t.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function statusBadge(status: string): string {
  if (status === "sent" || status === "accepted") return "bg-emerald-500/20 text-emerald-300";
  if (status === "implemented") return "bg-blue-500/20 text-blue-300";
  return "bg-[var(--muted)] text-[var(--muted-foreground)]";
}
