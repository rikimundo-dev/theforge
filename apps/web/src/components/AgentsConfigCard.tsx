import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Check,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Sparkles,
  Shield,
  Users,
  Workflow,
} from "lucide-react";
import { Button } from "./ui";
import { ProviderLogo, getProviderLabel } from "@/components/ProviderLogo";
import { getStoredUser } from "@/utils/apiClient";
import type { ProviderInstanceSummary, UserAISettings } from "@/types/user-providers";
import {
  fetchAllProviderInstances,
  fetchEnabledProviderInstances,
} from "@/lib/provider-instances-api";
import { fetchUserAISettings, updateUserAISettings } from "@/lib/user-providers-api";
import { cn } from "@/lib/utils";

function canPickInstances(role: string | undefined) {
  return role === "admin" || role === "super_admin";
}

function auditorModelLabel(inst: ProviderInstanceSummary): string {
  const model = inst.auditorChatModel?.trim() || inst.chatModel;
  return model;
}

const GRAPH_AGENTS = [
  { id: "clarifier", label: "Clarificador", icon: Users },
  { id: "architect", label: "Arquitecto", icon: Workflow },
  { id: "security", label: "Seguridad", icon: Shield },
  { id: "manager", label: "Manager", icon: Bot },
] as const;

interface AuditorPickerProps {
  instances: ProviderInstanceSummary[];
  value: string;
  disabled: boolean;
  saving: boolean;
  onSelect: (id: string) => void;
}

