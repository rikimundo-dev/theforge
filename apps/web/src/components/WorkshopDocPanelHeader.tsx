import { cn } from "@/lib/utils";
import {
  WORKSHOP_COLUMN_HEADER_ICON,
  WORKSHOP_COLUMN_HEADER_ICON_SLOT,
} from "@/constants/workshopDocToolbar";
import { getWorkshopDocPanelHeader } from "../utils/workshopDocNav";

export interface WorkshopDocPanelHeaderProps {
  panel: string;
  benchmarkPhaseTab?: "fase0" | "benchmark";
  className?: string;
}

/**
 * Desktop document column header — icon + full title (matches chat column header chrome).
 */
export function WorkshopDocPanelHeader({
  panel,
  benchmarkPhaseTab,
  className,
}: WorkshopDocPanelHeaderProps) {
  const { title, subtitle, Icon } = getWorkshopDocPanelHeader(panel, { benchmarkPhaseTab });

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", className)}>
      <div className={WORKSHOP_COLUMN_HEADER_ICON_SLOT} aria-hidden>
        <Icon className={WORKSHOP_COLUMN_HEADER_ICON} strokeWidth={2} aria-hidden />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <h2 className="truncate text-sm font-semibold leading-tight tracking-tight text-[var(--foreground)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 truncate text-xs leading-snug text-[var(--foreground-subtle)]">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
