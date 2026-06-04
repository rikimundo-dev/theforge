/**
 * Selector de patrones de desarrollo (SSOT): primera generación o edición sin regenerar el MDD.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  buildGovernanceBodySelectedOnly,
  buildMddWithGovernanceSkeleton,
  listGovernancePatternOptions,
  selectedPatternIdsFromMdd,
  updateMddGovernancePatterns,
} from "@theforge/shared-types/mdd-governance-patterns";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { UnderlineTabs, type UnderlineTabItem } from "@/components/ui/UnderlineTabs";
import { cn } from "@/lib/utils";

export type MddPatternsWizardMode = "initial" | "edit";

export interface MddPatternsWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: MddPatternsWizardMode;
  /** MDD actual (preselección de [X] y, en modo edit, documento a fusionar). */
  initialMddContent?: string | null;
  /** Preselección tras análisis Fase 0 / Benchmark / BRD (prioridad sobre initialMddContent). */
  preselectedIds?: ReadonlySet<string> | null;
  /** Analizando documentos antes de mostrar opciones. */
  analyzing?: boolean;
  analyzeMessage?: string | null;
  loading?: boolean;
  onConfirm: (markdown: string, selectedIds: ReadonlySet<string>) => void | Promise<void>;
}

function parseGovernanceGroupTab(group: string, index: number): { id: string; label: string; shortLabel: string } {
  const num = group.match(/(\d+)\./)?.[1] ?? String(index + 1);
  const title = group.replace(/^[\s\S]*?\d+\.\s*/, "").trim();
  const simplified = title
    .replace(/^PATRONES DE /i, "")
    .replace(/^PATRONES /i, "")
    .split(":")[0]!
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const shortMap: Record<string, string> = {
    "1": "Arq.",
    "2": "Crea.",
    "3": "Estr.",
    "4": "Comp.",
    "5": "Pers.",
    "6": "Integ.",
  };

  return {
    id: `g-${num}`,
    label: simplified,
    shortLabel: shortMap[num] ?? num,
  };
}

