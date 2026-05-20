import { useMemo } from "react";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { Input } from "./ui";
import { cn } from "@/lib/utils";
import type { ProviderCatalogEntry } from "@/types/user-providers";
import type { UserProviderFormFields, UserProviderFormState } from "@/utils/user-provider-form";

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

function ModelInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  required,
  error,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  error?: string;
  className?: string;
}) {
  const uniqueOptions = useMemo(() => {
    if (!options?.length) return undefined;
    return [...new Set(options.filter(Boolean))];
  }, [options]);

  if (uniqueOptions?.length) {
    return (
      <FormField id={id} label={label} required={required} error={error}>
        <select
          id={id}
          className={cn(
            "flex h-9 w-full rounded-md border border-[var(--input-border)] bg-[var(--input)] px-3 py-1 text-sm text-[var(--foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
            className,
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
        >
          {!uniqueOptions.includes(value) && value ? (
            <option value={value}>{value}</option>
          ) : null}
          {uniqueOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </FormField>
    );
  }

  return (
    <FormField id={id} label={label} required={required} error={error}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={className}
      />
    </FormField>
  );
}

export interface ProviderConfigFormFieldsProps {
  idPrefix: string;
  catalog: ProviderCatalogEntry;
  form: UserProviderFormState;
  isEditing: boolean;
  apiKeyVisible: boolean;
  onToggleApiKeyVisible: () => void;
  onPatch: (patch: Partial<UserProviderFormState>) => void;
  onBlurField: (field: UserProviderFormFields) => void;
  onClearFieldError: (field: UserProviderFormFields) => void;
  showError: (field: UserProviderFormFields) => string | undefined;
  inputErrorClass: (field: UserProviderFormFields) => string;
}

/** Campos BYOK compartidos (personal y instancias de equipo). */
export function ProviderConfigFormFields({
  idPrefix,
  catalog,
  form,
  isEditing,
  apiKeyVisible,
  onToggleApiKeyVisible,
  onPatch,
  onBlurField,
  onClearFieldError,
  showError,
  inputErrorClass,
}: ProviderConfigFormFieldsProps) {
  return (
    <>
      {catalog.apiKeyHelpUrl ? (
        <a
          href={catalog.apiKeyHelpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
        >
          Obtener clave API
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}

      <FormField
        id={`${idPrefix}-api-key`}
        label={isEditing ? "Clave API (dejar vacío para no cambiar)" : "Clave API"}
        required={!isEditing}
        error={showError("apiKey")}
      >
        <div className="relative">
          <Input
            id={`${idPrefix}-api-key`}
            name={`${idPrefix}-api-key`}
            type={apiKeyVisible ? "text" : "password"}
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            value={form.apiKey}
            onChange={(e) => {
              onPatch({ apiKey: e.target.value });
              onClearFieldError("apiKey");
            }}
            onBlur={() => onBlurField("apiKey")}
            placeholder={isEditing ? "••••••••" : "sk-…"}
            aria-invalid={!!showError("apiKey")}
            className={cn("pr-10", inputErrorClass("apiKey"))}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]"
            onClick={onToggleApiKeyVisible}
            tabIndex={-1}
            aria-label={apiKeyVisible ? "Ocultar clave" : "Mostrar clave"}
          >
            {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </FormField>

      <FormField
        id={`${idPrefix}-chat-model`}
        label="Modelo de chat"
        required
        hint={`ID del modelo (p. ej. ${catalog.defaultChatModel} u openrouter/free).`}
        error={showError("chatModel")}
      >
        <Input
          id={`${idPrefix}-chat-model`}
          value={form.chatModel}
          onChange={(e) => {
            onPatch({ chatModel: e.target.value });
            onClearFieldError("chatModel");
          }}
          onBlur={() => onBlurField("chatModel")}
          placeholder={catalog.defaultChatModel}
          aria-invalid={!!showError("chatModel")}
          className={cn("font-mono text-xs", inputErrorClass("chatModel"))}
        />
      </FormField>

      <FormField
        id={`${idPrefix}-fallbacks`}
        label="Modelos de respaldo (opcional)"
        hint="Separados por coma. Se usan si el modelo principal falla."
        error={showError("chatModelFallbacks")}
      >
        <Input
          id={`${idPrefix}-fallbacks`}
          value={form.chatModelFallbacks}
          onChange={(e) => {
            onPatch({ chatModelFallbacks: e.target.value });
            onClearFieldError("chatModelFallbacks");
          }}
          onBlur={() => onBlurField("chatModelFallbacks")}
          aria-invalid={!!showError("chatModelFallbacks")}
          className={inputErrorClass("chatModelFallbacks")}
        />
      </FormField>

      {catalog.supportsEmbeddings ? (
        <ModelInput
          id={`${idPrefix}-embedding`}
          label="Modelo de embeddings"
          value={form.embeddingModel}
          onChange={(v) => {
            onPatch({ embeddingModel: v });
            onClearFieldError("embeddingModel");
          }}
          onBlur={() => onBlurField("embeddingModel")}
          options={catalog.embeddingModels}
          placeholder={catalog.defaultEmbeddingModel ?? ""}
          error={showError("embeddingModel")}
          className={inputErrorClass("embeddingModel")}
        />
      ) : null}

      {catalog.supportsStt ? (
        <ModelInput
          id={`${idPrefix}-stt`}
          label="Modelo de transcripción (STT)"
          value={form.sttModel}
          onChange={(v) => {
            onPatch({ sttModel: v });
            onClearFieldError("sttModel");
          }}
          onBlur={() => onBlurField("sttModel")}
          placeholder={catalog.defaultSttModel ?? "whisper-1"}
          error={showError("sttModel")}
          className={inputErrorClass("sttModel")}
        />
      ) : null}

      {catalog.baseUrlEditable ? (
        <FormField
          id={`${idPrefix}-base-url`}
          label="URL base"
          hint="Para Cloudflare se construye a partir del Account ID si se deja vacía."
          error={showError("baseUrl")}
        >
          <Input
            id={`${idPrefix}-base-url`}
            value={form.baseUrl}
            onChange={(e) => {
              onPatch({ baseUrl: e.target.value });
              onClearFieldError("baseUrl");
            }}
            onBlur={() => onBlurField("baseUrl")}
            className={cn("font-mono text-xs", inputErrorClass("baseUrl"))}
          />
        </FormField>
      ) : null}

      {(catalog.extraFields ?? []).map((field) => {
        const fieldKey = `extra:${field.key}` as UserProviderFormFields;
        return (
          <FormField
            key={field.key}
            id={`${idPrefix}-extra-${field.key}`}
            label={field.label}
            required={field.required}
            hint={field.helpText}
            error={showError(fieldKey)}
          >
            <Input
              id={`${idPrefix}-extra-${field.key}`}
              value={form.extras[field.key] ?? ""}
              onChange={(e) => {
                onPatch({
                  extras: { ...form.extras, [field.key]: e.target.value },
                });
                onClearFieldError(fieldKey);
              }}
              onBlur={() => onBlurField(fieldKey)}
              placeholder={field.placeholder}
              aria-invalid={!!showError(fieldKey)}
              className={inputErrorClass(fieldKey)}
            />
          </FormField>
        );
      })}
    </>
  );
}
