import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui";
import { cn } from "@/lib/utils";

/** Botón solo icono alineado con `Button size="sm"` (p. ej. Usar, selector de rol). */
export const listRowIconButtonClass = "w-8 shrink-0 px-0";

type ListRowIconButtonProps = ComponentProps<typeof Button> & {
  /** Radix tooltip label (preferred over native `title`). */
  tooltip?: string;
};

export function ListRowIconButton({
  className,
  variant = "outline",
  size = "sm",
  tooltip,
  title,
  "aria-label": ariaLabel,
  ...props
}: ListRowIconButtonProps) {
  const label = tooltip ?? title ?? ariaLabel;
  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(listRowIconButtonClass, className)}
      title={tooltip ? undefined : title}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      {...props}
    />
  );

  if (!label || typeof label !== "string") return button;

  const trigger = props.disabled ? (
    <span className="inline-flex cursor-not-allowed">{button}</span>
  ) : (
    button
  );

  return (
    <TooltipProvider delayDuration={280}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="top" align="center" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Icon-only control with tooltip (e.g. ver/copiar API key). */
export function ListRowIconTooltipButton({
  tooltip,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { tooltip: string }) {
  return (
    <TooltipProvider delayDuration={280}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            title={undefined}
            aria-label={tooltip}
            className={cn(
              "rounded-md p-1 text-[var(--foreground-muted)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:pointer-events-none disabled:opacity-50",
              className,
            )}
            {...props}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" sideOffset={6}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Altura coherente con botones `size="sm"`; ancho según el valor seleccionado. */
export const listRowSelectClass =
  "h-8 w-fit max-w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--card)] pl-2.5 pr-9 text-sm text-[var(--foreground)] [field-sizing:content]";

/** Select compacto de fila con chevron y padding derecho explícito. */
export function ListRowSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative inline-flex max-w-full shrink-0">
      <select className={cn(listRowSelectClass, className)} {...props} />
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
        aria-hidden
      />
    </span>
  );
}