function PatternOptionList({
  items,
  selected,
  onToggle,
}: {
  items: ReturnType<typeof listGovernancePatternOptions>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <label
            className={cn(
              "flex gap-3 rounded-md border border-border/60 p-3 cursor-pointer hover:bg-muted/40",
              selected.has(item.id) && "border-primary/50 bg-primary/5",
            )}
          >
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={selected.has(item.id)}
              onChange={() => onToggle(item.id)}
            />
            <span className="text-sm leading-snug">
              <span className="font-medium">{item.label}</span>
              {item.description ? (
                <span className="text-muted-foreground"> — {item.description}</span>
              ) : null}
              {item.affects ? (
                <span className="block text-xs text-muted-foreground mt-1">
                  Afecta a: {item.affects}
                </span>
              ) : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export function MddPatternsWizardDialog({
  open,
  onOpenChange,
  mode = "initial",
  initialMddContent,
  preselectedIds = null,
  analyzing = false,
  analyzeMessage,
  loading = false,
  onConfirm,
}: MddPatternsWizardDialogProps) {
  const options = useMemo(() => listGovernancePatternOptions(), []);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const o of options) {
      const list = map.get(o.group) ?? [];
      list.push(o);
      map.set(o.group, list);
    }
    return [...map.entries()];
  }, [options]);

  const groupTabs = useMemo(
    () => grouped.map(([group, items], index) => ({ ...parseGovernanceGroupTab(group, index), group, items })),
    [grouped],
  );

  const [selected, setSelected] = useState<Set<string>>(() =>
    selectedPatternIdsFromMdd(initialMddContent ?? ""),
  );
  const [activeGroupId, setActiveGroupId] = useState<string>(() => groupTabs[0]?.id ?? "");

  useEffect(() => {
    if (!open || analyzing) return;
    if (preselectedIds && preselectedIds.size > 0) {
      setSelected(new Set(preselectedIds));
      return;
    }
    setSelected(selectedPatternIdsFromMdd(initialMddContent ?? ""));
  }, [open, analyzing, initialMddContent, preselectedIds]);

  useEffect(() => {
    if (!open || analyzing || groupTabs.length === 0) return;
    setActiveGroupId((prev) => (groupTabs.some((t) => t.id === prev) ? prev : groupTabs[0]!.id));
  }, [open, analyzing, groupTabs]);

  const selectedCountByGroup = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tab of groupTabs) {
      counts.set(tab.id, tab.items.filter((item) => selected.has(item.id)).length);
    }
    return counts;
  }, [groupTabs, selected]);

  const tabItems: UnderlineTabItem<string>[] = useMemo(
    () =>
      groupTabs.map(({ id, label, shortLabel }) => {
        const count = selectedCountByGroup.get(id) ?? 0;
        return {
          id,
          label: (
            <span className="inline-flex items-center gap-1.5">
              {label}
              {count > 0 ? (
                <span className="rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                  {count}
                </span>
              ) : null}
            </span>
          ),
          shortLabel,
        };
      }),
    [groupTabs, selectedCountByGroup],
  );

  const activeGroup = groupTabs.find((t) => t.id === activeGroupId) ?? groupTabs[0];

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    const body = buildGovernanceBodySelectedOnly(selected);
    const markdown =
      mode === "edit"
        ? updateMddGovernancePatterns((initialMddContent ?? "").trim(), selected)
        : buildMddWithGovernanceSkeleton("Master Design Document", body);
    await onConfirm(markdown, selected);
  }, [mode, onConfirm, selected, initialMddContent]);

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={loading || analyzing ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>
            {isEdit ? "Editar patrones de desarrollo (SSOT)" : "Patrones de desarrollo (SSOT)"}
          </DialogTitle>
          <DialogDescription>
            {analyzing ? (
              analyzeMessage ??
              "Analizando Fase 0, Benchmark y BRD para proponer patrones…"
            ) : isEdit ? (
              <>
                Solo se actualiza la sección <strong>[ARQUITECTURA - SECCIÓN INMUTABLE]</strong>. Las
                secciones §1–§7 del MDD no se regeneran.
              </>
            ) : (
              <>
                Primera vez: preselección desde Fase 0 / Benchmark / BRD. Solo los patrones marcados van al
                MDD. Para regenerar sin volver a elegir, usa «Regenerar MDD»; para empezar de cero, «Limpiar
                MDD».
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {analyzing ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-center max-w-md">
              {analyzeMessage ??
                "Analizando DBGA (Fase 0), resumen de benchmark y BRD para preseleccionar patrones…"}
            </p>
          </div>
        ) : (
          <>
            <UnderlineTabs
              className="px-6 shrink-0"
              idPrefix="mdd-patterns"
              ariaLabel="Categorías de patrones"
              tabs={tabItems}
              value={activeGroupId}
              onValueChange={setActiveGroupId}
            />
            <div
              className="flex-1 overflow-y-auto px-6 py-3 min-h-0"
              role="tabpanel"
              id={`mdd-patterns-panel-${activeGroupId}`}
              aria-labelledby={`mdd-patterns-tab-${activeGroupId}`}
            >
              {activeGroup ? (
                <PatternOptionList
                  items={activeGroup.items}
                  selected={selected}
                  onToggle={toggle}
                />
              ) : null}
            </div>
            <p className="px-6 pb-1 text-xs text-muted-foreground shrink-0">
              {selected.size === 0
                ? "Ningún patrón seleccionado."
                : `${selected.size} patrón${selected.size === 1 ? "" : "es"} seleccionado${selected.size === 1 ? "" : "s"} en total.`}
            </p>
          </>
        )}
        <DialogFooter className="px-6 py-4 shrink-0 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading || analyzing}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading || analyzing || selected.size === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : isEdit ? (
              "Guardar patrones"
            ) : (
              "Continuar y generar MDD"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
