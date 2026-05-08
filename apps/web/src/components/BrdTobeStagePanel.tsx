import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui";
import MddViewer from "./MddViewer";
import { useWorkshopStore, type WorkshopStage } from "../store/workshopStore";

export interface BrdTobeStagePanelProps {
  projectId: string;
  /** `Project.requireBrdTobeGate`: si true, el API exige BRD+To-Be antes del MDD técnico. */
  requireBrdTobeGate: boolean;
  activeStageId: string | null;
  stage: WorkshopStage | undefined;
  isLegacyProject: boolean;
  codebaseDocChars: number;
  /** Greenfield: longitud de `project.dbgaContent` persistido (misma fuente que el POST suggest-brd-tobe-from-dbga). */
  dbgaContentChars: number;
  /** `full` = BRD + To-Be + As-Is + gate (legacy). `brd` / `tobe` = pestañas dedicadas del Workshop. `gate-only` = solo toggle bajo MDD. */
  panel?: "full" | "brd" | "tobe" | "gate-only";
  /** Workshop: BRD controlado (preview/fuente + Grabar en barra). Si se omite, estado interno (p. ej. `full`). */
  brdDraft?: string;
  onBrdDraftChange?: (value: string) => void;
  tobeDraft?: string;
  onTobeDraftChange?: (value: string) => void;
  asisDraft?: string;
  onAsisDraftChange?: (value: string) => void;
  /** `preview` = `MddViewer`; `fuente` = textarea. Solo pestañas dedicadas cuando el padre lo pasa. */
  docViewMode?: "preview" | "source";
}

/**
 * BRD / Manual To-Be / As-Is por etapa: edición vía PATCH y aprobaciones HITL.
 * Toggle proyecto **Exigir BRD/To-Be** (persistido; no env).
 * Legacy: As-Is y borradores BRD/To-Be desde doc. Ariadne (`codebaseDoc`).
 * Greenfield: borradores BRD/To-Be desde DBGA (`POST …/suggest-brd-tobe-from-dbga`).
 */
