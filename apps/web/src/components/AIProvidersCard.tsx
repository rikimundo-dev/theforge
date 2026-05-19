import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
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
  upsertProviderConfig,
} from "@/lib/user-providers-api";

interface ProviderFormState {
  apiKey: string;
  chatModel: string;
  chatModelFallbacks: string;
  embeddingModel: string;
  sttModel: string;
  baseUrl: string;
  extras: Record<string, string>;
}

function emptyForm(catalog: ProviderCatalogEntry): ProviderFormState {
  return {
    apiKey: "",
    chatModel: catalog.defaultChatModel,
    chatModelFallbacks: "",
    embeddingModel: catalog.defaultEmbeddingModel ?? "",
    sttModel: catalog.defaultSttModel ?? "",
    baseUrl: catalog.defaultBaseUrl,
    extras: Object.fromEntries(
      (catalog.extraFields ?? []).map((f) => [f.key, ""]),
    ),
  };
}

function formFromConfig(
  catalog: ProviderCatalogEntry,
  cfg: UserProviderConfigSummary,
): ProviderFormState {
  const extrasRaw = (cfg.extras ?? {}) as Record<string, unknown>;
  const extras: Record<string, string> = Object.fromEntries(
    (catalog.extraFields ?? []).map((f) => {
      const v = extrasRaw[f.key];
      if (typeof v === "string") return [f.key, v];
      if (v != null && f.key === "headers") return [f.key, JSON.stringify(v)];
      return [f.key, ""];
    }),
  );
  return {
    apiKey: "",
    chatModel: cfg.chatModel || catalog.defaultChatModel,
    chatModelFallbacks: cfg.chatModelFallbacks?.join(", ") ?? "",
    embeddingModel: cfg.embeddingModel ?? catalog.defaultEmbeddingModel ?? "",
    sttModel: cfg.sttModel ?? catalog.defaultSttModel ?? "",
    baseUrl: cfg.baseUrl ?? catalog.defaultBaseUrl,
    extras,
  };
}

function parseFallbacks(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildExtrasPayload(
  catalog: ProviderCatalogEntry,
  extras: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of catalog.extraFields ?? []) {
    const raw = extras[field.key]?.trim() ?? "";
    if (!raw) continue;
    if (field.key === "headers") {
      try {
        out.headers = JSON.parse(raw) as unknown;
      } catch {
        out.headers = raw;
      }
    } else {
      out[field.key] = raw;
    }
  }
  return out;
}

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
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

