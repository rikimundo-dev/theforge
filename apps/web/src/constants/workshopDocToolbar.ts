import { cn } from "@/lib/utils";

/** Altura única para botones con texto en el Workshop (36px). */
export const WORKSHOP_BTN_SIZE_ACTION = "h-9 min-h-9 px-3 text-sm font-medium gap-2";

/** Cuadrado único para botones solo icono (36×36px). */
export const WORKSHOP_BTN_SIZE_ICON = "h-9 w-9 min-h-9 min-w-9 shrink-0 p-0";

/** Cuadrado compacto para listas densas del sidebar (32×32px). */
export const WORKSHOP_BTN_SIZE_ICON_COMPACT = "h-8 w-8 min-h-8 min-w-8 shrink-0 p-0";

/** Icono dentro de botones `group` — siempre usar con `WorkshopButtonIcon`. */
export const WORKSHOP_GROUP_ICON = "h-4 w-4 shrink-0 transition-colors duration-base";

export type WorkshopButtonIconTone = "primary" | "secondary" | "danger" | "success";

/** Colores de icono sincronizados con el hover del botón padre (`group`). */
export const WORKSHOP_GROUP_ICON_BY_TONE: Record<WorkshopButtonIconTone, string> = {
  primary: "text-[var(--primary-foreground)]",
  secondary: "text-[var(--muted-foreground)] group-hover:text-[var(--primary)]",
  danger:
    "text-[var(--destructive)] group-hover:text-[var(--destructive-foreground)]",
  success: "text-[var(--success-foreground)]",
};

/** Icono del toolbar de documentos — reposo apagado, hover invertido (fondo primary). */
export const WORKSHOP_DOC_TOOLBAR_ICON = cn(
  WORKSHOP_GROUP_ICON,
  "text-[var(--muted-foreground)] group-hover:text-[var(--primary-foreground)]",
);

/** Cuadrado solo icono: outline en reposo, relleno al hover (header, chat, doc toolbar). */
const WORKSHOP_INVERSE_ICON_BTN_CHROME =
  "group inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--card)_65%,var(--muted))] text-[var(--muted-foreground)] shadow-sm transition-[background-color,border-color,color,box-shadow] duration-base hover:border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:pointer-events-none disabled:opacity-40 touch-manipulation [&_svg]:transition-colors [&_svg]:duration-base [&_svg]:group-hover:text-[var(--primary-foreground)]";

export const WORKSHOP_INVERSE_ICON_BTN = cn(WORKSHOP_BTN_SIZE_ICON, WORKSHOP_INVERSE_ICON_BTN_CHROME);

/** Mismo chrome que `WORKSHOP_INVERSE_ICON_BTN`, tamaño compacto para pasos del sidebar. */
export const WORKSHOP_INVERSE_ICON_BTN_COMPACT = cn(
  WORKSHOP_BTN_SIZE_ICON_COMPACT,
  WORKSHOP_INVERSE_ICON_BTN_CHROME,
);

/** Icono outlined del rail (marca, colapsar) — borde visible, sin relleno. */
export const SIDEBAR_RAIL_ICON_BTN_OUTLINED = cn(
  WORKSHOP_BTN_SIZE_ICON_COMPACT,
  "group inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-transparent shadow-sm",
  "text-[var(--muted-foreground)] transition-[background-color,border-color,color,box-shadow] duration-base",
  "hover:border-[var(--border)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
  "disabled:pointer-events-none disabled:opacity-40 touch-manipulation [&_svg]:transition-colors [&_svg]:duration-base",
);

/** Sidebar rail: reposo sin fondo ni borde; solo el paso activo lleva relleno. */
export const SIDEBAR_RAIL_ICON_BTN_IDLE = cn(
  WORKSHOP_BTN_SIZE_ICON_COMPACT,
  "group inline-flex items-center justify-center rounded-xl border border-transparent bg-transparent shadow-none",
  "text-[var(--muted-foreground)] transition-[background-color,border-color,color,box-shadow] duration-base",
  "hover:border-transparent hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar)]",
  "disabled:pointer-events-none disabled:opacity-40 touch-manipulation [&_svg]:transition-colors [&_svg]:duration-base",
);

/** Paso / control activo en el rail del sidebar. */
export const SIDEBAR_RAIL_ICON_BTN_SELECTED = cn(
  "border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm",
  "hover:bg-[var(--primary-hover)] [&_svg]:text-[var(--primary-foreground)]",
);

