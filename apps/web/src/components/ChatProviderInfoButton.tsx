import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  KeyRound,
  Layers,
  Loader2,
  MessageSquare,
  Mic,
  ScanEye,
  Settings2,
  Shield,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProviderLogo, getProviderLabel } from "./ProviderLogo";
import { WorkshopChatToolbarIconButton } from "./WorkshopButtons";
import { useActiveProviderInfo } from "@/hooks/useActiveProviderInfo";
import {
  visionModelHint,
  type EffectiveProviderSource,
} from "@/utils/resolve-effective-provider";
import { cn } from "@/lib/utils";

interface ChatProviderInfoButtonProps {
  onOpenSettings?: () => void;
}

const PANEL_WIDTH_PX = 320;
const PANEL_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;

function getViewportBox() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

const SOURCE_LABEL: Record<EffectiveProviderSource, string> = {
  "selected-instance": "Tu selección",
  "tenant-default": "Predeterminado del equipo",
  "first-enabled": "Instancia del equipo",
  "personal-byok": "Clave personal",
  none: "Sin configurar",
};

function ModelChip({ model }: { model: string }) {
  return (
    <span
      title={model}
      className="inline-flex max-w-full items-center rounded-md border border-[color-mix(in_oklch,var(--border)_88%,transparent)] bg-[color-mix(in_oklch,var(--muted)_42%,var(--card))] px-2 py-1 font-mono text-[10px] leading-tight text-[var(--foreground)]"
    >
      <span className="truncate">{model}</span>
    </span>
  );
}

function ModelField({
  icon: Icon,
  label,
  value,
  hint,
  alwaysShow = false,
  emptyLabel = "No configurado",
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  hint?: string | null;
  alwaysShow?: boolean;
  emptyLabel?: string;
}) {
  const display = value?.trim() || (alwaysShow ? emptyLabel : "");
  if (!display) return null;
  const isEmpty = !value?.trim();
  return (
    <div className="rounded-lg border border-[color-mix(in_oklch,var(--border)_75%,transparent)] bg-[color-mix(in_oklch,var(--card)_55%,var(--background))] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
        {label}
      </div>
      <p
        className={cn(
          "text-[11px] leading-snug break-all",
          isEmpty ? "text-[var(--muted-foreground)]" : "font-mono text-[var(--foreground)]",
        )}
      >
        {display}
      </p>
      {hint ? (
        <p className="mt-1 text-[10px] leading-snug text-[var(--muted-foreground)]">{hint}</p>
      ) : null}
    </div>
  );
}

function FallbackModelsField({ models }: { models: string[] }) {
  if (models.length === 0) return null;
  return (
    <div className="rounded-lg border border-[color-mix(in_oklch,var(--border)_75%,transparent)] bg-[color-mix(in_oklch,var(--card)_55%,var(--background))] p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
        <Layers className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
        Modelos de respaldo
      </div>
      <div className="flex flex-wrap gap-1.5">
        {models.map((model) => (
          <ModelChip key={model} model={model} />
        ))}
      </div>
    </div>
  );
}

