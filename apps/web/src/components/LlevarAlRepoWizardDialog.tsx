import { useEffect, useState } from "react";
import { FolderGit2, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import type { SddAnalyzeReport } from "@theforge/shared-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { downloadRepoHandoffFromApi } from "@/utils/downloadRepoHandoff";
import { downloadSpecKitBundleFromApi } from "@/utils/downloadSpecKitBundle";
import { apiFetch, API_BASE } from "@/utils/apiClient";
import { cn } from "@/lib/utils";

interface LlevarAlRepoWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  hasAgentGovernance: boolean;
  hasMdd: boolean;
  analyzeReport?: SddAnalyzeReport | null;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

/**
 * Post-VERDE wizard: export spec-kit bundle + agent governance + IMPLEMENT.md for repo handoff.
 */
export function LlevarAlRepoWizardDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  hasAgentGovernance,
  hasMdd,
  analyzeReport: analyzeReportProp,
  onError,
  onSuccess,
}: LlevarAlRepoWizardDialogProps) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"intro" | "done">("intro");
  const [analyzeReport, setAnalyzeReport] = useState<SddAnalyzeReport | null>(
    analyzeReportProp ?? null,
  );
  const [analyzeLoading, setAnalyzeLoading] = useState(false);

  useEffect(() => {
    if (analyzeReportProp) setAnalyzeReport(analyzeReportProp);
  }, [analyzeReportProp]);

  useEffect(() => {
    if (!open || !projectId || analyzeReportProp) return;
    let cancelled = false;
    setAnalyzeLoading(true);
    void (async () => {
      try {
        const r = await apiFetch(`${API_BASE}/projects/${projectId}/analyze`);
        if (!r.ok || cancelled) return;
        setAnalyzeReport((await r.json()) as SddAnalyzeReport);
      } catch {
        /* gate opcional — no bloquear si analyze falla */
      } finally {
        if (!cancelled) setAnalyzeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId, analyzeReportProp]);

  const analyzeStatus = analyzeReport?.summary.status;
  const handoffBlocked = analyzeStatus === "blocked";
  const handoffWarnings = analyzeStatus === "warnings";

  const handleDownloadFull = async () => {
    if (!projectId || !hasMdd) return;
    if (handoffWarnings) {
      const ok = window.confirm(
        "El análisis SDD reporta advertencias. ¿Descargar handoff de todos modos?",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const ok = await downloadRepoHandoffFromApi(projectId, projectName);
      if (ok) {
        setStep("done");
        onSuccess?.("✅ ZIP repo-handoff descargado (spec-kit + gobernanza reconciliada)");
      } else {
        onError?.("No se pudo generar el bundle de handoff.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadSpecOnly = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const ok = await downloadSpecKitBundleFromApi(projectId, projectName);
      if (ok) onSuccess?.("✅ Bundle spec-kit descargado");
      else onError?.("No hay contenido MDD para exportar.");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    setStep("intro");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="lg" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-[var(--success)]" aria-hidden />
            Llevar al repo
          </DialogTitle>
          <DialogDescription>
            Exporta la estructura compatible con{" "}
            <a
              href="https://github.com/github/spec-kit"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              spec-kit
            </a>{" "}
            para implementar en tu repositorio con un agente IDE.
          </DialogDescription>
        </DialogHeader>

        {step === "intro" ? (
          <div className="space-y-3 text-sm text-[var(--foreground)]">
            {analyzeLoading ? (
              <p className="flex items-center gap-2 text-xs text-[color-mix(in_oklch,var(--foreground)_85%,var(--muted-foreground))]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Verificando consistencia SDD…
              </p>
            ) : null}
            {analyzeStatus === "blocked" ? (
              <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))] p-2 text-xs text-[var(--destructive)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Análisis bloqueado: {analyzeReport?.summary.headline}. Resuelve hallazgos antes del
                  handoff completo.
                </span>
              </div>
            ) : null}
            {handoffWarnings ? (
              <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_oklch,var(--warning)_12%,var(--card))] p-2 text-xs text-[var(--warning)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{analyzeReport?.summary.headline}</span>
              </div>
            ) : null}
            <p className="font-medium">El ZIP incluye:</p>
            <ul className="list-disc space-y-1 pl-5 text-[color-mix(in_oklch,var(--foreground)_90%,var(--muted-foreground))]">
              <li>
                <code className="text-xs">.specify/memory/constitution.md</code> (MDD)
              </li>
              <li>
                <code className="text-xs">specs/NNN-slug/</code> — spec, plan, tasks, contracts…
              </li>
              <li>
                <code className="text-xs">IMPLEMENT.md</code> +{" "}
                <code className="text-xs">THEFORGE-DOC-CONSUMPTION-GUIDE.md</code>
              </li>
              {hasAgentGovernance ? (
                <li>
                  <code className="text-xs">agent-governance/</code> — rules, skills, AGENTS.md
                  (reconciliado + docs/sdd)
                </li>
              ) : (
                <li className="flex items-start gap-1.5 text-[var(--warning)]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Gobernanza IA no generada — opcional pero recomendada
                </li>
              )}
            </ul>
            <p className="text-xs text-[color-mix(in_oklch,var(--foreground)_85%,var(--muted-foreground))]">
              Descomprime en la raíz del repo destino. El agente debe leer IMPLEMENT.md antes de codificar.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[var(--success)]">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
            Bundle listo. Instala gobernanza según INSTALACION.md si aplica.
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {step === "intro" ? (
            <>
              <button
                type="button"
                onClick={() => void handleDownloadSpecOnly()}
                disabled={busy || !hasMdd}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Solo spec-kit
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadFull()}
                disabled={busy || !hasMdd || handoffBlocked}
                title={
                  handoffBlocked
                    ? "Resuelve bloqueos del análisis SDD antes de descargar el handoff completo"
                    : undefined
                }
                className={cn(
                  "flex min-h-9 items-center justify-center gap-2 rounded-lg px-4 text-xs font-semibold",
                  "bg-[var(--success)] text-[var(--success-foreground)] hover:bg-[color-mix(in_oklch,var(--success)_88%,black)] disabled:opacity-50",
                )}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Generando…
                  </>
                ) : (
                  "Descargar handoff completo"
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-[var(--primary-foreground)]"
            >
              Cerrar
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