export function BrdTobeStagePanel({
  projectId,
  requireBrdTobeGate,
  activeStageId,
  stage,
  isLegacyProject,
  codebaseDocChars,
  dbgaContentChars,
  panel = "full",
  brdDraft,
  onBrdDraftChange,
  tobeDraft,
  onTobeDraftChange,
  asisDraft,
  onAsisDraftChange,
  docViewMode,
}: BrdTobeStagePanelProps) {
  const patchWorkshopStage = useWorkshopStore((s) => s.patchWorkshopStage);
  const setProjectRequireBrdTobeGate = useWorkshopStore((s) => s.setProjectRequireBrdTobeGate);
  const legacyGenerateAsIsManual = useWorkshopStore((s) => s.legacyGenerateAsIsManual);
  const legacySuggestBrdTobeFromCodebaseDoc = useWorkshopStore((s) => s.legacySuggestBrdTobeFromCodebaseDoc);
  const suggestBrdTobeFromDbga = useWorkshopStore((s) => s.suggestBrdTobeFromDbga);
  const generateMddFromBenchmark = useWorkshopStore((s) => s.generateMddFromBenchmark);
  const storeLoading = useWorkshopStore((s) => s.loading);
  const loadingReason = useWorkshopStore((s) => s.loadingReason);

  const [brdInternal, setBrdInternal] = useState("");
  const [tobeInternal, setTobeInternal] = useState("");
  const [asisInternal, setAsisInternal] = useState("");
  const [localBusy, setLocalBusy] = useState(false);

  const brdControlled = brdDraft !== undefined;
  const tobeControlled = tobeDraft !== undefined;
  const asisControlled = asisDraft !== undefined;

  const brd = brdControlled ? brdDraft! : brdInternal;
  const tobe = tobeControlled ? tobeDraft! : tobeInternal;
  const asis = asisControlled ? asisDraft! : asisInternal;

  const setBrd = useCallback(
    (v: string) => {
      if (onBrdDraftChange) onBrdDraftChange(v);
      else setBrdInternal(v);
    },
    [onBrdDraftChange],
  );
  const setTobe = useCallback(
    (v: string) => {
      if (onTobeDraftChange) onTobeDraftChange(v);
      else setTobeInternal(v);
    },
    [onTobeDraftChange],
  );
  const setAsis = useCallback(
    (v: string) => {
      if (onAsisDraftChange) onAsisDraftChange(v);
      else setAsisInternal(v);
    },
    [onAsisDraftChange],
  );

  useEffect(() => {
    if (brdControlled) return;
    setBrdInternal((stage?.brdContent ?? "").trim() ? (stage?.brdContent ?? "") : "");
  }, [brdControlled, stage?.id, stage?.brdContent]);

  useEffect(() => {
    if (tobeControlled) return;
    setTobeInternal((stage?.toBeManualContent ?? "").trim() ? (stage?.toBeManualContent ?? "") : "");
  }, [tobeControlled, stage?.id, stage?.toBeManualContent]);

  useEffect(() => {
    if (asisControlled) return;
    setAsisInternal((stage?.asIsManualContent ?? "").trim() ? (stage?.asIsManualContent ?? "") : "");
  }, [asisControlled, stage?.id, stage?.asIsManualContent]);

  const busy = localBusy || storeLoading;
  const asIsLoading = loadingReason === "legacy-as-is";
  const brdTobeSuggestLoading =
    loadingReason === "legacy-brd-tobe-suggest" || loadingReason === "brd-tobe-from-dbga";

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

  const runSuggestBrdTobe = useCallback(async () => {
    setLocalBusy(true);
    await legacySuggestBrdTobeFromCodebaseDoc(projectId, activeStageId ?? undefined);
    setLocalBusy(false);
  }, [legacySuggestBrdTobeFromCodebaseDoc, projectId, activeStageId]);

  const runSuggestBrdTobeFromDbga = useCallback(async () => {
    if (!activeStageId) return;
    setLocalBusy(true);
    await suggestBrdTobeFromDbga(projectId, { stageId: activeStageId });
    setLocalBusy(false);
  }, [activeStageId, projectId, suggestBrdTobeFromDbga]);

  const runGenerateMddFromBrd = useCallback(async () => {
    setLocalBusy(true);
    await generateMddFromBenchmark(projectId);
    setLocalBusy(false);
  }, [projectId, generateMddFromBenchmark]);

  const toggleRequireGate = useCallback(
    async (next: boolean) => {
      setLocalBusy(true);
      await setProjectRequireBrdTobeGate(projectId, next);
      setLocalBusy(false);
    },
    [projectId, setProjectRequireBrdTobeGate],
  );

  if (!activeStageId) {
    return (
      <div className="mb-3 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Selecciona una etapa para editar BRD / To-Be.
      </div>
    );
  }

  const brdOk = !!stage?.brdApprovedAt;
  const tobeOk = !!stage?.toBeApprovedAt;

  if (panel === "gate-only") {
    return (
      <div className="mb-3 space-y-3 rounded-xl border border-[var(--border)]/70 bg-[color-mix(in_oklch,var(--card)_36%,var(--background))] p-3 sm:p-4 text-sm">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)]/60 pb-2">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">BRD / To-Be</h2>
          <p className="text-xs text-[var(--muted-foreground)]" aria-live="polite">
            BRD {brdOk ? "aprobado" : "pendiente"} · To-Be {tobeOk ? "aprobado" : "pendiente"}
          </p>
        </div>
        <p className="text-sm leading-relaxed text-[var(--foreground-subtle)]">
          Edita en las pestañas <strong className="text-[var(--foreground)]">BRD</strong> y{" "}
          <strong className="text-[var(--foreground)]">To-Be</strong> de la barra superior (a la izquierda de MDD) y
          conversa en el chat por pestaña.
        </p>
        <fieldset className="space-y-0">
          <legend className="sr-only">Puerta BRD y To-Be antes del MDD técnico</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-transparent p-1 -m-1 hover:bg-[color-mix(in_oklch,var(--muted)_35%,transparent)] focus-within:ring-2 focus-within:ring-[var(--ring)] focus-within:ring-offset-2 focus-within:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))]">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] accent-[var(--primary)] focus:outline-none"
              checked={requireBrdTobeGate}
              disabled={busy}
              onChange={(e) => void toggleRequireGate(e.target.checked)}
            />
            <span className="min-w-0 text-sm leading-snug text-[var(--foreground)]">
              <span className="block font-semibold">Exigir BRD y Manual To-Be aprobados antes del MDD técnico (§3+)</span>
              <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--foreground-subtle)]">
                En proyectos legacy suele desactivarse para el MDD inicial; actívalo al entrar en una fase de mejora
                controlada.
              </span>
            </span>
          </label>
        </fieldset>
      </div>
    );
  }

  const title =
    panel === "brd" ? "BRD de cambio (etapa)" : panel === "tobe" ? "Manual To-Be de cambio / As-Is (etapa)" : "BRD de cambio / To-Be de cambio / As-Is (etapa)";
  const showGate = panel === "full";
  const showBrdBlock = panel === "full" || panel === "brd";
  const showTobeBlock = panel === "full" || panel === "tobe";
  const showAsIsBlock = panel === "full" || panel === "tobe";
  /** Pestañas dedicadas Workshop: el panel debe crecer en altura (flex) y los textareas absorben el espacio. */
  const fillWorkspace = panel === "brd" || panel === "tobe";

  const textareaGrowClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--background)]/80 p-2 font-mono text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_55%,transparent)] resize-none";

  const previewShellClass =
    "min-h-0 flex-1 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)]/30 p-2 text-[var(--foreground)]";

  const showBrdPreview = panel === "brd" && docViewMode === "preview";
  const showTobePreview = panel === "tobe" && docViewMode === "preview";
  const hideBrdInlineSave = brdControlled;
  const hideTobeInlineSaves = tobeControlled && asisControlled;

  return (
    <div
      className={
        fillWorkspace
          ? "flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 p-3 text-sm"
          : "mb-3 space-y-3 rounded-lg border border-[var(--border)]/60 bg-[var(--background)]/40 p-3 text-sm"
      }
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[var(--foreground)]">{title}</span>
        <span className="text-xs text-[var(--foreground-subtle)]">
          BRD {brdOk ? "✓ aprobado" : "—"} · To-Be {tobeOk ? "✓ aprobado" : "—"}
        </span>
      </div>

      {showGate ? (
        <fieldset className="shrink-0 space-y-0 rounded-lg border border-[var(--border)]/50 bg-[color-mix(in_oklch,var(--background)_50%,var(--card))] p-3">
          <legend className="sr-only">Puerta BRD y To-Be antes del MDD técnico</legend>
          <label className="flex cursor-pointer gap-3 focus-within:outline-none">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0 rounded border-[var(--border)] bg-[var(--background)] text-[var(--primary)] accent-[var(--primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
              checked={requireBrdTobeGate}
              disabled={busy}
              onChange={(e) => void toggleRequireGate(e.target.checked)}
            />
            <span className="min-w-0 text-sm leading-snug text-[var(--foreground)]">
              <span className="block font-semibold">Exigir BRD y Manual To-Be aprobados antes del MDD técnico (§3+)</span>
              <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--foreground-subtle)]">
                En proyectos legacy suele desactivarse para el MDD inicial; actívalo al entrar en una fase de mejora
                controlada.
              </span>
            </span>
          </label>
        </fieldset>
      ) : null}

      {showBrdBlock ? (
      <div className={panel === "brd" ? "flex min-h-0 flex-1 flex-col gap-1" : "space-y-1"}>
        <label className="shrink-0 text-xs text-[var(--muted-foreground)]">BRD (markdown)</label>
        {showBrdPreview ? (
          <div className={(panel === "brd" ? "flex min-h-0 flex-1 flex-col " : "") + previewShellClass}>
            <MddViewer content={brd} />
          </div>
        ) : (
          <textarea
            value={brd}
            onChange={(e) => setBrd(e.target.value)}
            disabled={busy}
            rows={panel === "brd" ? undefined : 4}
            spellCheck={false}
            className={
              panel === "brd"
                ? `${textareaGrowClass} min-h-[10rem] flex-1`
                : `w-full rounded-md border border-[var(--border)] bg-[var(--background)]/80 p-2 font-mono text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_55%,transparent)]`
            }
            placeholder="Problema, KPIs, alcance…"
          />
        )}
        <div className="flex shrink-0 flex-wrap gap-2">
          {!hideBrdInlineSave ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveBrd()}>
              Guardar BRD
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={busy || !brd.trim()} onClick={() => void approveBrd()}>
            Aprobar BRD
          </Button>
        </div>
        {panel === "brd" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border)]/60 pt-2">
            {isLegacyProject ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={brdTobeSuggestLoading}
                  disabled={busy || codebaseDocChars < 300}
                  onClick={() => void runSuggestBrdTobe()}
                  title={
                    codebaseDocChars < 300
                      ? "Genera primero la doc. partida del codebase (≥300 caracteres)."
                      : "Borradores desde Ariadne; revisa pestaña To-Be también."
                  }
                >
                  Generar BRD desde doc. partida
                </Button>
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
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={loadingReason === "brd-tobe-from-dbga"}
                  disabled={busy || dbgaContentChars < 300}
                  onClick={() => void runSuggestBrdTobeFromDbga()}
                  title={
                    dbgaContentChars < 300
                      ? "Genera o guarda el DBGA en el Paso 0 (≥300 caracteres)."
                      : "Regenerar BRD + To-Be completos desde el Domain Benchmark."
                  }
                >
                  BRD + To-Be desde DBGA
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={loadingReason === "mdd"}
                  disabled={busy || !brd.trim()}
                  onClick={() => void runGenerateMddFromBrd()}
                  title="Generar MDD desde el BRD y Benchmark"
                >
                  Generar MDD
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>
      ) : null}

      {panel === "tobe" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <label className="shrink-0 text-xs text-[var(--muted-foreground)]">Manual To-Be</label>
            {showTobePreview ? (
              <div className={"flex min-h-0 flex-1 flex-col " + previewShellClass}>
                <MddViewer content={tobe} />
              </div>
            ) : (
              <textarea
                value={tobe}
                onChange={(e) => setTobe(e.target.value)}
                disabled={busy}
                spellCheck={false}
                className={`${textareaGrowClass} min-h-[10rem] flex-1`}
                placeholder="Lógica y comportamiento deseado…"
              />
            )}
            <div className="flex shrink-0 flex-wrap gap-2">
              {!hideTobeInlineSaves ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveTobe()}>
                  Guardar To-Be
                </Button>
              ) : null}
              <Button type="button" size="sm" disabled={busy || !tobe.trim()} onClick={() => void approveTobe()}>
                Aprobar To-Be
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <label className="text-xs text-[var(--muted-foreground)]">As-Is (mapa / proceso actual)</label>
              {isLegacyProject ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={brdTobeSuggestLoading}
                    disabled={busy || codebaseDocChars < 300}
                    onClick={() => void runSuggestBrdTobe()}
                    title={
                      codebaseDocChars < 300
                        ? "Genera primero la doc. partida del codebase (≥300 caracteres)."
                        : "Borradores desde Ariadne; revisa y aprueba después."
                    }
                  >
                    Generar To-Be desde doc. partida
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={asIsLoading}
                    disabled={busy || codebaseDocChars < 400}
                    onClick={() => void runLegacyAsIs()}
                    title={
                      codebaseDocChars < 400 ? "Genera primero la doc. partida del codebase (≥400 caracteres)." : undefined
                    }
                  >
                    As-Is desde doc. partida
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={loadingReason === "brd-tobe-from-dbga"}
                  disabled={busy || dbgaContentChars < 300}
                  onClick={() => void runSuggestBrdTobeFromDbga()}
                  title={
                    dbgaContentChars < 300
                      ? "Genera o guarda el DBGA en el Paso 0 (≥300 caracteres)."
                      : "Borradores desde Domain Benchmark; revisa y aprueba después."
                  }
                >
                  Generar To-Be
                </Button>
              )}
            </div>
            {showTobePreview ? (
              <div className={"flex min-h-0 flex-1 flex-col " + previewShellClass}>
                <MddViewer content={asis} />
              </div>
            ) : (
              <textarea
                value={asis}
                onChange={(e) => setAsis(e.target.value)}
                disabled={busy}
                spellCheck={false}
                className={`${textareaGrowClass} min-h-[8rem] flex-1`}
                placeholder="Opcional: proceso o código actual…"
              />
            )}
            {!hideTobeInlineSaves ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                className="shrink-0 self-start"
                onClick={() => void saveAsis()}
              >
                Guardar As-Is
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {showTobeBlock ? (
            <div className="space-y-1">
              <label className="text-xs text-[var(--muted-foreground)]">Manual To-Be</label>
              <textarea
                value={tobe}
                onChange={(e) => setTobe(e.target.value)}
                disabled={busy}
                rows={4}
                spellCheck={false}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)]/80 p-2 font-mono text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_55%,transparent)]"
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
          ) : null}

          {showAsIsBlock ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs text-[var(--muted-foreground)]">As-Is (mapa / proceso actual)</label>
                {isLegacyProject ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={brdTobeSuggestLoading}
                      disabled={busy || codebaseDocChars < 300}
                      onClick={() => void runSuggestBrdTobe()}
                      title={
                        codebaseDocChars < 300
                          ? "Genera primero la doc. partida del codebase (≥300 caracteres)."
                          : "Borradores desde Ariadne; revisa y aprueba después."
                      }
                    >
                      BRD + To-Be desde doc. partida
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={asIsLoading}
                      disabled={busy || codebaseDocChars < 400}
                      onClick={() => void runLegacyAsIs()}
                      title={
                        codebaseDocChars < 400 ? "Genera primero la doc. partida del codebase (≥400 caracteres)." : undefined
                      }
                    >
                      As-Is desde doc. partida
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={loadingReason === "brd-tobe-from-dbga"}
                    disabled={busy || dbgaContentChars < 300}
                    onClick={() => void runSuggestBrdTobeFromDbga()}
                    title={
                      dbgaContentChars < 300
                        ? "Genera o guarda el DBGA en el Paso 0 (≥300 caracteres)."
                        : "Borradores desde Domain Benchmark; revisa y aprueba después."
                    }
                  >
                    BRD + To-Be desde DBGA
                  </Button>
                )}
              </div>
              <textarea
                value={asis}
                onChange={(e) => setAsis(e.target.value)}
                disabled={busy}
                rows={3}
                spellCheck={false}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)]/80 p-2 font-mono text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--primary)_55%,transparent)]"
                placeholder="Opcional: proceso o código actual…"
              />
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void saveAsis()}>
                Guardar As-Is
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
