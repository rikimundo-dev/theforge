import { FolderArchive } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { WorkshopHeaderIconButton } from "@/components/WorkshopButtons";

interface ExportSddButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/** Export spec-kit layout (`.specify/` + `specs/`) for SDD local. */
export function WorkshopExportSddButton({ onClick, disabled }: ExportSddButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <WorkshopHeaderIconButton
          onClick={onClick}
          disabled={disabled}
          aria-label="Exportar bundle SDD compatible con spec-kit"
        >
          <FolderArchive className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </WorkshopHeaderIconButton>
      </TooltipTrigger>
      <TooltipContent side="bottom">Exportar SDD local (spec-kit)</TooltipContent>
    </Tooltip>
  );
}
