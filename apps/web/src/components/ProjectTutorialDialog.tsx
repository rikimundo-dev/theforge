/**
 * Dashboard tutorial: greenfield vs brownfield guides (markdown).
 */
import { useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, BookOpen, GitBranch, Sparkles, type LucideIcon } from "lucide-react";
import greenfieldTutorial from "../content/tutorial/greenfield.md?raw";
import brownfieldTutorial from "../content/tutorial/brownfield.md?raw";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export type TutorialTrack = "greenfield" | "brownfield";

type ProjectTutorialDialogProps = {
  open: boolean;
  onClose: () => void;
};

interface TutorialSection {
  id: TutorialTrack;
  label: string;
  description: string;
  icon: LucideIcon;
  content: string;
}

const SECTIONS: TutorialSection[] = [
  {
    id: "greenfield",
    label: "Greenfield",
    description: "Producto nuevo desde cero",
    icon: Sparkles,
    content: greenfieldTutorial.trim(),
  },
  {
    id: "brownfield",
    label: "Brownfield",
    description: "Legacy y código existente",
    icon: GitBranch,
    content: brownfieldTutorial.trim(),
  },
];

const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

function FlowStepPills({ text }: { text: string }) {
  const steps = text.split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
  if (steps.length < 2) return null;
  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_22%,var(--card))] p-3"
      role="list"
      aria-label="Secuencia del flujo"
    >
      {steps.map((step, index) => (
        <span key={`${step}-${index}`} className="inline-flex items-center gap-1.5" role="listitem">
          {index > 0 ? (
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
          ) : null}
          <span className="rounded-full border border-[color-mix(in_oklch,var(--primary)_25%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_10%,var(--card))] px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--foreground)]">
            {step}
          </span>
        </span>
      ))}
    </div>
  );
}

const mdComponents = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="mt-2 border-b border-[var(--border)] pb-2 text-xl font-semibold text-[var(--foreground)] first:mt-0"
      {...props}
    />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="mt-6 text-base font-semibold text-[var(--primary)] first:mt-0" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="mt-4 text-sm font-medium text-[var(--foreground)]" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="mb-3 text-sm leading-relaxed text-[var(--foreground-muted)] last:mb-0 sm:text-[15px]" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-[var(--foreground-muted)]" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-[var(--foreground-muted)]" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => <li className="leading-relaxed" {...props} />,
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-[var(--foreground)]" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="mb-4 border-l-[3px] border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] px-4 py-3 text-sm italic text-[var(--foreground-muted)]"
      {...props}
    />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="mb-4 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
      <table className="w-full min-w-[280px] border-collapse text-left text-sm" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-[color-mix(in_oklch,var(--muted)_40%,var(--card))]" {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="border-b border-[var(--border)] px-3 py-2 font-semibold text-[var(--foreground)]" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-[var(--border)] px-3 py-2 text-[var(--foreground-muted)]" {...props} />
  ),
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<"code">) => {
    const isBlock = Boolean(className?.startsWith("language-"));
    if (isBlock) {
      return (
        <code className={cn("font-mono text-sm", className)} {...props}>
          {children}
        </code>
      );
    }
    const inlineText = String(children ?? "").replace(/\n/g, " ").trim();
    if (inlineText.includes("→")) {
      return <FlowStepPills text={inlineText} />;
    }
    return (
      <code
        className="rounded-[calc(var(--radius)-2px)] border border-[var(--border)] bg-[var(--muted)] px-1.5 py-0.5 text-[0.85em] text-[var(--foreground)]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre
      className="mb-4 overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_45%,var(--card))] p-4 text-sm leading-relaxed text-[var(--foreground)]"
      {...props}
    />
  ),
  hr: () => <hr className="my-6 border-[var(--border)]" />,
};

function TutorialNavButton({
  section,
  active,
  onSelect,
}: {
  section: TutorialSection;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
        active
          ? "bg-[color-mix(in_oklch,var(--primary)_14%,var(--sidebar))] text-[var(--primary)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
          : "text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklch,var(--muted)_45%,transparent)] hover:text-[var(--foreground)]",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          active
            ? "bg-[color-mix(in_oklch,var(--primary)_18%,var(--card))] text-[var(--primary)]"
            : "bg-[color-mix(in_oklch,var(--muted)_55%,var(--card))] text-[var(--muted-foreground)]",
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-snug">{section.label}</span>
        <span className="block truncate text-[11px] text-[var(--muted-foreground)]">{section.description}</span>
      </span>
    </button>
  );
}

export function ProjectTutorialDialog({ open, onClose }: ProjectTutorialDialogProps) {
  const [activeTrack, setActiveTrack] = useState<TutorialTrack>("greenfield");
  const section = SECTION_BY_ID.get(activeTrack) ?? SECTIONS[0]!;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        size="xl"
        showClose
        className="flex max-h-[min(92vh,900px)] w-[calc(100vw-1.25rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <div className="shrink-0 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--primary)_9%,var(--card))] px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-start gap-3 pr-6">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklch,var(--primary)_16%,var(--card))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_28%,transparent)]"
                aria-hidden
              >
                <BookOpen className="h-5 w-5 text-[var(--primary)]" strokeWidth={2} />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-lg font-semibold tracking-tight text-[var(--foreground)] sm:text-xl">
                  Tutorial — Greenfield y Brownfield
                </DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-[var(--muted-foreground)]">
                  Elige el tipo de proyecto y sigue la guía para crear y trabajar en TheForge.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <nav
            className="shrink-0 border-b border-[var(--border)] p-2 lg:w-56 lg:border-b-0 lg:border-r"
            aria-label="Tipo de tutorial"
          >
            <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Modo de trabajo
            </p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <TutorialNavButton
                    section={s}
                    active={s.id === activeTrack}
                    onSelect={() => setActiveTrack(s.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6 [scrollbar-gutter:stable]"
            aria-label={`Tutorial ${section.label}`}
          >
            <article className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {section.content}
              </ReactMarkdown>
            </article>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-[var(--border)] px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
