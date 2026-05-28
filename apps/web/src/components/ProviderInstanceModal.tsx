import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "./ui";
import { ProviderConfigFormFields } from "./ProviderConfigFormFields";
import { ProviderTypePicker } from "./ProviderTypePicker";
import { ProviderLogo } from "./ProviderLogo";
import type {
  ProviderCatalogEntry,
  ProviderId,
  ProviderInstanceSummary,
  UserAISettings,
} from "@/types/user-providers";
import { fetchProviderCatalog, updateUserAISettings } from "@/lib/user-providers-api";
import { createProviderInstance, updateProviderInstance } from "@/lib/provider-instances-api";
import {
  normalizeProviderInstanceSlug,
  validateProviderInstanceMeta,
  type ProviderInstanceMetaErrors,
  type ProviderInstanceMetaFields,
} from "@/utils/provider-instance-form";
import {
  buildProviderExtrasPayload,
  configFormFromInstance,
  createEmptyUserProviderForm,
  parseFallbacks,
  validateUserProviderForm,
  type UserProviderFormErrors,
  type UserProviderFormFields,
  type UserProviderFormState,
} from "@/utils/user-provider-form";
import { cn } from "@/lib/utils";

interface ProviderInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ProviderInstanceSummary | null;
  existingInstances?: ProviderInstanceSummary[];
  isSuperAdmin: boolean;
  activeInstanceId: string | null;
  userSettings: UserAISettings | null;
  onSaved: () => void | Promise<void>;
}

