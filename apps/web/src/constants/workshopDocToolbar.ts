import { cn } from "@/lib/utils";

/** Preview/source toggle, print, regen: outline chip matching `Button variant="outline" size="icon"`. */
export const WORKSHOP_DOC_TOOLBAR_ICON_BTN =
  "rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_65%,var(--muted))] text-[var(--foreground)] shadow-sm hover:border-[var(--border-hover)] hover:bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] hover:text-[var(--primary)] focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))]";

/** Same chrome as `Button size="icon"` + `WORKSHOP_DOC_TOOLBAR_ICON_BTN` for native `<button>` triggers. */
export const WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:pointer-events-none disabled:opacity-50",
  WORKSHOP_DOC_TOOLBAR_ICON_BTN,
);

const WORKSHOP_PANEL_ACTION_BASE =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition-[background-color,border-color,color,box-shadow] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:cursor-not-allowed disabled:opacity-50";

/** Primary CTA inside document panels (e.g. Generar BRD, Generar Benchmark). */
export const WORKSHOP_PANEL_ACTION_PRIMARY = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]",
);

/** Secondary actions in document panels. */
export const WORKSHOP_PANEL_ACTION_SECONDARY = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_65%,var(--muted))] text-[var(--foreground)] hover:border-[var(--border-hover)] hover:bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] hover:text-[var(--primary)]",
);

/** Destructive actions in document panels (e.g. Borrar Fase 0). */
export const WORKSHOP_PANEL_ACTION_DANGER = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[color-mix(in_oklch,var(--destructive)_28%,var(--border))] bg-[color-mix(in_oklch,var(--card)_65%,var(--muted))] text-[var(--foreground)] hover:border-[color-mix(in_oklch,var(--destructive)_45%,var(--border))] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))] hover:text-[color-mix(in_oklch,var(--destructive)_88%,var(--foreground))]",
);
