/**
 * @fileoverview Folder tile with layered pocket, document peek on hover, and compact metadata.
 */
import { Check, GitBranch, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectFolderStatus = "ROJO" | "AMARILLO" | "VERDE";

export interface ProjectFolderTileProps {
  id: string;
  name: string;
  status: ProjectFolderStatus;
  precisionScore: number;
  projectType?: "NEW" | "LEGACY";
  visibility?: "PRIVATE" | "SHARED";
  selected: boolean;
  selectable: boolean;
  isFavorite?: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleFavorite?: (id: string) => void;
}

const statusDotClass: Record<ProjectFolderStatus, string> = {
  ROJO: "bg-[var(--destructive)]",
  AMARILLO: "bg-[var(--warning)]",
  VERDE: "bg-[var(--success)]",
};

const statusLabelEs: Record<ProjectFolderStatus, string> = {
  ROJO: "Semáforo rojo",
  AMARILLO: "Semáforo amarillo",
  VERDE: "Semáforo verde",
};

/**
 * Layered folder with papers that slide up on `group-hover` (parent must have `group`).
 */
function FolderWithPeekPapers() {
  return (
    <div className="relative mx-auto h-[5.75rem] w-[7rem] shrink-0 select-none" aria-hidden>
      {/* Folder back + tab (single silhouette feel) */}
      <div className="absolute inset-x-0 top-[0.65rem] bottom-0 rounded-xl bg-[#3a3a3e] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
      <div className="absolute left-[0.35rem] top-[0.4rem] z-[1] h-[0.65rem] w-[42%] rounded-t-[10px] bg-[#45454b] shadow-sm ring-1 ring-white/[0.04]" />

      {/* Pocket: papers clipped; on hover they slide up (staggered end positions). */}
      <div className="absolute left-[10%] right-[10%] top-[1.35rem] z-[2] h-[2.45rem] overflow-hidden rounded-b-md">
        <div className="flex h-full flex-col items-center justify-end gap-[3px] pb-0 will-change-transform">
          {/* Sheet 3 (back) */}
          <div
            className={cn(
              "h-5 w-[86%] rounded-[5px] border border-zinc-400/25 bg-zinc-100/95 shadow-md will-change-transform",
              "translate-y-10 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] dark:border-zinc-500/40 dark:bg-zinc-200/95",
              "opacity-80 group-hover:translate-y-1 group-hover:opacity-100",
              "motion-reduce:translate-y-1 motion-reduce:opacity-100 motion-reduce:transition-none",
            )}
          />
          {/* Sheet 2 */}
          <div
            className={cn(
              "h-5 w-[90%] translate-x-px rounded-[5px] border border-zinc-400/35 bg-white shadow-md will-change-transform",
              "translate-y-11 transition-[transform] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] dark:border-zinc-500/55 dark:bg-zinc-50",
              "group-hover:translate-y-0.5",
              "motion-reduce:translate-y-0.5 motion-reduce:transition-none",
            )}
          />
          {/* Sheet 1 (front) + PDF chip */}
          <div
            className={cn(
              "relative h-6 w-[94%] rounded-[6px] border border-zinc-300/70 bg-white shadow-lg will-change-transform",
              "translate-y-12 transition-[transform] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] dark:border-zinc-500/65 dark:bg-white",
              "group-hover:translate-y-0",
              "motion-reduce:translate-y-0 motion-reduce:transition-none",
            )}
          >
            <span className="absolute left-2 top-1 rounded px-1 py-px text-[6px] font-bold uppercase leading-none tracking-wide text-white shadow-sm bg-red-500">
              PDF
            </span>
          </div>
        </div>
      </div>

      {/* Front flap (covers lower pocket — papers slide from behind) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[52%] rounded-b-xl rounded-t-sm bg-gradient-to-b from-[#4a4a50] to-[#353539] shadow-[0_-2px_8px_rgba(0,0,0,0.35)] ring-1 ring-white/[0.05]"
        style={{
          clipPath: "polygon(0 18%, 12% 0, 100% 0, 100% 100%, 0 100%)",
        }}
      />

      {/* Subtle inner lip line */}
      <div className="pointer-events-none absolute inset-x-[8%] bottom-[48%] z-[4] h-px bg-black/25 dark:bg-white/10" />
    </div>
  );
}

export function ProjectFolderTile({
  id,
  name,
  status,
  precisionScore,
  projectType,
  visibility,
  selected,
  selectable,
  isFavorite,
  onOpen,
  onToggleSelect,
  onToggleFavorite,
}: ProjectFolderTileProps) {
  const typeIsNew = (projectType ?? "NEW") === "NEW";
  const isShared = visibility === "SHARED";
  const selectId = `select-project-${id}`;
  const visibilityLabel = isShared ? "Compartido" : "Privado";
  const subtitle = `${precisionScore}% precisión · ${statusLabelEs[status]} · ${visibilityLabel}`;

  return (
    <article
      className={cn(
        "group relative rounded-2xl border border-transparent p-3 transition-colors duration-200 motion-reduce:transition-none",
        "hover:bg-[color-mix(in_oklch,var(--muted)_65%,transparent)]",
        selected && "border-[var(--primary)]/50 bg-[color-mix(in_oklch,var(--primary)_10%,var(--muted))] ring-2 ring-[var(--primary)]/35 ring-offset-2 ring-offset-[var(--background)]",
      )}
    >
      {selectable ? (
        <div
          className="absolute left-2 top-2 z-30 flex items-center"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            id={selectId}
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect()}
            className="peer sr-only"
            aria-label={`Seleccionar carpeta ${name}`}
          />
          <label
            htmlFor={selectId}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border shadow-md backdrop-blur-md transition-all duration-150",
              "border-[color-mix(in_oklch,var(--foreground)_14%,var(--border))] bg-[color-mix(in_oklch,var(--card)_88%,var(--background))]",
              "hover:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] hover:bg-[color-mix(in_oklch,var(--muted)_70%,var(--card))]",
              "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--background)]",
              selected &&
                "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_88%,black)] text-[var(--primary-foreground)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]",
            )}
          >
            <Check
              className={cn(
                "h-4 w-4 shrink-0 stroke-[2.75] transition-[opacity,transform] duration-150",
                selected ? "scale-100 opacity-100" : "scale-50 opacity-0",
              )}
              aria-hidden
            />
          </label>
        </div>
      ) : null}

      {/* Heart — favoritos */}
      {onToggleFavorite && (
        <div
          className="absolute right-2 top-2 z-30"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleFavorite(id); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Heart
            className={cn(
              "h-5 w-5 cursor-pointer transition-all duration-150",
              isFavorite
                ? "scale-100 text-red-500"
                : "scale-100 text-[var(--foreground-muted)] hover:scale-110 hover:text-red-400",
            )}
            fill={isFavorite ? "currentColor" : "none"}
            strokeWidth={isFavorite ? 2 : 1.5}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl px-1 pb-1 pt-2 text-center outline-none transition-transform duration-200",
          "group-hover:scale-[1.02] active:scale-[0.99] motion-reduce:group-hover:scale-100 motion-reduce:active:scale-100",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          selectable ? "pt-8" : "pt-2",
        )}
        aria-label={`Abrir proyecto ${name}, ${statusLabelEs[status]}, precisión ${precisionScore} por ciento`}
      >
        <div className="relative w-full">
          <FolderWithPeekPapers />

          {/* Overlapping “integration” badges — tipo + semáforo */}
          <div className="pointer-events-none absolute bottom-[0.15rem] left-1/2 z-20 flex -translate-x-1/2 translate-y-1/2 items-center">
            <div className="flex -space-x-1.5">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--background)] shadow-md",
                  typeIsNew ? "bg-emerald-500 text-white" : "bg-amber-500 text-white",
                )}
                title={typeIsNew ? "Proyecto nuevo" : "Legacy"}
              >
                {typeIsNew ? <Sparkles className="h-3 w-3" strokeWidth={2.5} /> : <GitBranch className="h-3 w-3" strokeWidth={2.5} />}
              </span>
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--background)] shadow-md ring-1 ring-black/10",
                  "bg-[var(--card)]",
                )}
                title={statusLabelEs[status]}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full", statusDotClass[status])} />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 w-full min-w-0 px-0.5">
          <p className="line-clamp-2 text-center text-[0.9375rem] font-semibold leading-snug tracking-tight text-[var(--foreground)]">
            {name}
          </p>
          <p className="mt-1 line-clamp-2 text-center text-xs leading-snug text-[var(--foreground-muted)]">{subtitle}</p>
        </div>
      </button>
    </article>
  );
}