export function ChatProviderInfoButton({ onOpenSettings }: ChatProviderInfoButtonProps) {
  const { info, vision, loading, error } = useActiveProviderInfo();
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const instance = info.instance;
  const personal = info.personalConfig;
  const providerType = instance?.providerType ?? personal?.provider ?? null;
  const displayName =
    instance?.displayName ?? (personal ? getProviderLabel(personal.provider) : null);
  const chatModel = instance?.chatModel ?? personal?.chatModel ?? null;
  const auditorModel = instance?.auditorChatModel?.trim() || chatModel;
  const apiKeyHint = instance?.apiKeyHint ?? personal?.apiKeyHint ?? null;
  const fallbackModels =
    instance?.chatModelFallbacks?.length
      ? instance.chatModelFallbacks
      : personal?.chatModelFallbacks?.length
        ? personal.chatModelFallbacks
        : [];

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewport = getViewportBox();
    const chatColumn = trigger.closest(".workshop-chat-column");
    const chatRect = chatColumn?.getBoundingClientRect();

    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const maxPanelWidth = chatRect
      ? Math.max(200, chatRect.width - VIEWPORT_PADDING_PX * 2)
      : Math.max(200, viewport.width - VIEWPORT_PADDING_PX * 2);
    const width = Math.min(PANEL_WIDTH_PX, maxPanelWidth);

    const minLeft = chatRect
      ? chatRect.left + VIEWPORT_PADDING_PX
      : viewport.offsetLeft + VIEWPORT_PADDING_PX;
    const maxLeft = chatRect
      ? chatRect.right - width - VIEWPORT_PADDING_PX
      : viewport.offsetLeft + viewport.width - width - VIEWPORT_PADDING_PX;

    const left = Math.min(Math.max(minLeft, rect.left), Math.max(minLeft, maxLeft));

    const spaceBelow =
      viewport.offsetTop + viewport.height - rect.bottom - PANEL_GAP_PX - VIEWPORT_PADDING_PX;
    const spaceAbove = rect.top - viewport.offsetTop - PANEL_GAP_PX - VIEWPORT_PADDING_PX;
    const openBelow = spaceBelow >= panelHeight || spaceBelow >= spaceAbove;
    const top = openBelow
      ? rect.bottom + PANEL_GAP_PX
      : Math.max(
          viewport.offsetTop + VIEWPORT_PADDING_PX,
          rect.top - PANEL_GAP_PX - panelHeight,
        );

    const maxHeight = openBelow ? Math.max(180, spaceBelow) : Math.max(180, spaceAbove);

    setPanelStyle({
      top,
      left,
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const panel = panelRef.current;
    if (!panel) return;
    const ro = new ResizeObserver(() => updatePanelPosition());
    ro.observe(panel);
    return () => ro.disconnect();
  }, [open, updatePanelPosition, info, error, loading]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePanelPosition();
    window.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia("(max-width: 1023px)").matches;
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasProvider = info.source !== "none" && (providerType != null || displayName != null);

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[calc(var(--z-popover)-1)] bg-[color-mix(in_oklch,var(--background)_35%,transparent)] backdrop-blur-[2px] lg:hidden"
              aria-hidden
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="Proveedor de IA activo"
              style={panelStyle}
              className={cn(
                "fixed z-[var(--z-popover)] flex flex-col overflow-hidden rounded-2xl border border-[color-mix(in_oklch,var(--border)_90%,var(--primary))]",
                "bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[0_12px_40px_color-mix(in_oklch,var(--background)_55%,transparent)]",
                "overscroll-contain ring-1 ring-[color-mix(in_oklch,var(--primary)_12%,transparent)]",
              )}
            >
              <div
                className={cn(
                  "relative shrink-0 overflow-hidden px-3.5 pb-3 pt-3.5",
                  "bg-[linear-gradient(165deg,color-mix(in_oklch,var(--primary)_14%,var(--card))_0%,color-mix(in_oklch,var(--card)_92%,var(--background))_55%,var(--popover)_100%)]",
                )}
              >
                <div
                  className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[color-mix(in_oklch,var(--primary)_18%,transparent)] blur-2xl"
                  aria-hidden
                />
                <div className="relative flex items-start gap-3">
                  {providerType ? (
                    <div className="shrink-0 rounded-xl border border-[color-mix(in_oklch,var(--border)_70%,var(--primary))] bg-[var(--card)] p-0.5 shadow-sm">
                      <ProviderLogo provider={providerType} size="md" />
                    </div>
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]">
                      <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[15px] font-semibold leading-tight tracking-tight text-[var(--foreground)]">
                      {displayName ?? "Sin proveedor"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {providerType ? (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {getProviderLabel(providerType)}
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          hasProvider
                            ? "bg-[color-mix(in_oklch,var(--primary)_22%,var(--card))] text-[color-mix(in_oklch,var(--primary)_65%,var(--foreground))]"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                        )}
                      >
                        {SOURCE_LABEL[info.source]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3">
                {error ? (
                  <p className="rounded-lg border border-[color-mix(in_oklch,var(--destructive)_35%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))] px-2.5 py-2 text-xs text-[var(--destructive)]">
                    {error}
                  </p>
                ) : info.source === "none" ? (
                  <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
                    Configura una instancia del equipo o tu clave API en ajustes para usar generación y
                    análisis en el chat.
                  </p>
                ) : (
                  <>
                    <ModelField icon={MessageSquare} label="Modelo de chat" value={chatModel} />
                    <ModelField icon={Shield} label="Modelo auditor" value={auditorModel} />
                    <FallbackModelsField models={fallbackModels} />
                    {vision.supportsVision ? (
                      <ModelField
                        icon={ScanEye}
                        label="Modelo de visión"
                        value={vision.model}
                        hint={visionModelHint(vision.source)}
                        alwaysShow
                      />
                    ) : null}
                    <ModelField
                      icon={Sparkles}
                      label="Embeddings"
                      value={instance?.embeddingModel ?? personal?.embeddingModel ?? null}
                    />
                    <ModelField
                      icon={Mic}
                      label="Transcripción (STT)"
                      value={instance?.sttModel ?? personal?.sttModel ?? null}
                    />
                    {apiKeyHint ? (
                      <ModelField icon={KeyRound} label="Clave API" value={apiKeyHint} />
                    ) : null}
                  </>
                )}
              </div>

              {onOpenSettings ? (
                <div className="shrink-0 border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_18%,var(--popover))] p-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenSettings();
                    }}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium",
                      "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-[opacity,transform]",
                      "hover:opacity-95 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--popover)]",
                    )}
                  >
                    <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
                    Ir a ajustes
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <WorkshopChatToolbarIconButton
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Ver proveedor de IA activo"
        title="Proveedor de IA activo"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className={cn(
          open &&
            "border-[color-mix(in_oklch,var(--primary)_40%,var(--border))] bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))]",
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        ) : providerType ? (
          <ProviderLogo
            provider={providerType}
            size="sm"
            className="h-7 w-7 rounded-lg border-0 bg-transparent shadow-none"
          />
        ) : (
          <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
        )}
      </WorkshopChatToolbarIconButton>
      {panel}
    </>
  );
}
