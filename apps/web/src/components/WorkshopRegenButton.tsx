import { Loader2, RefreshCw } from "lucide-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { WORKSHOP_DOC_TOOLBAR_ICON_BTN } from "@/constants/workshopDocToolbar";

interface WorkshopRegenButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel: string;
  tooltip?: string;
}

/** Regenerate action for the workshop document toolbar (same chrome as preview / print). */
export function WorkshopRegenButton({
  onClick,
  disabled = false,
  loading = false,
  ariaLabel,
  tooltip,
}: WorkshopRegenButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onClick}
          disabled={disabled || loading}
          className={WORKSHOP_DOC_TOOLBAR_ICON_BTN}
          aria-label={ariaLabel}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" strokeWidth={2} aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4 shrink-0 text-[var(--primary)]" strokeWidth={2} aria-hidden />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="max-w-[16rem]">
        {tooltip ?? ariaLabel}
      </TooltipContent>
    </Tooltip>
  );
}
