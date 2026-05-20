import { cn } from "@/lib/utils";

/** Stage selector + “Nueva etapa” (primary controls with a light frame). */
export const WORKSHOP_HEADER_CTL =
  "h-11 min-h-[44px] sm:h-9 sm:min-h-0 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_78%,var(--muted))] text-sm font-medium text-[var(--foreground)] shadow-sm transition-[background-color,border-color,color] touch-manipulation";

export const WORKSHOP_HEADER_CTL_HOVER =
  "hover:bg-[color-mix(in_oklch,var(--muted)_52%,var(--card))] hover:border-[color-mix(in_oklch,var(--border)_88%,var(--foreground))]";

/** Workshop header: framed square icon controls (etapas, ZIP, Hermes, Ayuda). */
export const WORKSHOP_HEADER_ICON_BTN = cn(
  WORKSHOP_HEADER_CTL,
  WORKSHOP_HEADER_CTL_HOVER,
  "inline-flex w-11 shrink-0 items-center justify-center p-0 sm:w-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))]",
);
