import { useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, XCircle, Layers } from "lucide-react";
import { useWorkshopStore, type ComplexityPending } from "../store/workshopStore";
import { cn } from "@/lib/utils";

function levelLabel(level: ComplexityPending["level"]): string {
  switch (level) {
    case "LOW":
      return "Baja (LOW)";
    case "MEDIUM":
      return "Media (MEDIUM)";
    case "HIGH":
      return "Alta (HIGH)";
    default:
      return level;
  }
}

/**
 * HITL banner: backend stored a proposal in `project.complexityPending`.
 * Compact primary row (actions always visible); long copy lives in collapsible details for space + readability in light mode.
 */
export default function ComplexityPendingBanner() {
  const projectId = useWorkshopStore((s) => s.projectId);
  const pending = useWorkshopStore((s) => s.project?.complexityPending);
  const storeLoading = useWorkshopStore((s) => s.loading);
  const confirmComplexityProposal = useWorkshopStore((s) => s.confirmComplexityProposal);
  const dismissComplexityProposal = useWorkshopStore((s) => s.dismissComplexityProposal);
  const [busy, setBusy] = useState(false);

  if (!pending || !projectId) return null;

  const disabled = storeLoading || busy;
  const hasDetailBody =
    !!(pending.planSummary?.trim() || pending.reason?.trim());

  const run = async (fn: (id: string) => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn(projectId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "shrink-0 border-b px-3 py-2 sm:px-4 sm:py-2.5",
        "border-[color-mix(in_oklch,var(--warning)_42%,var(--border))]",
        "bg-[color-mix(in_oklch,var(--warning)_14%,var(--card))]",
        "dark:bg-[color-mix(in_oklch,var(--warning)_12%,var(--card))]",
      )}
      role="region"
      aria-label="Propuesta de complejidad pendiente de confirmación"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
          <Layers
            className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))] sm:mt-0"
            aria-hidden
          />
          <p className="min-w-0 text-sm font-semibold leading-snug text-[var(--foreground)]">
            <span className="text-[color-mix(in_oklch,var(--warning)_55%,var(--foreground))]">Complejidad propuesta:</span>{" "}
            {levelLabel(pending.level)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => run(confirmComplexityProposal)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:py-1.5 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />}
            Confirmar y aplicar nivel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => run(dismissComplexityProposal)}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_88%,var(--background))] px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-sm hover:bg-[color-mix(in_oklch,var(--muted)_55%,var(--card))] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:py-1.5"
          >
            <XCircle className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
            Descartar propuesta
          </button>
        </div>
      </div>

      {hasDetailBody ? (
        <details className="group/details mt-2 rounded-lg border border-[color-mix(in_oklch,var(--border)_90%,var(--warning))] bg-[color-mix(in_oklch,var(--background)_55%,transparent)] open:bg-[color-mix(in_oklch,var(--background)_70%,var(--card))] dark:bg-[color-mix(in_oklch,var(--card)_35%,transparent)] dark:open:bg-[color-mix(in_oklch,var(--card)_50%,transparent)]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] marker:content-none [&::-webkit-details-marker]:hidden hover:bg-[color-mix(in_oklch,var(--muted)_35%,transparent)]">
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform group-open/details:rotate-180"
              aria-hidden
            />
            Ver detalle de la propuesta
          </summary>
          <div className="space-y-2 border-t border-[color-mix(in_oklch,var(--border)_85%,transparent)] px-2.5 py-2.5">
            {pending.planSummary?.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">{pending.planSummary.trim()}</p>
            ) : null}
            {pending.reason?.trim() ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted-foreground)]">{pending.reason.trim()}</p>
            ) : null}
            <p className="text-[11px] leading-snug text-[var(--muted-foreground)]">
              También puedes confirmar en el chat (p. ej. «sí, ejecuta este plan») o descartar con «no».
            </p>
          </div>
        </details>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-[var(--muted-foreground)]">
          También puedes confirmar en el chat (p. ej. «sí, ejecuta este plan») o descartar con «no».
        </p>
      )}
    </div>
  );
}