function ModelField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  placeholder?: string;
}) {
  if (options?.length) {
    return (
      <Field id={id} label={label}>
        <select
          id={id}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {!options.includes(value) && value ? (
            <option value={value}>{value}</option>
          ) : null}
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <Field id={id} label={label}>
      <input
        id={id}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function AIProvidersCard() {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [configs, setConfigs] = useState<UserProviderConfigSummary[]>([]);
  const [settings, setSettings] = useState<UserAISettings | null>(null);
  const [activeTab, setActiveTab] = useState<ProviderId>("openrouter");
  const [forms, setForms] = useState<Partial<Record<ProviderId, ProviderFormState>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const configByProvider = useMemo(() => {
    const map = new Map<ProviderId, UserProviderConfigSummary>();
    for (const c of configs) map.set(c.provider, c);
    return map;
  }, [configs]);

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
      const nextForms: Partial<Record<ProviderId, ProviderFormState>> = {};
      for (const entry of cat) {
        const existing = cfgMap.get(entry.id);
        nextForms[entry.id] = existing
          ? formFromConfig(entry, existing)
          : emptyForm(entry);
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

  const form = forms[activeTab];
  const setForm = (patch: Partial<ProviderFormState>) => {
    setForms((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab]!, ...patch },
    }));
  };

  const handleSave = async () => {
    if (!activeCatalog || !form) return;
    if (!form.apiKey.trim()) {
      setError("La clave API es obligatoria para guardar.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await upsertProviderConfig(activeTab, {
        apiKey: form.apiKey.trim(),
        chatModel: form.chatModel.trim() || activeCatalog.defaultChatModel,
        chatModelFallbacks: parseFallbacks(form.chatModelFallbacks),
        embeddingModel: activeCatalog.supportsEmbeddings
          ? form.embeddingModel.trim() || activeCatalog.defaultEmbeddingModel
          : null,
        sttModel: activeCatalog.supportsStt
          ? form.sttModel.trim() || activeCatalog.defaultSttModel
          : null,
        baseUrl: activeCatalog.baseUrlEditable ? form.baseUrl.trim() : null,
        extras: buildExtrasPayload(activeCatalog, form.extras),
      });
      setConfigs((prev) => {
        const rest = prev.filter((c) => c.provider !== activeTab);
        return [...rest, saved].sort((a, b) =>
          a.provider.localeCompare(b.provider),
        );
      });
      setForm({ apiKey: "" });
      setSuccess(`Proveedor «${activeCatalog.label}» guardado correctamente`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

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
        [activeTab]: emptyForm(activeCatalog),
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
        "Guarda primero la clave API de este proveedor antes de marcarlo como activo.",
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
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10">
            <Bot className="h-5 w-5 text-[var(--primary)]" />
          </div>
          <div>
            <CardTitle>Proveedores de IA</CardTitle>
            <CardDescription>
              Conecta tus claves API (BYOK) para chat, embeddings y transcripción.
              Elige un proveedor activo para el taller.
            </CardDescription>
          </div>
        </div>
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

            {activeCatalog && form ? (
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
                  {activeCatalog.apiKeyHelpUrl ? (
                    <a
                      href={activeCatalog.apiKeyHelpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                    >
                      Obtener clave API
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>

                <Field id={`${activeTab}-api-key`} label="Clave API">
                  <div className="relative">
                    <input
                      id={`${activeTab}-api-key`}
                      type={apiKeyVisible ? "text" : "password"}
                      autoComplete="off"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 pr-10 text-sm"
                      placeholder={
                        isConfigured
                          ? "Introduce la clave para actualizar"
                          : "sk-… o clave del proveedor"
                      }
                      value={form.apiKey}
                      onChange={(e) => setForm({ apiKey: e.target.value })}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]"
                      onClick={() => setApiKeyVisible((v) => !v)}
                      tabIndex={-1}
                    >
                      {apiKeyVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>

                <ModelField
                  id={`${activeTab}-chat`}
                  label="Modelo de chat"
                  value={form.chatModel}
                  onChange={(v) => setForm({ chatModel: v })}
                  options={
                    activeCatalog.chatModels?.length
                      ? [
                          activeCatalog.defaultChatModel,
                          ...activeCatalog.chatModels,
                        ].filter((v, i, a) => a.indexOf(v) === i)
                      : undefined
                  }
                  placeholder={activeCatalog.defaultChatModel}
                />

                <Field
                  id={`${activeTab}-fallbacks`}
                  label="Modelos de respaldo (opcional)"
                  hint="Separados por coma. Se usan si el modelo principal falla."
                >
                  <input
                    id={`${activeTab}-fallbacks`}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm"
                    value={form.chatModelFallbacks}
                    onChange={(e) =>
                      setForm({ chatModelFallbacks: e.target.value })
                    }
                  />
                </Field>

                {activeCatalog.supportsEmbeddings ? (
                  <ModelField
                    id={`${activeTab}-emb`}
                    label="Modelo de embeddings"
                    value={form.embeddingModel}
                    onChange={(v) => setForm({ embeddingModel: v })}
                    options={activeCatalog.embeddingModels}
                    placeholder={activeCatalog.defaultEmbeddingModel ?? ""}
                  />
                ) : null}

                {activeCatalog.supportsStt ? (
                  <ModelField
                    id={`${activeTab}-stt`}
                    label="Modelo de transcripción (STT)"
                    value={form.sttModel}
                    onChange={(v) => setForm({ sttModel: v })}
                    placeholder={activeCatalog.defaultSttModel ?? "whisper-1"}
                  />
                ) : null}

                {activeCatalog.baseUrlEditable ? (
                  <Field
                    id={`${activeTab}-base`}
                    label="URL base"
                    hint="Para Cloudflare se construye a partir del Account ID."
                  >
                    <input
                      id={`${activeTab}-base`}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 font-mono text-xs"
                      value={form.baseUrl}
                      onChange={(e) => setForm({ baseUrl: e.target.value })}
                    />
                  </Field>
                ) : null}

                {(activeCatalog.extraFields ?? []).map((field) => (
                  <Field
                    key={field.key}
                    id={`${activeTab}-extra-${field.key}`}
                    label={field.label + (field.required ? " *" : "")}
                    hint={field.helpText}
                  >
                    <input
                      id={`${activeTab}-extra-${field.key}`}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm"
                      placeholder={field.placeholder}
                      value={form.extras[field.key] ?? ""}
                      onChange={(e) =>
                        setForm({
                          extras: {
                            ...form.extras,
                            [field.key]: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                ))}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => void handleSave()}
                    loading={saving}
                    disabled={saving || !form.apiKey.trim()}
                  >
                    <Check className="h-4 w-4" />
                    Guardar
                  </Button>
                  <Button
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
  );
}
