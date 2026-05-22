import { Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { ListRowIconButton } from "@/components/ListRowIconButton";
import { ProviderLogo, getProviderLabel } from "@/components/ProviderLogo";
import type { ProviderInstanceSummary } from "@/types/user-providers";
import { cn } from "@/lib/utils";

export interface ProviderInstanceCardProps {
  inst: ProviderInstanceSummary;
  isActive: boolean;
  isDeveloper: boolean;
  isSuperAdmin: boolean;
  canManage: boolean;
  canMutate: boolean;
  togglingId: string | null;
  activatingId: string | null;
  onToggleVisibleForTeam: () => void;
  onSetActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Mobile: stacked card with bottom action bar (unchanged UX). */
export function ProviderInstanceCardMobile(props: ProviderInstanceCardProps) {
  const {
    inst,
    isActive,
    isDeveloper,
    isSuperAdmin,
    canManage,
    canMutate,
    togglingId,
    activatingId,
    onToggleVisibleForTeam,
    onSetActive,
    onEdit,
    onDelete,
  } = props;
  const providerLabel = getProviderLabel(inst.providerType);
  const showUseAction = !isDeveloper && !isActive;
  const actionCols =
    (showUseAction ? 1 : 0) + (isDeveloper && isActive ? 1 : 0) + (canMutate ? 2 : 0);
  const actionGridClass =
    actionCols === 1
      ? "grid-cols-1"
      : actionCols === 2
        ? "grid-cols-2"
        : actionCols === 3
          ? "grid-cols-3"
          : "grid-cols-4";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-[var(--card)] shadow-[0_4px_20px_rgba(0,0,0,0.12)] sm:hidden",
        isActive
          ? "border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] ring-1 ring-[var(--primary)]/25"
          : "border-[var(--border)]",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <ProviderLogo provider={inst.providerType} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-[15px] font-semibold text-[var(--foreground)]">
                {inst.displayName}
              </p>
              {isActive ? (
                <span className="shrink-0 rounded-full bg-[var(--primary)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary-foreground)]">
                  Activa
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--foreground-muted)]">{providerLabel}</p>
          </div>
          <p className="mt-2 truncate font-mono text-[11px] text-[var(--foreground-muted)]">
            {inst.chatModel}
          </p>
          {isSuperAdmin && canManage ? (
            <label className="mt-3 flex cursor-pointer items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={inst.enabledForUsers}
                aria-label="Visible para el equipo"
                disabled={togglingId === inst.id}
                onClick={onToggleVisibleForTeam}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50",
                  inst.enabledForUsers
                    ? "bg-[var(--primary)]"
                    : "bg-[color-mix(in_oklch,var(--muted-foreground)_25%,var(--border))]",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    inst.enabledForUsers ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
              <span className="text-xs text-[var(--foreground-muted)]">Visible para el equipo</span>
              {togglingId === inst.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
            </label>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "grid border-t border-[var(--border)]",
          actionCols > 0 ? cn(actionGridClass, "divide-x divide-[var(--border)]") : "hidden",
        )}
      >
        {showUseAction ? (
          <button
            type="button"
            disabled={activatingId === inst.id}
            onClick={onSetActive}
            className="flex min-h-[3rem] flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium text-[var(--foreground-muted)] transition-colors active:bg-[var(--muted)]"
          >
            {activatingId === inst.id ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Star className="h-5 w-5" aria-hidden />
            )}
            Usar
          </button>
        ) : isDeveloper && isActive ? (
          <div className="flex min-h-[3rem] items-center justify-center px-3 py-2.5 text-xs font-medium text-[var(--foreground-muted)]">
            Predeterminado del equipo
          </div>
        ) : null}
        {canMutate ? (
          <>
            <button
              type="button"
              className="flex min-h-[3rem] flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium text-[var(--foreground-muted)] active:bg-[var(--muted)]"
              onClick={onEdit}
            >
              <Pencil className="h-5 w-5" aria-hidden />
              Editar
            </button>
            <button
              type="button"
              className="flex min-h-[3rem] flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium text-[var(--destructive)] active:bg-[var(--destructive)]/10"
              onClick={onDelete}
            >
              <Trash2 className="h-5 w-5" aria-hidden />
              Eliminar
            </button>
          </>
        ) : null}
      </div>
    </article>
  );
}

/** Desktop: compact tech card — horizontal layout, inline actions. */
export function ProviderInstanceCardDesktop(props: ProviderInstanceCardProps) {
  const {
    inst,
    isActive,
    isDeveloper,
    isSuperAdmin,
    canManage,
    canMutate,
    togglingId,
    activatingId,
    onToggleVisibleForTeam,
    onSetActive,
    onEdit,
    onDelete,
  } = props;
  const providerLabel = getProviderLabel(inst.providerType);

  return (
    <article
      className={cn(
        "group relative hidden flex-col overflow-hidden rounded-xl border bg-[var(--card)] transition-all sm:flex",
        "hover:border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
        isActive
          ? "border-[color-mix(in_oklch,var(--primary)_50%,var(--border))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
          : "border-[var(--border)]",
      )}
    >
      {isActive ? (
        <div
          className="absolute inset-y-0 left-0 w-1 bg-[var(--primary)]"
          aria-hidden
        />
      ) : null}

      <div className="flex items-start gap-3.5 p-4 pl-5">
        <ProviderLogo provider={inst.providerType} size="md" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--foreground)]">
                {inst.displayName}
              </p>
              {isActive ? (
                <span className="shrink-0 rounded-md bg-[color-mix(in_oklch,var(--primary)_18%,var(--card))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
                  Activa
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs text-[var(--foreground-muted)]">{providerLabel}</p>
          </div>
          <p className="truncate rounded-md bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))] px-2 py-1 font-mono text-[11px] text-[var(--foreground-muted)]">
            {inst.chatModel}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-center opacity-95 transition-opacity group-hover:opacity-100">
          {!isDeveloper && !isActive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-3"
              disabled={activatingId === inst.id}
              onClick={onSetActive}
            >
              {activatingId === inst.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Star className="h-3.5 w-3.5" aria-hidden />
              )}
              Usar
            </Button>
          ) : isDeveloper && isActive ? (
            <span className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground-muted)]">
              Default equipo
            </span>
          ) : null}
          {canMutate ? (
            <>
              <ListRowIconButton tooltip="Editar instancia" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </ListRowIconButton>
              <ListRowIconButton
                tooltip="Eliminar instancia"
                className="text-[var(--destructive)] hover:text-[var(--destructive)]"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </ListRowIconButton>
            </>
          ) : null}
        </div>
      </div>

      {isSuperAdmin && canManage ? (
        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_22%,var(--card))] px-4 py-2.5 pl-5">
          <span className="text-xs text-[var(--foreground-muted)]">Visible para el equipo</span>
          <label className="flex cursor-pointer items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={inst.enabledForUsers}
              aria-label="Visible para el equipo"
              disabled={togglingId === inst.id}
              onClick={onToggleVisibleForTeam}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-50",
                inst.enabledForUsers
                  ? "bg-[var(--primary)]"
                  : "bg-[color-mix(in_oklch,var(--muted-foreground)_25%,var(--border))]",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  inst.enabledForUsers ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
            {togglingId === inst.id ? (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--foreground-muted)]" aria-hidden />
            ) : null}
          </label>
        </div>
      ) : null}
    </article>
  );
}
