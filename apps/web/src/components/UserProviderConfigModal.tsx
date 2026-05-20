import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { ProviderConfigFormFields } from "./ProviderConfigFormFields";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui";
import { cn } from "@/lib/utils";
import type {
  ProviderCatalogEntry,
  ProviderId,
  UserProviderConfigSummary,
} from "@/types/user-providers";
import { upsertProviderConfig } from "@/lib/user-providers-api";
import {
  buildExtrasPayload,
  createEmptyUserProviderForm,
  parseFallbacks,
  validateUserProviderForm,
  type UserProviderFormErrors,
  type UserProviderFormFields,
  type UserProviderFormState,
} from "@/utils/user-provider-form";

interface UserProviderConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: ProviderCatalogEntry[];
  providerId: ProviderId;
  onProviderIdChange: (id: ProviderId) => void;
  allowProviderPick: boolean;
  configuredProviderIds: Set<ProviderId>;
  showMultiInstanceHint?: boolean;
  initialForm: UserProviderFormState;
  existingConfig: UserProviderConfigSummary | null;
  onSaved: () => void | Promise<void>;
}

function FormField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
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
    </div>
  );
}

export function UserProviderConfigModal({
  open,
  onOpenChange,
  catalog,
  providerId,
  onProviderIdChange,
  allowProviderPick,
  configuredProviderIds,
  showMultiInstanceHint,
  initialForm,
  existingConfig,
  onSaved,
}: UserProviderConfigModalProps) {
  const [form, setForm] = useState<UserProviderFormState>(initialForm);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<UserProviderFormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<UserProviderFormFields, boolean>>>({});

  const activeCatalog = catalog.find((c) => c.id === providerId);
  const isEditing = !!existingConfig?.configured;

  const addableProviders = useMemo(
    () => catalog.filter((c) => !configuredProviderIds.has(c.id)),
    [catalog, configuredProviderIds],
  );

  const initialFormRef = useRef(initialForm);
  initialFormRef.current = initialForm;

  useEffect(() => {
    if (!open) return;
    const cat = catalog.find((c) => c.id === providerId);
    if (allowProviderPick && cat) {
      setForm(createEmptyUserProviderForm(cat));
    } else {
      setForm(initialFormRef.current);
    }
    setFieldErrors({});
    setTouched({});
    setSubmitError("");
    setApiKeyVisible(false);
  }, [open, providerId, allowProviderPick, catalog]);

  const clearFieldError = useCallback((field: UserProviderFormFields) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const patchForm = useCallback((patch: Partial<UserProviderFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const runValidation = useCallback(
    (markTouched = true): UserProviderFormErrors => {
      if (!activeCatalog) return {};
      const errors = validateUserProviderForm({
        catalog: activeCatalog,
        form,
        isEditing,
      });
      setFieldErrors(errors);
      if (markTouched) {
        const allTouched: Partial<Record<UserProviderFormFields, boolean>> = {
          apiKey: true,
          chatModel: true,
          chatModelFallbacks: true,
          embeddingModel: true,
          sttModel: true,
          baseUrl: true,
        };
        for (const field of activeCatalog.extraFields ?? []) {
          allTouched[`extra:${field.key}`] = true;
        }
        setTouched(allTouched);
      }
      return errors;
    },
    [activeCatalog, form, isEditing],
  );

  function showError(field: UserProviderFormFields): string | undefined {
    return touched[field] ? fieldErrors[field] : undefined;
  }

  const inputErrorClass = (field: UserProviderFormFields) =>
    cn(
      showError(field) &&
        "border-[var(--destructive)] focus-visible:ring-[var(--destructive)]",
    );

  function focusFirstInvalidField(formId: string) {
    queueMicrotask(() => {
      const root = document.getElementById(formId);
      const invalid = root?.querySelector<HTMLElement>("[aria-invalid='true']");
      invalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      invalid?.focus();
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeCatalog) {
      setSubmitError("El catálogo de proveedores no está listo. Cierra el modal e inténtalo de nuevo.");
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
      focusFirstInvalidField("user-provider-config-form");
      return;
    }

    setSaving(true);
    try {
      const extras = buildExtrasPayload(activeCatalog, form.extras);
      await upsertProviderConfig(providerId, {
        apiKey: form.apiKey.trim(),
        chatModel: form.chatModel.trim(),
        chatModelFallbacks: parseFallbacks(form.chatModelFallbacks),
        embeddingModel: activeCatalog.supportsEmbeddings
          ? form.embeddingModel.trim() || null
          : null,
        sttModel: activeCatalog.supportsStt ? form.sttModel.trim() || null : null,
        baseUrl: activeCatalog.baseUrlEditable ? form.baseUrl.trim() || null : null,
        extras: Object.keys(extras).length > 0 ? extras : null,
      });
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      const cat = catalog.find((c) => c.id === providerId);
      if (cat) setForm(createEmptyUserProviderForm(cat));
      setSubmitError("");
      setFieldErrors({});
      setTouched({});
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <form
          id="user-provider-config-form"
          key={allowProviderPick ? `add-${providerId}` : `edit-${providerId}`}
          noValidate
          autoComplete="off"
          onSubmit={(e) => void handleSubmit(e)}
        >
          <DialogHeader>
            <DialogTitle>
              {allowProviderPick
                ? "Agregar nuevo proveedor"
                : isEditing
                  ? `Editar ${activeCatalog?.label ?? providerId}`
                  : `Configurar ${activeCatalog?.label ?? providerId}`}
            </DialogTitle>
            <DialogDescription>
              {showMultiInstanceHint
                ? "Una clave por tipo de proveedor. Para varias cuentas del mismo tipo usa «Proveedores del equipo»."
                : "Clave API y modelos para chat, embeddings y transcripción según el proveedor."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {submitError ? (
              <p
                className="rounded-md border border-[color-mix(in_oklch,var(--destructive)_42%,var(--border))] bg-[color-mix(in_oklch,var(--destructive)_10%,var(--card))] px-3 py-2 text-sm text-[var(--destructive)]"
                role="alert"
              >
                {submitError}
              </p>
            ) : null}

            {allowProviderPick ? (
              <FormField id="modal-provider" label="Proveedor" required>
                <select
                  id="modal-provider"
                  className="flex h-9 w-full rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 py-1 text-sm"
                  value={providerId}
                  onChange={(e) => {
                    const id = e.target.value as ProviderId;
                    onProviderIdChange(id);
                    const c = catalog.find((x) => x.id === id);
                    if (c) setForm(createEmptyUserProviderForm(c));
                  }}
                >
                  {addableProviders.length === 0 ? (
                    <option value="">— Todos configurados —</option>
                  ) : (
                    addableProviders.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  )}
                </select>
                {addableProviders.length === 0 ? (
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Ya tienes configurados todos los tipos del catálogo. Edita uno existente desde
                    las pestañas.
                  </p>
                ) : null}
              </FormField>
            ) : null}

            {activeCatalog ? (
              <ProviderConfigFormFields
                idPrefix="personal"
                catalog={activeCatalog}
                form={form}
                isEditing={isEditing}
                apiKeyVisible={apiKeyVisible}
                onToggleApiKeyVisible={() => setApiKeyVisible((v) => !v)}
                onPatch={patchForm}
                onBlurField={(field) => {
                  setTouched((t) => ({ ...t, [field]: true }));
                  runValidation(false);
                }}
                onClearFieldError={clearFieldError}
                showError={showError}
                inputErrorClass={inputErrorClass}
              />
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || (allowProviderPick && addableProviders.length === 0)}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Guardando…
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
