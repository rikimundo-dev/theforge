import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui";
import { useWorkshopStore, type WorkshopStage } from "../store/workshopStore";

export interface BrdTobeStagePanelProps {
  projectId: string;
  activeStageId: string | null;
  stage: WorkshopStage | undefined;
  isLegacyProject: boolean;
  codebaseDocChars: number;
}

/**
 * BRD / Manual To-Be / As-Is por etapa: edición vía PATCH y aprobaciones HITL.
 * Legacy: botón para sintetizar As-Is desde `codebaseDoc` (API `generate-as-is-manual`).
 */
export function BrdTobeStagePanel({
  projectId,
  activeStageId,
  stage,
  isLegacyProject,
  codebaseDocChars,
}: BrdTobeStagePanelProps) {
  const patchWorkshopStage = useWorkshopStore((s) => s.patchWorkshopStage);
  const legacyGenerateAsIsManual = useWorkshopStore((s) => s.legacyGenerateAsIsManual);
  const storeLoading = useWorkshopStore((s) => s.loading);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);

  const [brd, setBrd] = useState("");
  const [tobe, setTobe] = useState("");
  const [asis, setAsis] = useState("");
  const [localBusy, setLocalBusy] = useState(false);

  useEffect(() => {
    setBrd((stage?.brdContent ?? "").trim() ? (stage?.brdContent ?? "") : "");
    setTobe((stage?.toBeManualContent ?? "").trim() ? (stage?.toBeManualContent ?? "") : "");
    setAsis((stage?.asIsManualContent ?? "").trim() ? (stage?.asIsManualContent ?? "") : "");
  }, [stage?.id, stage?.brdContent, stage?.toBeManualContent, stage?.asIsManualContent]);

  const busy = localBusy || storeLoading;
  const asIsLoading = loadingReason === "legacy-as-is";

  const saveBrd = useCallback(async () => {
    if (!activeStageId) return;
    setLocalBusy(true);
    await patchWorkshopStage(activeStageId, { brdContent: brd });
    setLocalBusy(false);
  }, [activeStageId, brd, patchWorkshopStage]);

  const saveTobe = useCallback(async () => {
    if (!activeStageId) return;
    setLocalBusy(true);
    await patchWorkshopStage(activeStageId, { toBeManualContent: tobe });
    setLocalBusy(false);
  }, [activeStageId, patchWorkshopStage, tobe]);

  const saveAsis = useCallback(async () => {
    if (!activeStageId) return;
    setLocalBusy(true);
    await patchWorkshopStage(activeStageId, { asIsManualContent: asis });
    setLocalBusy(false);
  }, [activeStageId, asis, patchWorkshopStage]);

  const approveBrd = useCallback(async () => {
    if (!activeStageId) return;
    setLocalBusy(true);
    await patchWorkshopStage(activeStageId, { approveBrd: true });
    setLocalBusy(false);
  }, [activeStageId, patchWorkshopStage]);

  const approveTobe = useCallback(async () => {
    if (!activeStageId) return;
    setLocalBusy(true);
    await patchWorkshopStage(activeStageId, { approveToBe: true });
    setLocalBusy(false);
  }, [activeStageId, patchWorkshopStage]);

  const runLegacyAsIs = useCallback(async () => {
    setLocalBusy(true);
    await legacyGenerateAsIsManual(projectId);
    setLocalBusy(false);
  }, [legacyGenerateAsIsManual, projectId]);

  if (!activeStageId) {
    return (
      <div className="mb-3 rounded-lg border border-zinc-600/60 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
        Selecciona una etapa para editar BRD / To-Be.
      </div>
    );
  }

  const brdOk = !!stage?.brdApprovedAt;
  const tobeOk = !!stage?.toBeApprovedAt;

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-zinc-600/60 bg-zinc-900/40 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-zinc-200">BRD / To-Be / As-Is (etapa)</span>
        <span className="text-xs text-zinc-500">
          BRD {brdOk ? "✓ aprobado" : "—"} · To-Be {tobeOk ? "✓ aprobado" : "—"}
        </span>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-400">BRD (markdown)</label>
        <textarea
          value={brd}
          onChange={(e) => setBrd(e.target.value)}
          disabled={busy}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-zinc-600 bg-zinc-950/80 p-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500/70"
          placeholder="Problema, KPIs, alcance…"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveBrd()}>
            Guardar BRD
          </Button>
          <Button type="button" size="sm" disabled={busy || !brd.trim()} onClick={() => void approveBrd()}>
            Aprobar BRD
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-zinc-400">Manual To-Be</label>
        <textarea
          value={tobe}
          onChange={(e) => setTobe(e.target.value)}
          disabled={busy}
          rows={4}
          spellCheck={false}
          className="w-full rounded-md border border-zinc-600 bg-zinc-950/80 p-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500/70"
          placeholder="Lógica y comportamiento deseado…"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveTobe()}>
            Guardar To-Be
          </Button>
          <Button type="button" size="sm" disabled={busy || !tobe.trim()} onClick={() => void approveTobe()}>
            Aprobar To-Be
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs text-zinc-400">As-Is (mapa / proceso actual)</label>
          {isLegacyProject && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={asIsLoading}
              disabled={busy || codebaseDocChars < 400}
              onClick={() => void runLegacyAsIs()}
              title={codebaseDocChars < 400 ? "Genera primero la doc. partida del codebase (≥400 caracteres)." : undefined}
            >
              As-Is desde doc. partida
            </Button>
          )}
        </div>
        <textarea
          value={asis}
          onChange={(e) => setAsis(e.target.value)}
          disabled={busy}
          rows={3}
          spellCheck={false}
          className="w-full rounded-md border border-zinc-600 bg-zinc-950/80 p-2 font-mono text-xs text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500/70"
          placeholder="Opcional: proceso o código actual…"
        />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveAsis()}>
          Guardar As-Is
        </Button>
      </div>
    </div>
  );
}
