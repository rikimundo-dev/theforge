/**
 * Modal: full workshop document flow for HIGH complexity (readable timeline + hints).
 */
import { ListOrdered, Route } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  HIGH_GREENFIELD_FLOW_STEPS,
  HIGH_LEGACY_FLOW_MODAL_BODY,
} from "@/utils/workshopFlowOrder";

export interface WorkshopFlowOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLegacyProject: boolean;
}

export function WorkshopFlowOrderModal({
  open,
  onOpenChange,
  isLegacyProject,
}: WorkshopFlowOrderModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        className="max-h-[min(92vh,880px)] max-w-[min(100%,42rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showClose
      >
        <div className="border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--primary)_9%,var(--card))] px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--primary)_16%,var(--card))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
                aria-hidden
              >
                <Route className="h-5 w-5 text-[var(--primary)]" strokeWidth={2} />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl">
                  Orden completo del flujo
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                  {isLegacyProject
                    ? "Flujo alto para proyectos legacy: documentación de partida, modificaciones y entregables por etapa."
                    : "Complejidad alta (producto nuevo): recorre los documentos del taller en este orden para mantener coherencia entre negocio, diseño y construcción."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="max-h-[min(62vh,560px)] overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 [scrollbar-gutter:stable]">
          {!isLegacyProject ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                <ListOrdered className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden />
                Secuencia recomendada
              </div>
              <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                {HIGH_GREENFIELD_FLOW_STEPS.map((step, idx) => (
                  <li
                    key={step.label}
                    className={cn(
                      "relative rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_88%,var(--background))] p-3.5 shadow-sm transition-colors",
                      "hover:border-[color-mix(in_oklch,var(--primary)_22%,var(--border))]",
                    )}
                  >
                    <div className="flex gap-3">
                      <span className="flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--primary)_12%,var(--muted))] text-xs font-bold tabular-nums text-[var(--primary)]">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold leading-tight text-[var(--foreground)]">{step.label}</p>
                        <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{step.description}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="rounded-lg border border-dashed border-[color-mix(in_oklch,var(--border)_85%,var(--primary))] bg-[color-mix(in_oklch,var(--muted)_22%,var(--card))] px-3 py-2.5 text-[11px] leading-snug text-[var(--muted-foreground)]">
                El semáforo y la conformidad respecto al MDD condicionan cuándo puedes generar entregables en cascada;
                revisa la columna derecha del taller antes de forzar pasos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-[var(--foreground)]">Legacy en complejidad alta</p>
              <p className="text-sm leading-relaxed text-[var(--foreground)]">{HIGH_LEGACY_FLOW_MODAL_BODY}</p>
              <ul className="m-0 list-none space-y-2 border-l-2 border-[color-mix(in_oklch,var(--primary)_40%,var(--border))] py-0.5 pl-4 text-sm text-[var(--muted-foreground)]">
                <li className="relative">
                  <span className="absolute -left-[calc(1rem+5px)] top-2 h-2 w-2 rounded-full bg-[var(--primary)]" aria-hidden />
                  Partida opcional con <strong className="font-semibold text-[var(--foreground)]">MDD Inicial</strong>{" "}
                  (Ariadne) cuando necesites documentar el codebase existente.
                </li>
                <li className="relative pt-1">
                  <span className="absolute -left-[calc(1rem+5px)] top-3 h-2 w-2 rounded-full bg-[color-mix(in_oklch,var(--primary)_65%,var(--muted))]" aria-hidden />
                  Cada <strong className="font-semibold text-[var(--foreground)]">modificación</strong> tiene su propio
                  MDD de cambio y entregables actualizados en la etapa activa.
                </li>
                <li className="relative pt-1">
                  <span className="absolute -left-[calc(1rem+5px)] top-3 h-2 w-2 rounded-full bg-[color-mix(in_oklch,var(--primary)_65%,var(--muted))]" aria-hidden />
                  Mantén <strong className="font-semibold text-[var(--foreground)]">Spec</strong> y conformidad alineados
                  antes de lanzar generaciones masivas.
                </li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] px-5 py-3 sm:px-6">
          <Button type="button" variant="default" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