function FormField({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)]">
        {label}
        {required ? <span className="text-[var(--destructive)]"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[var(--foreground-muted)]">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-[var(--destructive)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProviderInstanceModal({
  open,
  onOpenChange,
  editing,
  existingInstances = [],
  isSuperAdmin,
  activeInstanceId,
  userSettings,
  onSaved,
}: ProviderInstanceModalProps) {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>([]);
  const [providerType, setProviderType] = useState<ProviderId>("openrouter");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [configForm, setConfigForm] = useState<UserProviderFormState>({
    apiKey: "",
    chatModel: "",
    chatModelFallbacks: "",
    auditorChatModel: "",
    embeddingModel: "",
    sttModel: "",
    visionModel: "",
    visionModelFallback: "",
    baseUrl: "",
    extras: {},
  });
  const [enabledForUsers, setEnabledForUsers] = useState(false);
  const [isTenantDefault, setIsTenantDefault] = useState(false);
  const [setAsActive, setSetAsActive] = useState(false);
  const [embeddingsEnabled, setEmbeddingsEnabled] = useState(true);
  const [embeddingProvider, setEmbeddingProvider] = useState<ProviderId | "">("");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [metaErrors, setMetaErrors] = useState<ProviderInstanceMetaErrors>({});
  const [configErrors, setConfigErrors] = useState<UserProviderFormErrors>({});
  const [metaTouched, setMetaTouched] = useState<Partial<Record<ProviderInstanceMetaFields, boolean>>>({});
  const [configTouched, setConfigTouched] = useState<Partial<Record<UserProviderFormFields, boolean>>>({});

  const activeCatalog = catalog.find((c) => c.id === providerType);
  const isEditing = !!editing;
  const editingId = editing?.id ?? null;

  const clearConfigFieldError = useCallback((field: UserProviderFormFields) => {
    setConfigErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  function resetAll(inst: ProviderInstanceSummary | null | undefined, cat: ProviderCatalogEntry[]) {
    setCatalogError("");
    setSubmitError("");
    setMetaErrors({});
    setConfigErrors({});
    setMetaTouched({});
    setConfigTouched({});
    setApiKeyVisible(false);

    if (inst) {
      const c = cat.find((x) => x.id === inst.providerType);
      setProviderType(inst.providerType);
      setSlug(inst.slug);
      setDisplayName(inst.displayName);
      setEnabledForUsers(inst.enabledForUsers);
      setIsTenantDefault(inst.isTenantDefault);
      setSetAsActive(activeInstanceId === inst.id);
      if (c) setConfigForm(configFormFromInstance(inst, c));
    } else {
      const type = cat[0]?.id ?? "openrouter";
      const c = cat.find((x) => x.id === type) ?? cat[0];
      setProviderType(type);
      setSlug("");
      setDisplayName("");
      setEnabledForUsers(false);
      setIsTenantDefault(false);
      setSetAsActive(false);
      if (c) setConfigForm(createEmptyUserProviderForm(c));
    }
    setEmbeddingsEnabled(userSettings?.embeddingsEnabled ?? true);
    setEmbeddingProvider(
      (userSettings?.embeddingProvider as ProviderId | null) ?? "",
    );
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCatalogError("");
    void fetchProviderCatalog()
      .then((cat) => {
        if (cancelled) return;
        setCatalog(cat);
        resetAll(editing, cat);
      })
      .catch((err) => {
        if (cancelled) return;
        setCatalog([]);
        setCatalogError(
          err instanceof Error ? err.message : "No se pudo cargar el catálogo de proveedores",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, editingId]);

  const slugsForType = existingInstances
    .filter((i) => i.providerType === providerType && i.id !== editing?.id)
    .map((i) => i.slug);

  function runValidation(markTouched = true) {
    const nextMeta = validateProviderInstanceMeta({
      editing: isEditing,
      slug,
      displayName,
      takenSlugsForType: slugsForType,
    });
    const nextConfig = activeCatalog
      ? validateUserProviderForm({ catalog: activeCatalog, form: configForm, isEditing })
      : {};
    setMetaErrors(nextMeta);
    setConfigErrors(nextConfig);
    if (markTouched) {
      setMetaTouched({ slug: true, displayName: true });
      const allConfig: Partial<Record<UserProviderFormFields, boolean>> = {
        apiKey: true,
        chatModel: true,
        chatModelFallbacks: true,
        auditorChatModel: true,
        embeddingModel: true,
        sttModel: true,
        visionModel: true,
        visionModelFallback: true,
        baseUrl: true,
      };
      for (const field of activeCatalog?.extraFields ?? []) {
        allConfig[`extra:${field.key}`] = true;
      }
      setConfigTouched(allConfig);
    }
    return { ...nextMeta, ...nextConfig };
  }

  function showMetaError(field: ProviderInstanceMetaFields) {
    return metaTouched[field] ? metaErrors[field] : undefined;
  }

  function showConfigError(field: UserProviderFormFields) {
    return configTouched[field] ? configErrors[field] : undefined;
  }

  const metaInputErrorClass = (field: ProviderInstanceMetaFields) =>
    cn(showMetaError(field) && "border-[var(--destructive)] focus-visible:ring-[var(--destructive)]");

  const configInputErrorClass = (field: UserProviderFormFields) =>
    cn(showConfigError(field) && "border-[var(--destructive)] focus-visible:ring-[var(--destructive)]");

  function focusFirstInvalidField(formId: string) {
    queueMicrotask(() => {
      const root = document.getElementById(formId);
      const invalid =
        root?.querySelector<HTMLElement>("[aria-invalid='true']") ??
        root?.querySelector<HTMLElement>("[role='alert']");
      invalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (invalid && "focus" in invalid && typeof invalid.focus === "function") {
        invalid.focus();
      }
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCatalog) {
      setSubmitError(
        catalogError || "El catálogo de proveedores no está listo. Cierra el modal e inténtalo de nuevo.",
      );
      return;
    }
    setSubmitError("");
    const errors = runValidation(true);
    const errorCount = Object.keys(errors).length;
    if (errorCount > 0) {
      const firstMessage = Object.values(errors).find(Boolean);
      setSubmitError(
        errorCount === 1 && firstMessage
          ? firstMessage
          : `Hay ${errorCount} errores. Revisa los campos resaltados en rojo.`,
      );
      focusFirstInvalidField("provider-instance-form");
      return;
    }

    setSaving(true);
    try {
      const normalizedSlug = normalizeProviderInstanceSlug(slug);
      const extras = buildProviderExtrasPayload(activeCatalog, configForm);
      const body = {
        providerType,
        slug: isEditing ? editing!.slug : normalizedSlug,
        displayName: displayName.trim(),
        apiKey: configForm.apiKey.trim(),
        chatModel: configForm.chatModel.trim(),
        chatModelFallbacks: parseFallbacks(configForm.chatModelFallbacks),
        auditorChatModel: configForm.auditorChatModel.trim() || null,
        embeddingModel: activeCatalog.supportsEmbeddings
          ? configForm.embeddingModel.trim() || null
          : null,
        sttModel: activeCatalog.supportsStt ? configForm.sttModel.trim() || null : null,
        visionModel: activeCatalog.supportsVision
          ? configForm.visionModel.trim() || null
          : null,
        baseUrl: activeCatalog.baseUrlEditable ? configForm.baseUrl.trim() || null : null,
        extras: Object.keys(extras).length > 0 ? extras : null,
        enabledForUsers: isSuperAdmin ? enabledForUsers : false,
        isTenantDefault: isSuperAdmin ? isTenantDefault : false,
        allowedChatModels: [] as string[],
        allowedEmbeddingModels: [] as string[],
      };
      let saved: ProviderInstanceSummary;
      if (isEditing) {
        const { apiKey: _omit, ...rest } = body;
        saved = await updateProviderInstance(editing!.id, {
          ...rest,
          ...(configForm.apiKey.trim() ? { apiKey: configForm.apiKey.trim() } : {}),
        });
      } else {
        saved = await createProviderInstance(body);
      }
      if (setAsActive) {
        await updateUserAISettings({
          activeTenantInstanceId: saved.id,
          embeddingsEnabled,
          embeddingProvider: embeddingProvider || null,
        });
      }
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAll(null, catalog);
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="xl"
        className={cn(
          "flex max-h-[90dvh] flex-col gap-0 p-0",
          "sm:max-w-2xl sm:rounded-lg",
          "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:max-h-[min(94dvh,720px)] max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
          "max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
          "max-sm:data-[state=open]:slide-in-from-bottom-8 max-sm:data-[state=closed]:slide-out-to-bottom-8",
          "max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0",
          "max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0",
          "max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100",
        )}
      >
        <form
          id="provider-instance-form"
          key={isEditing ? `edit-${editingId}` : "create"}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          autoComplete="off"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <div
            className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--border)] sm:hidden"
            aria-hidden
          />
          <DialogHeader className="shrink-0 space-y-2 px-4 pt-4 text-left sm:px-6 sm:pt-6">
            <div className="flex items-center gap-3">
              {activeCatalog ? <ProviderLogo provider={providerType} size="md" /> : null}
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-left text-base sm:text-lg">
                  {isEditing ? "Editar instancia" : "Nueva instancia"}
                </DialogTitle>
                <DialogDescription className="text-left text-xs sm:text-sm">
                  Elige proveedor, API key y modelos. Marca como activa para el taller.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable] sm:px-6">
          <div className="space-y-4">
            {catalogError && !activeCatalog ? (
              <p
                className="rounded-md border border-[color-mix(in_oklch,var(--destructive)_42%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))] px-3 py-2 text-sm text-[var(--destructive)]"
                role="alert"
              >
                {catalogError}
              </p>
            ) : null}
            {submitError ? (
              <p
                className="rounded-md border border-[color-mix(in_oklch,var(--destructive)_42%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))] px-3 py-2 text-sm text-[var(--destructive)]"
                role="alert"
              >
                {submitError}
              </p>
            ) : null}
            {!isEditing && slugsForType.length > 0 ? (
              <p className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--foreground-muted)]">
                Instancias {providerType} existentes:{" "}
                <span className="font-mono">{slugsForType.join(", ")}</span>. Elige un slug nuevo.
              </p>
            ) : null}
            <FormField id="provider-type" label="Proveedor" required>
              {isEditing ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/30 px-3.5 py-3">
                  <ProviderLogo provider={providerType} size="md" />
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {activeCatalog?.label ?? providerType}
                  </span>
                </div>
              ) : catalog.length > 0 ? (
                <ProviderTypePicker
                  catalog={catalog}
                  value={providerType}
                  onChange={(id) => {
                    setProviderType(id);
                    const c = catalog.find((x) => x.id === id);
                    if (c) setConfigForm(createEmptyUserProviderForm(c));
                  }}
                />
              ) : null}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="slug"
                label="Slug"
                required={!isEditing}
                hint="Único por tipo (ej. pruebas-openrouter)"
                error={showMetaError("slug")}
              >
                <Input
                  id="slug"
                  name="provider-instance-slug"
                  autoComplete="off"
                  value={slug}
                  disabled={isEditing}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setMetaErrors((p) => {
                      const n = { ...p };
                      delete n.slug;
                      return n;
                    });
                  }}
                  onBlur={() => {
                    setMetaTouched((t) => ({ ...t, slug: true }));
                    setSlug((s) => normalizeProviderInstanceSlug(s));
                    runValidation(false);
                  }}
                  placeholder="equipo-openrouter"
                  className={metaInputErrorClass("slug")}
                />
              </FormField>
            </div>
            <FormField
              id="display-name"
              label="Nombre para mostrar"
              required
              error={showMetaError("displayName")}
            >
              <Input
                id="display-name"
                name="provider-instance-display-name"
                autoComplete="off"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setMetaErrors((p) => {
                    const n = { ...p };
                    delete n.displayName;
                    return n;
                  });
                }}
                onBlur={() => {
                  setMetaTouched((t) => ({ ...t, displayName: true }));
                  runValidation(false);
                }}
                placeholder="OpenRouter — equipo"
                className={metaInputErrorClass("displayName")}
              />
            </FormField>

            {activeCatalog ? (
              <ProviderConfigFormFields
                idPrefix="team"
                catalog={activeCatalog}
                form={configForm}
                isEditing={isEditing}
                apiKeyVisible={apiKeyVisible}
                onToggleApiKeyVisible={() => setApiKeyVisible((v) => !v)}
                onPatch={(patch) => setConfigForm((prev) => ({ ...prev, ...patch }))}
                onBlurField={(field) => {
                  setConfigTouched((t) => ({ ...t, [field]: true }));
                  runValidation(false);
                }}
                onClearFieldError={clearConfigFieldError}
                showError={showConfigError}
                inputErrorClass={configInputErrorClass}
              />
            ) : null}

            <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3">
              <p className="text-sm font-medium text-[var(--foreground)]">Uso en el taller</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={setAsActive}
                  onChange={(e) => setSetAsActive(e.target.checked)}
                />
                Usar como instancia activa
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span>Habilitar embeddings en el grafo</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={embeddingsEnabled}
                  onClick={() => setEmbeddingsEnabled((v) => !v)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
                    embeddingsEnabled
                      ? "bg-[var(--primary)]"
                      : "bg-[color-mix(in_oklch,var(--muted-foreground)_25%,var(--border))]",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                      embeddingsEnabled ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </button>
              </label>
              {activeCatalog && !activeCatalog.supportsEmbeddings ? (
                <FormField id="embedding-provider-pick" label="Proveedor de embeddings">
                  <select
                    id="embedding-provider-pick"
                    className="flex h-9 w-full rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 py-1 text-sm"
                    value={embeddingProvider}
                    onChange={(e) =>
                      setEmbeddingProvider(e.target.value as ProviderId | "")
                    }
                  >
                    <option value="">— Mismo que chat si aplica —</option>
                    {catalog
                      .filter((c) => c.supportsEmbeddings)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </FormField>
              ) : null}
            </div>
            {isSuperAdmin ? (
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enabledForUsers}
                    onChange={(e) => {
                      setEnabledForUsers(e.target.checked);
                      if (!e.target.checked) setIsTenantDefault(false);
                    }}
                  />
                  Visible para el equipo
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isTenantDefault}
                    disabled={!enabledForUsers}
                    onChange={(e) => setIsTenantDefault(e.target.checked)}
                  />
                  Predeterminado del tenant
                </label>
              </div>
            ) : null}
          </div>
          </div>
          <DialogFooter className="shrink-0 flex flex-col gap-2 border-t border-[var(--border)] px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button
              type="submit"
              disabled={saving || !activeCatalog}
              className="h-11 w-full rounded-xl sm:order-2 sm:w-auto"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : isEditing ? (
                "Guardar cambios"
              ) : (
                "Crear instancia"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl sm:order-1 sm:w-auto"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
