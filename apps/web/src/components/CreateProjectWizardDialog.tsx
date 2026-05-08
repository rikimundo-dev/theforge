/**
 * @fileoverview Modal stepper to create a project: choose origin (new / TheForge project or repo),
 * then name for new projects or hand off to the TheForge picker for legacy paths.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FolderGit2, GitBranch, Loader2, Sparkles } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export type CreateProjectOrigin = "NEW" | "LEGACY_PROJECT" | "LEGACY_REPO";

export interface CreateProjectWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onCreateNew: (name: string) => Promise<void>;
  onContinueLegacy: (tab: "projects" | "repos") => void;
}

const ORIGINS: {
  id: CreateProjectOrigin;
  title: string;
  description: string;
  icon: typeof Sparkles;
}[] = [
  {
    id: "NEW",
    title: "Proyecto nuevo",
    description: "Desde cero en TheForge (tipo Nuevo).",
    icon: Sparkles,
  },
  {
    id: "LEGACY_PROJECT",
    title: "Proyecto existente",
    description: "Importa un proyecto ya indexado en TheForge.",
    icon: FolderGit2,
  },
  {
    id: "LEGACY_REPO",
    title: "Repositorio existente",
    description: "Usa un repo indexado como base legacy.",
    icon: GitBranch,
  },
];

export function CreateProjectWizardDialog({
  open,
  onOpenChange,
  loading,
  onCreateNew,
  onContinueLegacy,
}: CreateProjectWizardDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setName("");
    setLocalError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSelectOrigin = useCallback((o: CreateProjectOrigin) => {
    setLocalError(null);
    if (o === "NEW") setStep(2);
    else {
      onContinueLegacy(o === "LEGACY_PROJECT" ? "projects" : "repos");
      handleClose();
    }
  }, [onContinueLegacy, handleClose]);

  const handleBack = useCallback(() => {
    setLocalError(null);
    setStep(1);
    setName("");
  }, []);

  const handleSubmitNew = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Escribe un nombre para el proyecto.");
      return;
    }
    setLocalError(null);
    try {
      await onCreateNew(trimmed);
      handleClose();
    } catch {
      setLocalError("No se pudo crear el proyecto. Revisa la consola o inténtalo de nuevo.");
    }
  }, [name, onCreateNew, handleClose]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="border-b border-[var(--border)] bg-[var(--muted)]/30 px-6 py-4">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-lg font-semibold text-[var(--foreground)]">
              Crear proyecto
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--foreground-muted)]">
              {step === 1
                ? "Paso 1 de 2 — Elige cómo quieres empezar."
                : "Paso 2 de 2 — Nombre del proyecto nuevo."}
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-4 flex items-center gap-2" aria-label="Progreso">
            <li
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                step >= 1
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]",
              )}
              aria-current={step === 1 ? "step" : undefined}
            >
              1
            </li>
            <li className="h-px flex-1 bg-[var(--border)]" aria-hidden />
            <li
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold",
                step === 2
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]",
              )}
              aria-current={step === 2 ? "step" : undefined}
            >
              2
            </li>
          </ol>
        </div>

        <div className="px-6 py-5">
          {step === 1 ? (
            <div className="grid gap-3 sm:grid-cols-1">
              <p id="origin-hint" className="text-sm text-[var(--foreground-muted)]">
                Selecciona una opción. Si eliges TheForge, se abrirá el selector de proyectos o repositorios.
              </p>
              <div
                className="grid gap-3 sm:grid-cols-3"
                role="group"
                aria-label="Opciones para crear proyecto"
              >
                {ORIGINS.map(({ id, title, description, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectOrigin(id)}
                      disabled={loading}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-[var(--radius-lg)] border p-4 text-left transition-colors",
                        "min-h-[120px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]",
                        "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/45 hover:bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))]",
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden />
                      <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
                      <span className="text-xs leading-snug text-[var(--foreground-muted)]">{description}</span>
                    </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Volver al tipo de proyecto
              </button>
              <div>
                <label htmlFor="create-project-name" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                  Nombre del proyecto
                </label>
                <Input
                  id="create-project-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setLocalError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSubmitNew();
                  }}
                  placeholder="Ej. Mi producto digital"
                  autoComplete="off"
                  className="min-h-11 w-full"
                  aria-invalid={!!localError}
                  aria-describedby={localError ? "create-project-error" : undefined}
                />
                {localError ? (
                  <p id="create-project-error" className="mt-2 text-sm text-[var(--destructive)]" role="alert">
                    {localError}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {step === 2 ? (
          <DialogFooter className="border-t border-[var(--border)] bg-[var(--muted)]/20 px-6 py-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSubmitNew()} disabled={loading || !name.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Crear proyecto
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter className="border-t border-[var(--border)] px-6 py-4 sm:justify-end">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cerrar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
