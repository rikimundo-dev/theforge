import { Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { WORKSHOP_HEADER_ICON_BTN } from "@/constants/workshopHeaderToolbar";

interface DownloadZipButtonProps {
  onClick: () => void;
}

/** Download-all-documents ZIP action for the workshop header toolbar. */
export function WorkshopDownloadZipButton({ onClick }: DownloadZipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={WORKSHOP_HEADER_ICON_BTN}
          aria-label="Descargar todos los documentos del proyecto en ZIP"
        >
          <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Descargar ZIP del proyecto</TooltipContent>
    </Tooltip>
  );
}
