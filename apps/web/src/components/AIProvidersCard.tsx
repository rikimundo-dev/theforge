import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui";
import {
  Bot,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProviderCatalogEntry,
  ProviderId,
  UserAISettings,
  UserProviderConfigSummary,
} from "@/types/user-providers";
import {
  deleteProviderConfig,
  fetchProviderCatalog,
  fetchUserAISettings,
  fetchUserProviderConfigs,
  updateUserAISettings,
} from "@/lib/user-providers-api";
import {
  configFormFromUserConfig,
  createEmptyUserProviderForm,
  type UserProviderFormState,
} from "@/utils/user-provider-form";
import { UserProviderConfigModal } from "./UserProviderConfigModal";

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-[var(--foreground-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

interface AIProvidersCardProps {
  /** Super_admin: esta tarjeta es BYOK personal, no instancias del equipo. */
  personalMode?: boolean;
}

export function AIProvidersCard({ personalMode = false }: AIProvidersCardProps) {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [configs, setConfigs] = useState<UserProviderConfigSummary[]>([]);
  const [settings, setSettings] = useState<UserAISettings | null>(null);
  const [activeTab, setActiveTab] = useState<ProviderId>("openrouter");
  const [forms, setForms] = useState<Partial<Record<ProviderId, UserProviderFormState>>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalProvider, setModalProvider] = useState<ProviderId>("openrouter");
  const [modalAddMode, setModalAddMode] = useState(false);

  const configByProvider = useMemo(() => {
    const map = new Map<ProviderId, UserProviderConfigSummary>();
    for (const c of configs) map.set(c.provider, c);
    return map;
  }, [configs]);

  const configuredIds = useMemo(
    () => new Set(configs.map((c) => c.provider)),
    [configs],
  );

  const activeCatalog = catalog.find((c) => c.id === activeTab);
  const activeConfig = configByProvider.get(activeTab);
  const isConfigured = !!activeConfig?.configured;

  const embeddingCapableConfigured = useMemo(
    () =>
      catalog.filter(
        (c) => c.supportsEmbeddings && configByProvider.has(c.id),
      ),
    [catalog, configByProvider],
  );

  const activeSupportsEmbeddings =
    settings?.activeProvider != null &&
    catalog.find((c) => c.id === settings.activeProvider)?.supportsEmbeddings;

  const showEmbeddingProviderSelector =
    !activeSupportsEmbeddings && embeddingCapableConfigured.length > 0;

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [cat, cfgs, st] = await Promise.all([
        fetchProviderCatalog(),
        fetchUserProviderConfigs(),
        fetchUserAISettings(),
      ]);
      setCatalog(cat);
      setConfigs(cfgs);
      setSettings(st);

      const cfgMap = new Map(cfgs.map((c) => [c.provider, c]));
      const nextForms: Partial<Record<ProviderId, UserProviderFormState>> = {};
      for (const entry of cat) {
        const existing = cfgMap.get(entry.id);
        nextForms[entry.id] = existing
          ? configFormFromUserConfig(entry, existing)
          : createEmptyUserProviderForm(entry);
      }
      setForms(nextForms);

      if (st.activeProvider && cat.some((c) => c.id === st.activeProvider)) {
        setActiveTab(st.activeProvider);
      } else if (cfgs.length > 0) {
        setActiveTab(cfgs[0]!.provider);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al cargar proveedores de IA",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function openAddModal() {
    const firstFree =
      catalog.find((c) => !configuredIds.has(c.id))?.id ?? catalog[0]?.id ?? "openrouter";
    setModalProvider(firstFree);
    setModalAddMode(true);
    setModalOpen(true);
  }

  function openEditModal(provider: ProviderId) {
    setModalProvider(provider);
    setModalAddMode(false);
    setActiveTab(provider);
    setModalOpen(true);
  }

  const modalCatalogEntry = catalog.find((c) => c.id === modalProvider);
  const modalForm =
    forms[modalProvider] ??
    (modalCatalogEntry ? createEmptyUserProviderForm(modalCatalogEntry) : undefined);

  const handleDelete = async () => {
    if (!activeCatalog) return;
    if (
      !confirm(
        `¿Eliminar la configuración de ${activeCatalog.label}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError("");
    setSuccess("");
    try {
      await deleteProviderConfig(activeTab);
      setConfigs((prev) => prev.filter((c) => c.provider !== activeTab));
      setForms((prev) => ({
        ...prev,
        [activeTab]: createEmptyUserProviderForm(activeCatalog),
      }));
      const st = await fetchUserAISettings();
      setSettings(st);
      setSuccess(`Configuración de «${activeCatalog.label}» eliminada`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  const handleSetActive = async () => {
    if (!isConfigured) {
      setError(
        "Configura primero este proveedor antes de marcarlo como activo.",
      );
      return;
    }
    setSettingsSaving(true);
    setError("");
    setSuccess("");
    try {
      const st = await updateUserAISettings({ activeProvider: activeTab });
      setSettings(st);
      setSuccess(`«${activeCatalog?.label}» es ahora tu proveedor activo`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar ajustes");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleEmbeddingProviderChange = async (providerId: ProviderId | "") => {
    setSettingsSaving(true);
    setError("");
    try {
      const st = await updateUserAISettings({
        embeddingProvider: providerId || null,
      });
      setSettings(st);
      setSuccess("Proveedor de embeddings actualizado");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al actualizar embeddings",
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleEmbeddingsToggle = async (enabled: boolean) => {
    setSettingsSaving(true);
    setError("");
    try {
      const st = await updateUserAISettings({ embeddingsEnabled: enabled });
      setSettings(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar ajustes");
    } finally {
      setSettingsSaving(false);
    }
  };

  const errorCta = useMemo(() => {
    const match = error.match(/«([^»]+)»/);
    if (!match) return null;
    const token = match[1]!;
    const byId = catalog.find((c) => c.id === token);
    if (byId) return byId.id;
    return catalog.find((c) => c.label === token)?.id ?? null;
  }, [error, catalog]);

  return (
    <>
      <Card variant="bordered">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
              <Bot className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <CardTitle>{personalMode ? "BYOK personal" : "Proveedores de IA"}</CardTitle>
              <CardDescription>
                {personalMode
                  ? "Una clave por tipo solo para tu usuario. Para el equipo usa «Proveedores del equipo» arriba."
                  : "Conecta tus claves API (BYOK) para chat, embeddings y transcripción."}
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={loading}
            onClick={openAddModal}
          >
            <Plus className="mr-1 h-4 w-4" />
            Agregar nuevo proveedor
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-[var(--foreground-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando proveedores…
            </div>
          ) : (
            <div className="space-y-4">
              {success ? (
                <div className="rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/10 px-4 py-3 text-sm text-[var(--foreground)]">
                  {success}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-lg border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)] space-y-2">
                  <p>{error}</p>
                  {errorCta ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[var(--destructive)]/40"
                      onClick={() => {
                        setActiveTab(errorCta);
                        setError("");
                      }}
                    >
                      Ir a{" "}
                      {catalog.find((c) => c.id === errorCta)?.label ?? errorCta}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3 space-y-3">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Ajustes globales
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[var(--foreground-muted)]">Activo:</span>
                  {settings?.activeProvider ? (
                    <Badge variant="default">
                      {catalog.find((c) => c.id === settings.activeProvider)
                        ?.label ?? settings.activeProvider}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Sin proveedor activo</Badge>
                  )}
                </div>

                {showEmbeddingProviderSelector ? (
                  <Field
                    id="embedding-provider"
                    label="Proveedor de embeddings"
                    hint="Tu proveedor activo no expone embeddings; elige otro configurado."
                  >
                    <select
                      id="embedding-provider"
                      disabled={settingsSaving}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm"
                      value={settings?.embeddingProvider ?? ""}
                      onChange={(e) =>
                        void handleEmbeddingProviderChange(
                          e.target.value as ProviderId | "",
                        )
                      }
                    >
                      <option value="">— Seleccionar —</option>
                      {embeddingCapableConfigured.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm text-[var(--foreground)]">
                    Habilitar embeddings en el grafo
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings?.embeddingsEnabled ?? true}
                    disabled={settingsSaving}
                    onClick={() =>
                      void handleEmbeddingsToggle(
                        !(settings?.embeddingsEnabled ?? true),
                      )
                    }
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                      settings?.embeddingsEnabled !== false
                        ? "bg-[var(--primary)]"
                        : "bg-[color-mix(in_oklch,var(--muted-foreground)_25%,var(--border))]",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        settings?.embeddingsEnabled !== false
                          ? "translate-x-4"
                          : "translate-x-0",
                      )}
                    />
                  </button>
                </label>
              </div>

              <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                {catalog.map((entry) => {
                  const configured = configByProvider.has(entry.id);
                  const isActive = settings?.activeProvider === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setActiveTab(entry.id)}
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border",
                        activeTab === entry.id
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]"
                          : "border-transparent bg-[var(--muted)]/50 text-[var(--foreground-muted)] hover:text-[var(--foreground)]",
                      )}
                    >
                      {entry.label}
                      {configured ? (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                      ) : null}
                      {isActive ? (
                        <Star className="ml-1 inline h-3 w-3 text-[var(--primary)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {activeCatalog ? (
                <div className="space-y-4 border-t border-[var(--border)] pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={isConfigured ? "default" : "outline"}>
                      {isConfigured ? "Configurado" : "No configurado"}
                    </Badge>
                    {isConfigured && activeConfig?.apiKeyHint ? (
                      <span className="text-xs text-[var(--foreground-muted)] font-mono">
                        Clave: {activeConfig.apiKeyHint}
                      </span>
                    ) : null}
                  </div>

                  {isConfigured ? (
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[var(--foreground-muted)]">Modelo de chat</dt>
                        <dd className="font-mono text-xs">{activeConfig?.chatModel}</dd>
                      </div>
                      {activeConfig?.chatModelFallbacks?.length ? (
                        <div>
                          <dt className="text-[var(--foreground-muted)]">Respaldo</dt>
                          <dd className="font-mono text-xs">
                            {activeConfig.chatModelFallbacks.join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      {activeConfig?.embeddingModel ? (
                        <div>
                          <dt className="text-[var(--foreground-muted)]">Embeddings</dt>
                          <dd className="font-mono text-xs">{activeConfig.embeddingModel}</dd>
                        </div>
                      ) : null}
                      {activeConfig?.sttModel ? (
                        <div>
                          <dt className="text-[var(--foreground-muted)]">STT</dt>
                          <dd className="font-mono text-xs">{activeConfig.sttModel}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Aún no has configurado {activeCatalog.label}. Usa el botón para añadir la
                      clave API y los modelos.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => openEditModal(activeTab)}
                    >
                      <Pencil className="h-4 w-4" />
                      {isConfigured ? "Editar configuración" : "Configurar proveedor"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSetActive()}
                      loading={settingsSaving}
                      disabled={
                        settingsSaving ||
                        !isConfigured ||
                        settings?.activeProvider === activeTab
                      }
                    >
                      <Star className="h-4 w-4" />
                      {settings?.activeProvider === activeTab
                        ? "Proveedor activo"
                        : "Marcar como activo"}
                    </Button>
                    {isConfigured ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-[var(--destructive)]"
                        onClick={() => void handleDelete()}
                        loading={deleting}
                        disabled={deleting}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {modalForm ? (
        <UserProviderConfigModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          catalog={catalog}
          providerId={modalProvider}
          onProviderIdChange={setModalProvider}
          allowProviderPick={modalAddMode}
          configuredProviderIds={configuredIds}
          showMultiInstanceHint={personalMode}
          initialForm={modalForm}
          existingConfig={configByProvider.get(modalProvider) ?? null}
          onSaved={async () => {
            await loadAll();
            setSuccess(
              modalAddMode
                ? "Proveedor guardado correctamente"
                : "Configuración actualizada",
            );
          }}
        />
      ) : null}
    </>
  );
}
