/**
 * Modal para fusionar 2+ proyectos a nivel Paso 0 (Fase 0 / DBGA).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, GitMerge, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { apiFetch, API_BASE } from "../utils/apiClient";
import type { MergeConflict, ProjectMergePreview, ProjectMergeResult } from "@theforge/shared-types";

export interface MergeProjectSource {
  id: string;
  name: string;
}

export interface ProjectMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: MergeProjectSource[];
  loading?: boolean;
  onMerged: (result: ProjectMergeResult) => void | Promise<void>;
}

type Step = "config" | "preview";

type Disposition = "keep" | "archive" | "delete";

export function ProjectMergeDialog({
  open,
  onOpenChange,
  sources,
  loading: externalLoading,
  onMerged,
}: ProjectMergeDialogProps) {
  const [step, setStep] = useState<Step>("config");
  const [name, setName] = useState("");
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [includeDbga, setIncludeDbga] = useState(true);
  const [includePhase0Json, setIncludePhase0Json] = useState(true);
  const [includeBenchmark, setIncludeBenchmark] = useState(false);
  const [deleteSources, setDeleteSources] = useState<Disposition>("keep");
  const [resetDownstream, setResetDownstream] = useState(true);
  const [createSuite, setCreateSuite] = useState(false);
  const [autoAudit, setAutoAudit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectMergePreview | null>(null);

  const defaultName = useMemo(() => {
    if (sources.length === 0) return "";
    if (sources.length === 2) {
      const first = sources[0];
      const second = sources[1];
      if (!first || !second) return "";
      const a = first.name.slice(0, 28);
      const b = second.name.slice(0, 28);
      return `${a} + ${b}`;
    }
    return `Suite (${sources.length} productos)`;
  }, [sources]);

  const reset = useCallback(() => {
    setStep("config");
    setName("");
    setTargetMode("new");
    setTargetProjectId("");
    setIncludeDbga(true);
    setIncludePhase0Json(true);
    setIncludeBenchmark(false);
    setDeleteSources("keep");
    setResetDownstream(true);
    setCreateSuite(false);
    setAutoAudit(true);
    setBusy(false);
    setError(null);
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
    else setName(defaultName);
  }, [open, reset, defaultName]);

  const sourceIds = useMemo(() => sources.map((s) => s.id), [sources]);

  const buildBody = useCallback(
    (previewOnly: boolean) => ({
      sourceProjectIds: sourceIds,
      targetMode,
      targetProjectId: targetMode === "existing" ? targetProjectId : undefined,
      name: targetMode === "new" ? name.trim() : undefined,
      sourceOptions: { includeDbga, includePhase0Json, includeBenchmark },
      deleteSources,
      resetDownstream,
      createSuite,
      autoAudit: previewOnly ? false : autoAudit,
      preview: previewOnly,
    }),
    [
      sourceIds,
      targetMode,
      targetProjectId,
      name,
      includeDbga,
      includePhase0Json,
      includeBenchmark,
      deleteSources,
      resetDownstream,
      createSuite,
      autoAudit,
    ],
  );

  const runPreview = useCallback(async () => {
    if (targetMode === "new" && !name.trim()) {
      setError("Indica un nombre para el proyecto fusionado.");
      return;
    }
    if (targetMode === "existing" && !targetProjectId) {
      setError("Selecciona el proyecto destino.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/projects/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(true)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo generar la vista previa");
      }
      const data = (await res.json()) as ProjectMergeResult;
      if (!data.preview) throw new Error("Respuesta sin preview");
      setPreview(data.preview);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en vista previa");
    } finally {
      setBusy(false);
    }
  }, [buildBody, name, targetMode, targetProjectId]);

  const confirmMerge = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/projects/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(false)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "No se pudo fusionar");
      }
      const data = (await res.json()) as ProjectMergeResult;
      await onMerged(data);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al fusionar");
    } finally {
      setBusy(false);
    }
  }, [buildBody, onMerged, onOpenChange]);

  const loading = busy || !!externalLoading;

  const criticalConflicts = preview?.conflicts.filter((c) => c.severity === "critical") ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-[var(--primary)]" aria-hidden />
            Fusionar proyectos (Paso 0)
          </DialogTitle>
          <DialogDescription>
            Sintetiza la especificación Fase 0 de {sources.length} productos. Por defecto se crea un proyecto
            nuevo y se reinician MDD y entregables.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="rounded-lg border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
            {error}
          </p>
        ) : null}

        {step === "config" ? (
          <div className="space-y-4 text-sm">
            <div>
              <p className="mb-2 font-medium text-[var(--foreground)]">Fuentes</p>
              <ul className="list-inside list-disc text-[var(--foreground-muted)]">
                {sources.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </div>

            <fieldset className="space-y-2">
              <legend className="font-medium">Destino</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="targetMode"
                  checked={targetMode === "new"}
                  onChange={() => setTargetMode("new")}
                />
                Nuevo proyecto (recomendado)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="targetMode"
                  checked={targetMode === "existing"}
                  onChange={() => setTargetMode("existing")}
                />
                Fusionar en proyecto existente
              </label>
            </fieldset>

            {targetMode === "new" ? (
              <label className="block space-y-1">
                <span className="font-medium">Nombre del proyecto fusionado</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="font-medium">Proyecto destino</span>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-2"
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <fieldset className="space-y-2">
              <legend className="font-medium">Contenido a combinar</legend>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={includeDbga} onChange={(e) => setIncludeDbga(e.target.checked)} />
                DBGA visible (markdown Fase 0)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePhase0Json}
                  onChange={(e) => setIncludePhase0Json(e.target.checked)}
                />
                Borrador estructurado (JSON interno)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeBenchmark}
                  onChange={(e) => setIncludeBenchmark(e.target.checked)}
                />
                Benchmark / Deep Research
              </label>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="font-medium">Proyectos fuente tras fusionar</legend>
              {(["keep", "archive", "delete"] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="deleteSources"
                    checked={deleteSources === opt}
                    onChange={() => setDeleteSources(opt)}
                  />
                  {opt === "keep" ? "Conservar" : opt === "archive" ? "Archivar (ocultar del dashboard)" : "Eliminar"}
                </label>
              ))}
            </fieldset>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={resetDownstream}
                onChange={(e) => setResetDownstream(e.target.checked)}
              />
              Reiniciar MDD y entregables en el destino
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={createSuite} onChange={(e) => setCreateSuite(e.target.checked)} />
              Crear suite: vincular fuentes como sub-productos del fusionado
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={autoAudit} onChange={(e) => setAutoAudit(e.target.checked)} />
              Ejecutar auditoría Paso 0 al finalizar
            </label>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            {criticalConflicts.length > 0 ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {criticalConflicts.length} conflicto(s) crítico(s)
                </p>
                <ul className="mt-2 list-inside list-disc text-[var(--foreground-muted)]">
                  {criticalConflicts.map((c, i) => (
                    <li key={`${c.kind}-${i}`}>{c.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview?.conflicts.filter((c) => c.severity === "warning").length ? (
              <details className="rounded-lg border border-[var(--border)] px-3 py-2">
                <summary className="cursor-pointer font-medium">
                  Advertencias ({preview.conflicts.filter((c) => c.severity === "warning").length})
                </summary>
                <ul className="mt-2 list-inside list-disc text-[var(--foreground-muted)]">
                  {preview.conflicts
                    .filter((c) => c.severity === "warning")
                    .map((c: MergeConflict, i) => (
                      <li key={`w-${i}`}>{c.message}</li>
                    ))}
                </ul>
              </details>
            ) : null}

            <div className="max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {preview?.markdown.slice(0, 6000)}
              {(preview?.markdown.length ?? 0) > 6000 ? "\n\n…" : ""}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "preview" ? (
            <Button type="button" variant="outline" onClick={() => setStep("config")} disabled={loading}>
              Atrás
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
          )}
          {step === "config" ? (
            <Button type="button" onClick={() => void runPreview()} disabled={loading || sources.length < 2}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Vista previa
            </Button>
          ) : (
            <Button type="button" onClick={() => void confirmMerge()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Confirmar fusión
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
