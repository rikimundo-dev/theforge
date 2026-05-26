/**
 * Modal to create a new workshop stage (name + optional MDD copy source).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Layers } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { WorkshopStage } from "@/store/workshopStore";

export interface WorkshopNewStageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: WorkshopStage[];
  activeStageId: string | null;
  onCreate: (opts: {
    name?: string;
    copyMddFromStageId?: string;
    copyLegacyChangeFromStageId?: string;
  }) => Promise<unknown>;
}

function FormField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">{hint}</p> : null}
    </div>
  );
}

const selectFieldClass = cn(
  "flex h-9 w-full appearance-none rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 py-1 text-sm text-[var(--foreground)] shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
);

export function WorkshopNewStageModal({
  open,
  onOpenChange,
  stages,
  activeStageId,
  onCreate,
}: WorkshopNewStageModalProps) {
  const [name, setName] = useState("");
  const [copyMddSourceStageId, setCopyMddSourceStageId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCopyMddSourceStageId(activeStageId ?? "");
    setSaving(false);
  }, [open, activeStageId]);

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await onCreate({
        name: name.trim() || undefined,
        copyMddFromStageId: copyMddSourceStageId.trim() || undefined,
        copyLegacyChangeFromStageId: copyMddSourceStageId.trim() || undefined,
      });
      if (res) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="gap-0 overflow-hidden p-0 sm:max-w-md" showClose>
        <div className="border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--primary)_9%,var(--card))] px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3 pr-6">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--primary)_16%,var(--card))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
                aria-hidden
              >
                <Layers className="h-5 w-5 text-[var(--primary)]" strokeWidth={2} />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                  Nueva etapa
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                  Se activará la nueva etapa (las demás pasan a SUPERSEDED). Puedes partir de un MDD en blanco o
                  copiar uno de una etapa previa.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
          <FormField id="new-stage-name" label="Nombre" hint="Opcional. Ej. Fase 2 — API">
            <Input
              id="new-stage-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Fase 2 — API"
              autoComplete="off"
            />
          </FormField>

          <FormField
            id="copy-mdd-from-stage"
            label="Copiar MDD desde"
            hint="Elige una etapa existente o deja el MDD vacío para empezar desde cero."
          >
            <select
              id="copy-mdd-from-stage"
              value={copyMddSourceStageId}
              onChange={(e) => setCopyMddSourceStageId(e.target.value)}
              className={selectFieldClass}
            >
              <option value="">Sin copiar (MDD vacío)</option>
              {stages.map((st) => (
                <option key={st.id} value={st.id}>
                  #{st.ordinal} {st.name ?? st.key ?? st.id.slice(0, 8)}
                  {st.id === activeStageId ? " (vista actual)" : ""}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <DialogFooter className="gap-2 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] px-5 py-3 sm:px-6">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            className="w-full sm:w-auto"
            disabled={saving}
            loading={saving}
            onClick={() => void handleCreate()}
          >
            Crear etapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
