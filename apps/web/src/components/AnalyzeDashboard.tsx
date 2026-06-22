import { useEffect, useState } from "react";
import { Loader2, BarChart3, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { SddAnalyzeReport } from "@theforge/shared-types";
import { apiFetch, API_BASE } from "@/utils/apiClient";
import { cn } from "@/lib/utils";

interface AnalyzeDashboardProps {
  projectId: string;
  className?: string;
  onReportLoaded?: (report: SddAnalyzeReport) => void;
}

const STATUS_STYLES = {
  ok: { icon: CheckCircle2, color: "text-[var(--success)]", label: "OK" },
  warnings: { icon: AlertTriangle, color: "text-[var(--warning)]", label: "Advertencias" },
  blocked: { icon: XCircle, color: "text-[var(--destructive)]", label: "Bloqueado" },
} as const;

/** Cross-artifact analyze dashboard (`/speckit.analyze` equivalent). */
export function AnalyzeDashboard({ projectId, className, onReportLoaded }: AnalyzeDashboardProps) {
  const [report, setReport] = useState<SddAnalyzeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch(`${API_BASE}/projects/${projectId}/analyze`);
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(text.slice(0, 200) || `HTTP ${r.status}`);
      }
      const loaded = (await r.json()) as SddAnalyzeReport;
      setReport(loaded);
      onReportLoaded?.(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReport();
  }, [projectId]);

  if (loading && !report) {
    return (
      <div className={cn("flex items-center gap-2 p-4 text-sm", className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Analizando artefactos…
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-2 p-4 text-sm text-[var(--destructive)]", className)}>
        <p>{error}</p>
        <button
          type="button"
          onClick={() => void fetchReport()}
          className="text-xs underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!report) return null;

  const statusCfg = STATUS_STYLES[report.summary.status];
  const StatusIcon = statusCfg.icon;

  return (
    <div className={cn("space-y-4 p-4 text-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
          <div>
            <p className="font-semibold">Analizar — consistencia SDD</p>
            <p className="text-xs text-[color-mix(in_oklch,var(--foreground)_85%,var(--muted-foreground))]">
              {report.featureDir} · semáforo {report.semaphore ?? "—"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchReport()}
          disabled={loading}
          className="text-xs text-[var(--primary)] underline disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] p-3">
        <StatusIcon className={cn("h-5 w-5 shrink-0", statusCfg.color)} aria-hidden />
        <div>
          <p className={cn("font-semibold", statusCfg.color)}>
            {statusCfg.label} — score {report.summary.score}
          </p>
          <p className="text-xs">{report.summary.headline}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {(
          [
            ["MDD", report.artifacts.mdd.present],
            ["Spec", report.artifacts.spec.present],
            ["Plan", report.artifacts.blueprint.present],
            ["Tasks", report.artifacts.tasks.present],
            ["API", report.artifacts.apiContracts.present],
            ["Flujos", report.artifacts.logicFlows.present],
            ["Gov IA", report.artifacts.agentGovernance?.present ?? false],
          ] as const
        ).map(([label, ok]) => (
          <div
            key={label}
            className={cn(
              "rounded-md px-2 py-1.5",
              ok
                ? "bg-[color-mix(in_oklch,var(--success)_12%,var(--card))]"
                : "bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))]",
            )}
          >
            <span className="font-medium">{label}</span>
            <span className="ml-1 opacity-80">{ok ? "✓" : "—"}</span>
          </div>
        ))}
      </div>

      {report.artifacts.agentGovernance ? (
        <div className="rounded-lg border border-[var(--border)] p-3 text-xs">
          <p className="mb-1 font-semibold">Gobernanza IA</p>
          <p>
            Archivos: {report.artifacts.agentGovernance.fileCount}
            {report.artifacts.agentGovernance.pathAlignmentOk ? (
              <span className="ml-2 text-[var(--success)]">· espejos docs/sdd OK</span>
            ) : (
              <span className="ml-2 text-[var(--warning)]">· espejos incompletos</span>
            )}
          </p>
          {report.artifacts.agentGovernance.missingRequiredPaths.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-[var(--warning)]">
              {report.artifacts.agentGovernance.missingRequiredPaths.slice(0, 5).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {report.artifacts.tasks.present ? (
        <p className="text-xs text-[color-mix(in_oklch,var(--foreground)_90%,var(--muted-foreground))]">
          Tasks: {report.artifacts.tasks.openTasks} abiertas / {report.artifacts.tasks.totalTasks} total
          {report.artifacts.tasks.parallelizableOpen > 0
            ? ` · ${report.artifacts.tasks.parallelizableOpen} paralelizables [P]`
            : ""}
        </p>
      ) : null}

      {report.artifacts.spec.clarificationMarkerCount > 0 ? (
        <p className="text-xs text-[var(--warning)]">
          {report.artifacts.spec.clarificationMarkerCount} marcador(es) [NEEDS CLARIFICATION] en Spec
        </p>
      ) : null}

      {report.crossArtifactGaps.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-semibold">Hallazgos ({report.crossArtifactGaps.length})</p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-[color-mix(in_oklch,var(--foreground)_90%,var(--muted-foreground))]">
            {report.crossArtifactGaps.map((g) => (
              <li key={g} className="list-inside list-disc">
                {g}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
