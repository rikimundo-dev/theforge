import { Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { DocEmptyState } from "@/components/DocEmptyState";
import { DesignMdPreview } from "@/components/DesignMdPreview";
import MddViewer from "@/components/MddViewer";
import { AiDocumentBuildingPlaceholder } from "@/components/AiGenerationLoader";
import { WorkshopDocSourceSaveBar, WORKSHOP_DOC_EMPTY_PRIMARY_BTN } from "@/components/WorkshopDocSourceSaveBar";

interface UxUiGuidePanelProps {
  content: string | null;
  onContentChange: (value: string | null) => void;
  onSave: () => void;
  isDirty: boolean;
  viewMode: "preview" | "source" | "design";
  onGenerate: () => void;
  canGenerate: boolean;
  isLoading: boolean;
  isGenerating: boolean;
  placeholder?: string;
  onBlur?: () => void;
}

/**
 * Panel Design System — 3 modos: preview (MddViewer), design (DesignMdPreview + UI Kit), source (textarea + YAML repair).
 */
export function UxUiGuidePanel({
  content,
  onContentChange,
  onSave,
  isDirty,
  viewMode,
  onGenerate,
  canGenerate,
  isLoading,
  isGenerating,
  placeholder,
  onBlur,
}: UxUiGuidePanelProps) {
  const isEmpty = !content?.trim();

  if (isEmpty && (viewMode === "preview" || viewMode === "design")) {
    return (
      <DocEmptyState
        icon={Palette}
        title="Design System"
        description="Tokens de diseño (colores, tipografía, espaciado) y un UI Kit de ejemplo con hasta 10 componentes. Se genera desde el MDD y el Blueprint."
        onGenerate={onGenerate}
        loading={isGenerating || isLoading}
        hasMdd={canGenerate}
      />
    );
  }

  return (
    <>
      {viewMode === "design" ? (
        <div key="design-view" className="flex min-h-0 flex-1 flex-col overflow-auto">
          <DesignMdPreview content={content ?? ""} />
        </div>
      ) : viewMode === "preview" ? (
        <div key="preview-view" className="min-h-0 flex-1">
          <MddViewer content={content ?? ""} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <WorkshopDocSourceSaveBar onSave={onSave} disabled={!isDirty} />
          <textarea
            value={content ?? ""}
            onChange={(e) => onContentChange(e.target.value || null)}
            onBlur={onBlur}
            placeholder={
              placeholder ??
              "# Design System\n\nMarca, colores, tipografía, componentes y tokens para el producto..."
            }
            className="min-h-0 w-full flex-1 resize-none rounded-lg border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] p-4 font-mono text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-transparent focus:ring-2 focus:ring-[var(--primary)]"
            spellCheck={false}
          />
        </div>
      )}
      {isEmpty && viewMode === "source" && (
        <div className="mt-4 flex min-h-[200px] w-full shrink-0 justify-center sm:justify-end">
          {isGenerating || isLoading ? (
            <AiDocumentBuildingPlaceholder documentTitle="Design System" />
          ) : (
            <Button
              type="button"
              variant="default"
              size="lg"
              className={cn("w-full max-w-md sm:w-auto sm:min-w-[280px]", WORKSHOP_DOC_EMPTY_PRIMARY_BTN)}
              onClick={onGenerate}
              disabled={isGenerating || isLoading || !canGenerate}
            >
              <Sparkles className="h-4 w-4 shrink-0 opacity-95" strokeWidth={2} aria-hidden />
              Generar Design System desde MDD
            </Button>
          )}
        </div>
      )}
    </>
  );
}