function AuditorInstancePicker({
  instances,
  value,
  disabled,
  saving,
  onSelect,
}: AuditorPickerProps) {
  const isDefault = value === "";

  return (
    <div className="space-y-2" role="listbox" aria-label="Proveedor para el Auditor">
      <button
        type="button"
        role="option"
        aria-selected={isDefault}
        disabled={disabled || saving}
        onClick={() => onSelect("")}
        className={cn(
          "flex w-full min-h-[3.5rem] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all sm:rounded-xl",
          "disabled:pointer-events-none disabled:opacity-50",
          isDefault
            ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
            : "border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_oklch,var(--foreground-muted)_35%,var(--border))] hover:bg-[color-mix(in_oklch,var(--muted)_28%,var(--card))]",
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            isDefault
              ? "bg-[color-mix(in_oklch,var(--primary)_20%,var(--card))] text-[var(--primary)]"
              : "bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))] text-[var(--foreground-muted)]",
          )}
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[var(--foreground)]">
            Mismo que proveedor activo
          </span>
          <span className="block text-[11px] text-[var(--foreground-muted)]">
            Predeterminado · sin override
          </span>
        </span>
        {saving && isDefault ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--primary)]" aria-hidden />
        ) : isDefault ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Check className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full border border-[var(--border)]" aria-hidden />
        )}
      </button>

      {instances.map((inst) => {
        const selected = value === inst.id;
        const model = auditorModelLabel(inst);
        const hasAuditorModel = Boolean(inst.auditorChatModel?.trim());

        return (
          <button
            key={inst.id}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled || saving}
            onClick={() => onSelect(inst.id)}
            className={cn(
              "flex w-full min-h-[3.5rem] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all sm:rounded-xl",
              "disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--primary)_40%,transparent)]"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[color-mix(in_oklch,var(--foreground-muted)_35%,var(--border))] hover:bg-[color-mix(in_oklch,var(--muted)_28%,var(--card))]",
            )}
          >
            <ProviderLogo provider={inst.providerType} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                {inst.displayName}
              </span>
              <span className="block truncate font-mono text-[11px] text-[var(--foreground-muted)]">
                {model}
              </span>
              {hasAuditorModel ? (
                <span className="mt-0.5 inline-block rounded-md bg-[color-mix(in_oklch,var(--primary)_14%,var(--card))] px-1.5 py-px text-[10px] font-medium text-[var(--primary)]">
                  Modelo de auditor
                </span>
              ) : null}
            </span>
            {saving && selected ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[var(--primary)]" aria-hidden />
            ) : selected ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                <Check className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : (
              <span className="h-6 w-6 shrink-0 rounded-full border border-[var(--border)]" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AgentsConfigCard() {
  const role = getStoredUser()?.role;
  const canPick = canPickInstances(role);
  const isDeveloper = role === "developer";

  const [instances, setInstances] = useState<ProviderInstanceSummary[]>([]);
  const [settings, setSettings] = useState<UserAISettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const auditorInstanceId = settings?.mddAuditorTenantInstanceId ?? "";
  const activeInstance = instances.find((i) => i.id === settings?.activeTenantInstanceId);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fetchInstances = canPick
        ? fetchAllProviderInstances
        : fetchEnabledProviderInstances;
      const [list, aiSettings] = await Promise.all([
        fetchInstances(),
        fetchUserAISettings(),
      ]);
      setInstances(list);
      setSettings(aiSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar agentes");
    } finally {
      setLoading(false);
    }
  }, [canPick]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAuditorChange(nextId: string) {
    if (!canPick) return;
    const value = nextId === "" ? null : nextId;
    if (value === (settings?.mddAuditorTenantInstanceId ?? null)) return;
    setSaving(true);
    setError("");
    setSavedFlash(false);
    try {
      const updated = await updateUserAISettings({
        mddAuditorTenantInstanceId: value,
      });
      setSettings(updated);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const selected = instances.find((i) => i.id === auditorInstanceId);
  const selectedModel = selected?.auditorChatModel?.trim() || selected?.chatModel;
  const runtimeLabel = activeInstance
    ? `${activeInstance.displayName} · ${activeInstance.chatModel}`
    : "Proveedor activo del equipo";

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
            Agentes del taller
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
            El grafo MDD usa tu proveedor activo. Solo el Auditor puede tener un modelo
            dedicado para la revisión final.
          </p>
        </div>
        {canPick ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0 gap-2 rounded-xl max-sm:w-full"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            Recargar
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] py-14 text-sm text-[var(--foreground-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Cargando configuración…
        </div>
      ) : null}

      {!loading && (
        <>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
            <div className="border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_22%,var(--card))] px-4 py-3 sm:px-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                Runtime del grafo
              </p>
              <p className="mt-1 truncate text-sm font-medium text-[var(--foreground)]">
                {runtimeLabel}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:gap-3 sm:p-4">
              {GRAPH_AGENTS.map(({ id, label, icon: Icon }) => (
                <div
                  key={id}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] px-2 py-3 text-center"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_oklch,var(--primary)_12%,var(--card))] text-[var(--primary)]">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--foreground)]">{label}</span>
                  <span className="text-[10px] text-[var(--foreground-muted)]">Activo</span>
                </div>
              ))}
            </div>
          </div>

          {isDeveloper ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_20%,var(--card))] px-5 py-8 text-center">
              <Bot className="mx-auto h-8 w-8 text-[var(--foreground-muted)]" aria-hidden />
              <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
                Proveedor del equipo
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground-muted)]">
                Como developer usas el predeterminado del equipo para todos los agentes,
                incluido el Auditor.
              </p>
            </div>
          ) : (
            <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_8px_32px_rgba(0,0,0,0.08)] sm:rounded-2xl">
              <div className="relative border-b border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_16%,var(--card)),var(--card))] px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_oklch,var(--primary)_22%,var(--card))] text-[var(--primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <ClipboardCheck className="h-6 w-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold tracking-tight text-[var(--foreground)] sm:text-lg">
                        Auditor MDD
                      </h3>
                      {savedFlash ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--success)]">
                          <Check className="h-3 w-3" aria-hidden />
                          Guardado
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--foreground-muted)]">
                      Revisión final del documento: score, gaps y decisión de aprobación.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                {instances.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_15%,var(--card))] px-4 py-6 text-center">
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Crea una instancia en{" "}
                      <span className="font-medium text-[var(--foreground)]">Proveedores de IA</span>{" "}
                      para asignar un modelo dedicado al Auditor.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        Proveedor del Auditor
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                        Toca una opción; se guarda al instante.
                      </p>
                    </div>

                    <AuditorInstancePicker
                      instances={instances}
                      value={auditorInstanceId}
                      disabled={!canPick}
                      saving={saving}
                      onSelect={(id) => void handleAuditorChange(id)}
                    />

                    {selected ? (
                      <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_20%,var(--card))] px-3.5 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                          Detalle
                        </p>
                        <p className="mt-1 text-sm text-[var(--foreground)]">
                          {getProviderLabel(selected.providerType)} ·{" "}
                          <span className="font-mono text-xs text-[var(--foreground-muted)]">
                            {selected.slug}
                          </span>
                        </p>
                        <p className="mt-1 truncate font-mono text-xs text-[var(--foreground-muted)]">
                          {selectedModel}
                          {selected.auditorChatModel?.trim() ? " · modelo de auditor" : ""}
                          {selected.apiKeyHint ? ` · ${selected.apiKeyHint}` : ""}
                        </p>
                      </div>
                    ) : (
                      <p className="rounded-xl bg-[color-mix(in_oklch,var(--primary)_8%,var(--card))] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--foreground-muted)]">
                        Sin override: el Auditor usa el mismo runtime que la instancia marcada
                        como <span className="font-medium text-[var(--primary)]">Activa</span> en
                        Proveedores.
                      </p>
                    )}
                  </>
                )}
              </div>
            </article>
          )}

          <div className="rounded-2xl border border-[var(--border)] bg-[color-mix(in_oklch,var(--muted)_18%,var(--card))] px-4 py-3.5 sm:px-5">
            <p className="text-xs leading-relaxed text-[var(--foreground-muted)]">
              <span className="font-medium text-[var(--foreground)]">Tip:</span> usa un modelo
              más capaz solo en la revisión (p. ej. Opus) y deja Clarificador, Arquitecto y
              Seguridad en un modelo más rápido. En el modal de la instancia puedes definir un{" "}
              <span className="font-medium">modelo de auditor</span> distinto al de chat.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
