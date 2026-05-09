import { useCallback, useState } from "react";
import { Button } from "./ui";

export interface BrdStagePanelProps {
  projectId: string;
  activeStageId: string | null;
  brdContent: string;
  onBrdContentChange: (value: string) => void;
  docViewMode?: "preview" | "source";
}

/**
 * Panel de BRD simplificado. To-Be y As-Is eliminados del sistema (Jul 2026).
 */
export function BrdStagePanel({
  activeStageId,
  brdContent,
  onBrdContentChange,
  docViewMode,
}: BrdStagePanelProps) {
  const [localBusy, setLocalBusy] = useState(false);
  // Patch stage via parent (the parent calls the store action)
  const busy = localBusy;

  if (!activeStageId) {
    return (
      <div className="mb-3 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Selecciona una etapa para editar BRD.
      </div>
    );
  }

  const showPreview = docViewMode === "preview";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 p-3 text-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[var(--foreground)]">BRD de cambio (etapa)</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <label className="shrink-0 text-xs text-[var(--muted-foreground)]">BRD (markdown)</label>
        {showPreview ? (
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)]/30 p-2 text-[var(--foreground)]">
            <pre className="whitespace-pre-wrap font-mono text-xs">{brdContent}</pre>
          </div>
        ) : (
          <textarea
            value={brdContent}
            onChange={(e) => onBrdContentChange(e.target.value)}
            disabled={busy}
            spellCheck={false}
            className="w-full min-h-[10rem] flex-1 rounded-md border border-[var(--border)] bg-[var(--background)]/80 p-2 font-mono text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_55%,transparent)] resize-none"
            placeholder="Problema, KPIs, alcance…"
          />
        )}
      </div>
    </div>
  );
}

export default BrdStagePanel;
