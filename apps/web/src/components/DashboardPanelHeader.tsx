/**
 * Dashboard projects panel header: integrated title, copy, and actions.
 */
import { Loader2, Plus, RefreshCw, BookOpen } from "lucide-react";
import { Button } from "@/components/ui";

export interface DashboardPanelHeaderProps {
  loading: boolean;
  onCreateProject: () => void;
  onRefresh: () => void;
  onOpenTutorial?: () => void;
}

export function DashboardPanelHeader({
  loading,
  onCreateProject,
  onRefresh,
  onOpenTutorial,
}: DashboardPanelHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Panel de proyectos
        </p>
        <h1 className="text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl">
          Especifica con IA, luego construye con confianza
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Cada carpeta abre un Workshop donde conversas, generas el MDD y revisas conformidad antes de los
          entregables.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Button
          type="button"
          size="icon"
          className="touch-manipulation sm:hidden"
          onClick={onCreateProject}
          disabled={loading}
          aria-label="Crear nuevo proyecto"
          title="Crear nuevo proyecto"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="touch-manipulation sm:hidden"
          onClick={onOpenTutorial}
          disabled={loading || !onOpenTutorial}
          aria-label="Tutorial greenfield y brownfield"
          title="Tutorial"
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="touch-manipulation sm:hidden"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refrescar lista de proyectos"
          title="Refrescar"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
        </Button>
        <Button
          type="button"
          className="hidden w-full touch-manipulation min-h-11 sm:inline-flex sm:w-auto sm:min-h-10"
          onClick={onCreateProject}
          disabled={loading}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          Crear nuevo proyecto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="hidden w-full touch-manipulation min-h-11 sm:inline-flex sm:w-auto sm:min-h-10"
          onClick={onOpenTutorial}
          disabled={loading || !onOpenTutorial}
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          Tutorial
        </Button>
        <Button
          type="button"
          variant="outline"
          className="hidden w-full touch-manipulation min-h-11 sm:inline-flex sm:w-auto sm:min-h-10"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Refrescar
        </Button>
      </div>
    </header>
  );
}
