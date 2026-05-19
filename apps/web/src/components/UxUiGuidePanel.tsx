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
 * Panel Guía UX/UI — 3 modos: preview (MddViewer), design (DesignMdPreview), source (textarea + YAML repair).
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
          title="Guía UX/UI"
          description="Colores, tipografía, espaciado, componentes y documentación; se apoya en el MDD y el Blueprint."
          onGenerate={onGenerate}
          loading={isGenerating || isLoading}
          hasMdd={canGenerate}
        />
    );
  }

  return (
    <>
      {viewMode === "design" ? (
        <div key="design-view" className="min-h-0 flex-1 overflow-auto">
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
            placeholder={placeholder ?? "# Guía UX/UI\n\nConversa con la IA sobre marca, estilos, prioridades y componentes..."}
            className="min-h-0 w-full flex-1 bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] border border-[var(--border)] rounded-lg p-4 text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent outline-none resize-none"
            spellCheck={false}
          />
        </div>
      )}
      {isEmpty && viewMode === "source" && (
        <div className="shrink-0 mt-4 flex min-h-[200px] w-full justify-center sm:justify-end">
          {isGenerating || isLoading ? (
            <AiDocumentBuildingPlaceholder documentTitle="Guía UX/UI" />
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
              Generar Guía UX/UI desde MDD
            </Button>
          )}
        </div>
      )}
    </>
  );
}
