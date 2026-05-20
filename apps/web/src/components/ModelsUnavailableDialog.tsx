import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui";
import { MODELS_UNAVAILABLE_MESSAGE } from "@/utils/llm-stream-error";

interface ModelsUnavailableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
}

export function ModelsUnavailableDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: ModelsUnavailableDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Modelo de IA no disponible</AlertDialogTitle>
          <AlertDialogDescription>{MODELS_UNAVAILABLE_MESSAGE}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {onOpenSettings ? (
            <AlertDialogAction
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
            >
              Ir a ajustes
            </AlertDialogAction>
          ) : null}
          <AlertDialogAction type="button" onClick={() => onOpenChange(false)}>
            Entendido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