/** Hover destructivo para iconos inversos (p. ej. borrar historial del chat). */
export const WORKSHOP_INVERSE_ICON_BTN_DANGER_HOVER = cn(
  "hover:border-[color-mix(in_oklch,var(--destructive)_35%,var(--border))] hover:bg-[var(--destructive-hover)] hover:text-[var(--destructive-foreground)] [&_svg]:group-hover:text-[var(--destructive-foreground)]",
);

/** Preview/source toggle, print, regen. */
export const WORKSHOP_DOC_TOOLBAR_ICON_BTN = WORKSHOP_INVERSE_ICON_BTN;

/** Icon slot in workshop column headers (chat, document) — flat muted tile + primary icon. */
export const WORKSHOP_COLUMN_HEADER_ICON_SLOT = cn(
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
  "bg-[var(--muted)] text-[var(--primary)]",
  "ring-1 ring-[color-mix(in_oklch,var(--border)_70%,transparent)]",
);

export const WORKSHOP_COLUMN_HEADER_ICON = cn(WORKSHOP_GROUP_ICON, "h-4 w-4 text-[var(--primary)]");

/** Same chrome as `Button size="icon"` + `WORKSHOP_DOC_TOOLBAR_ICON_BTN` for native `<button>` triggers. */
export const WORKSHOP_DOC_TOOLBAR_ICON_TRIGGER = cn(
  "inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:pointer-events-none disabled:opacity-50",
  WORKSHOP_DOC_TOOLBAR_ICON_BTN,
);

const WORKSHOP_PANEL_ACTION_BASE = cn(
  "group inline-flex shrink-0 items-center justify-center rounded-xl border shadow-sm transition-[background-color,border-color,color,box-shadow] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_oklch,var(--card)_40%,var(--background))] disabled:cursor-not-allowed disabled:opacity-50",
  WORKSHOP_BTN_SIZE_ACTION,
);

/** Primary CTA inside document panels (e.g. Generar BRD, Generar Benchmark). */
export const WORKSHOP_PANEL_ACTION_PRIMARY = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]",
);

/** Secondary / outline actions in document panels (white surface, primary on hover). */
export const WORKSHOP_PANEL_ACTION_SECONDARY = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] hover:bg-[var(--card)] hover:text-[var(--primary)] [&_svg]:group-hover:text-[var(--primary)]",
);

/** Destructive outline actions in document panels (e.g. Borrar Fase 0). */
export const WORKSHOP_PANEL_ACTION_DANGER = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[var(--destructive-soft-border)] bg-[var(--destructive-soft)] text-[var(--destructive)] hover:border-[var(--destructive-hover)] hover:bg-[var(--destructive-hover)] hover:text-[var(--destructive-foreground)] [&_svg]:text-[var(--destructive)] [&_svg]:group-hover:text-[var(--destructive-foreground)]",
);

/** Success CTA in document panels (e.g. Generar todos los documentos). */
export const WORKSHOP_PANEL_ACTION_SUCCESS = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[color-mix(in_oklch,var(--success)_35%,var(--border))] bg-[var(--success)] text-[var(--success-foreground)] hover:bg-[color-mix(in_oklch,var(--success)_88%,black)]",
);

/** MDD panel CTAs — misma base que panel (borde + sombra), tipografía semibold. */
export const WORKSHOP_MDD_ACTION_PRIMARY = cn(WORKSHOP_PANEL_ACTION_PRIMARY, "font-semibold");

export const WORKSHOP_MDD_ACTION_SUCCESS = cn(WORKSHOP_PANEL_ACTION_SUCCESS, "font-semibold");

/** Compact primary save in dirty-save bars. */
export const WORKSHOP_ACTION_SAVE = cn(
  WORKSHOP_PANEL_ACTION_BASE,
  "border-[color-mix(in_oklch,var(--primary)_35%,var(--border))] bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]",
);

/** Chat sidebar: icon-only utility controls (refresh, trash). */
export const WORKSHOP_CHAT_TOOLBAR_ICON_BTN = WORKSHOP_INVERSE_ICON_BTN;

export const WORKSHOP_CHAT_TOOLBAR_ICON_BTN_DANGER_HOVER = WORKSHOP_INVERSE_ICON_BTN_DANGER_HOVER;
