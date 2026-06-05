import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSHOP_BTN_SIZE_ICON } from "@/constants/workshopDocToolbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";

export interface WorkshopDocBubbleMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  requiresConfirmation?: {
    title: string;
    description: string;
    confirmLabel?: string;
  };
  variant?: "default" | "danger";
}

export interface WorkshopDocBubbleMenuProps {
  items: WorkshopDocBubbleMenuItem[];
  className?: string;
  triggerLabel?: string;
}

const MENU_WIDTH_CLASS = "w-[12.75rem]";

/** Closed FAB — primary fill at rest; stronger hover (works in light and dark via theme tokens). */
const menuTriggerClosedClass = cn(
  WORKSHOP_BTN_SIZE_ICON,
  "group inline-flex items-center justify-center rounded-2xl touch-manipulation",
  "border border-[color-mix(in_oklch,var(--primary)_45%,var(--border))]",
  "bg-[var(--primary)] text-[var(--primary-foreground)]",
  "shadow-[0_4px_16px_color-mix(in_oklch,var(--primary)_38%,transparent)]",
  "transition-[background-color,border-color,box-shadow,transform] duration-base",
  "hover:border-[color-mix(in_oklch,var(--primary)_55%,white)]",
  "hover:bg-[var(--primary-hover)]",
  "hover:shadow-[var(--shadow-gold),0_6px_24px_color-mix(in_oklch,var(--primary)_48%,transparent)]",
  "hover:scale-[1.06]",
  "active:scale-[0.98]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
);

const shellClass = cn(
  "pointer-events-auto origin-bottom-right overflow-hidden rounded-2xl border border-[var(--border)]",
  "bg-[color-mix(in_oklch,var(--card)_96%,var(--background))]",
  "shadow-[0_10px_32px_-4px_rgba(0,0,0,0.45)]",
  "ring-1 ring-[color-mix(in_oklch,var(--foreground)_7%,transparent)]",
  "transition-[transform,box-shadow,width] duration-350 ease-forge-spring",
);

const menuRowClass = cn(
  "group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
  "text-[13px] font-medium leading-tight text-[var(--foreground)]",
  "transition-[background-color,opacity,transform] duration-250 ease-forge-snappy",
  "hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset",
  "disabled:pointer-events-none disabled:opacity-40",
);

const menuIconSlotClass = cn(
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)]",
  "bg-[color-mix(in_oklch,var(--card)_70%,var(--muted))] text-[var(--muted-foreground)]",
  "transition-[background-color,border-color,color] duration-base",
  "group-hover:border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-foreground)]",
  "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
);

/**
 * Desktop floating doc actions — compact action sheet anchored bottom-right.
 */
export function WorkshopDocBubbleMenu({
  items,
  className,
  triggerLabel = "Acciones del documento",
}: WorkshopDocBubbleMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<WorkshopDocBubbleMenuItem | null>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, handleClose]);

  const runItem = useCallback(
    (item: WorkshopDocBubbleMenuItem) => {
      item.onClick();
      handleClose();
    },
    [handleClose],
  );

  const handleItemClick = useCallback(
    (item: WorkshopDocBubbleMenuItem) => {
      if (item.disabled) return;
      if (item.requiresConfirmation) {
        setPendingConfirm(item);
        return;
      }
      runItem(item);
    },
    [runItem],
  );

  if (items.length === 0) return null;

  return (
    <>
      <div
        ref={rootRef}
        className={cn(
          "pointer-events-none absolute bottom-5 right-5 z-20 hidden lg:block",
          className,
        )}
      >
        <div
          className={cn(
            shellClass,
            open
              ? cn(MENU_WIDTH_CLASS, "scale-100")
              : "w-9 scale-100 border-transparent bg-transparent p-0 shadow-none ring-0",
          )}
          aria-label={triggerLabel}
        >
          {/* Action list — expands upward */}
          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-350 ease-forge-snappy",
              open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
            aria-hidden={!open}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                role="menu"
                className={cn(
                  "flex flex-col gap-0.5 p-1.5 pb-1",
                  "origin-bottom transition-[transform,opacity] duration-300 ease-forge-pop",
                  open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                )}
              >
                {items.map((item, index) => {
                  const Icon = item.icon;
                  const isDanger = item.variant === "danger";
                  /** Stagger from the trigger upward (last item in list animates first). */
                  const staggerFromTrigger = items.length - 1 - index;
                  const openDelay = 40 + staggerFromTrigger * 42;
                  const closeDelay = staggerFromTrigger * 22;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className={cn(
                        menuRowClass,
                        open
                          ? "translate-y-0 scale-100 opacity-100"
                          : "translate-y-2 scale-[0.97] opacity-0",
                      )}
                      style={{
                        transitionDelay: open ? `${openDelay}ms` : `${closeDelay}ms`,
                      }}
                      disabled={item.disabled}
                      aria-label={item.label}
                      tabIndex={open ? 0 : -1}
                      onClick={() => handleItemClick(item)}
                    >
                      <span
                        className={cn(
                          menuIconSlotClass,
                          isDanger &&
                            "border-[color-mix(in_oklch,var(--destructive)_30%,var(--border))] text-[var(--destructive)] group-hover:border-[var(--destructive-hover)] group-hover:bg-[var(--destructive-hover)] group-hover:text-[var(--destructive-foreground)]",
                        )}
                      >
                        <Icon strokeWidth={2} aria-hidden />
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          isDanger && "text-[var(--destructive)] group-hover:text-[var(--destructive)]",
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Trigger / close — always aligned with panel width */}
          <button
            type="button"
            className={cn(
              open
                ? cn(
                    "flex h-9 w-full items-center justify-center gap-2 border-t border-[var(--border)]",
                    "text-xs font-medium text-[var(--muted-foreground)]",
                    "transition-colors hover:bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))]",
                  )
                : menuTriggerClosedClass,
            )}
            aria-label={open ? "Cerrar menú de acciones" : triggerLabel}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <>
                <X className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span>Cerrar</span>
              </>
            ) : (
              <Menu
                className="h-[18px] w-[18px] shrink-0 text-[var(--primary-foreground)]"
                strokeWidth={2.25}
                aria-hidden
              />
            )}
          </button>
        </div>
      </div>

      <AlertDialog
        open={pendingConfirm != null}
        onOpenChange={(next) => {
          if (!next) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirm?.requiresConfirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm?.requiresConfirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                pendingConfirm?.variant === "danger" &&
                  "bg-[var(--destructive)] hover:bg-[var(--destructive-hover)]",
              )}
              onClick={() => {
                if (pendingConfirm) runItem(pendingConfirm);
                setPendingConfirm(null);
              }}
            >
              {pendingConfirm?.requiresConfirmation?.confirmLabel ?? "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
