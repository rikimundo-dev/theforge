import { Save } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Primary CTA styling: shared by `DocEmptyState` and source-mode "first generate" rows. */
export const WORKSHOP_DOC_EMPTY_PRIMARY_BTN = cn(
  "h-12 gap-2 rounded-xl text-base font-semibold shadow-md",
  "shadow-[color-mix(in_oklch,var(--primary)_42%,transparent)]",
  "hover:shadow-lg hover:shadow-[color-mix(in_oklch,var(--primary)_48%,transparent)]",
);

/** Save control above the markdown editor: full-width primary action (no nested card). */
export function WorkshopDocSourceSaveBar({
  onSave,
  disabled,
  label = "Guardar",
}: {
  onSave: () => void | Promise<void>;
  disabled: boolean;
  label?: string;
}) {
  return (
    <div className="shrink-0 w-full min-w-0">
      <Button
        type="button"
        variant="default"
        size="lg"
        className={cn("w-full", WORKSHOP_DOC_EMPTY_PRIMARY_BTN)}
        disabled={disabled}
        onClick={() => void onSave()}
      >
        <Save className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2} aria-hidden />
        {label}
      </Button>
    </div>
  );
}
