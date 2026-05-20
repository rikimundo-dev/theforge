import type {
  ProviderCatalogEntry,
  ProviderInstanceSummary,
  UserProviderConfigSummary,
} from "@/types/user-providers";

export interface UserProviderFormState {
  apiKey: string;
  chatModel: string;
  chatModelFallbacks: string;
  embeddingModel: string;
  sttModel: string;
  baseUrl: string;
  extras: Record<string, string>;
}

export function extrasFromRecord(
  catalog: ProviderCatalogEntry,
  raw?: Record<string, unknown> | null,
): Record<string, string> {
  const extrasRaw = raw ?? {};
  return Object.fromEntries(
    (catalog.extraFields ?? []).map((f) => {
      const v = extrasRaw[f.key];
      if (typeof v === "string") return [f.key, v];
      if (v != null && f.key === "headers") return [f.key, JSON.stringify(v)];
      return [f.key, ""];
    }),
  );
}

export function configFormFromInstance(
  inst: ProviderInstanceSummary,
  catalog: ProviderCatalogEntry,
): UserProviderFormState {
  return {
    apiKey: "",
    chatModel: inst.chatModel,
    chatModelFallbacks: inst.chatModelFallbacks?.join(", ") ?? "",
    embeddingModel: inst.embeddingModel ?? "",
    sttModel: inst.sttModel ?? "",
    baseUrl: inst.baseUrl ?? "",
    extras: extrasFromRecord(catalog, inst.extras),
  };
}

export function configFormFromUserConfig(
  catalog: ProviderCatalogEntry,
  cfg: UserProviderConfigSummary,
): UserProviderFormState {
  return {
    apiKey: "",
    chatModel: cfg.chatModel || catalog.defaultChatModel,
    chatModelFallbacks: cfg.chatModelFallbacks?.join(", ") ?? "",
    embeddingModel: cfg.embeddingModel ?? catalog.defaultEmbeddingModel ?? "",
    sttModel: cfg.sttModel ?? catalog.defaultSttModel ?? "",
    baseUrl: cfg.baseUrl ?? catalog.defaultBaseUrl,
    extras: extrasFromRecord(catalog, cfg.extras),
  };
}

/** Formulario vacío para «agregar proveedor» (sin modelos precargados del catálogo). */
export function createEmptyUserProviderForm(
  catalog: ProviderCatalogEntry,
): UserProviderFormState {
  return {
    apiKey: "",
    chatModel: catalog.defaultChatModel,
    chatModelFallbacks: "",
    embeddingModel: catalog.defaultEmbeddingModel ?? "",
    sttModel: catalog.defaultSttModel ?? "",
    baseUrl: "",
    extras: Object.fromEntries(
      (catalog.extraFields ?? []).map((f) => [f.key, ""]),
    ),
  };
}

export type UserProviderFormFields =
  | "apiKey"
  | "chatModel"
  | "chatModelFallbacks"
  | "embeddingModel"
  | "sttModel"
  | "baseUrl"
  | `extra:${string}`;

export type UserProviderFormErrors = Partial<Record<UserProviderFormFields, string>>;

export function parseFallbacks(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function buildExtrasPayload(
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

export function validateUserProviderForm(args: {
  catalog: ProviderCatalogEntry;
  form: UserProviderFormState;
  isEditing: boolean;
}): UserProviderFormErrors {
  const { catalog, form } = args;
  const errors: UserProviderFormErrors = {};

  if (!args.isEditing && !form.apiKey.trim()) {
    errors.apiKey = "La clave API es obligatoria";
  }

  if (!form.chatModel.trim()) {
    errors.chatModel = "El modelo de chat es obligatorio";
  } else if (form.chatModel.trim().length < 2) {
    errors.chatModel = "Indica un modelo de chat válido";
  }

  const fallbacks = parseFallbacks(form.chatModelFallbacks);
  if (form.chatModelFallbacks.trim() && fallbacks.length === 0) {
    errors.chatModelFallbacks =
      "Los modelos de respaldo deben ser nombres separados por coma";
  }
  for (const fb of fallbacks) {
    if (fb === form.chatModel.trim()) {
      errors.chatModelFallbacks = "El modelo de respaldo no puede ser igual al principal";
      break;
    }
  }

  if (catalog.supportsEmbeddings && form.embeddingModel.trim()) {
    if (form.embeddingModel.trim().length < 2) {
      errors.embeddingModel = "Indica un modelo de embeddings válido";
    }
  }

  if (catalog.supportsStt && form.sttModel.trim() && form.sttModel.trim().length < 2) {
    errors.sttModel = "Indica un modelo de transcripción válido";
  }

  if (catalog.baseUrlEditable && form.baseUrl.trim()) {
    try {
      const u = new URL(form.baseUrl.trim());
      if (!/^https?:$/i.test(u.protocol)) {
        errors.baseUrl = "La URL base debe usar http o https";
      }
    } catch {
      errors.baseUrl = "URL base no válida";
    }
  }

  for (const field of catalog.extraFields ?? []) {
    const key = `extra:${field.key}` as UserProviderFormFields;
    const raw = form.extras[field.key]?.trim() ?? "";
    if (field.required && !raw) {
      errors[key] = `${field.label} es obligatorio`;
      continue;
    }
    if (field.key === "headers" && raw) {
      try {
        JSON.parse(raw);
      } catch {
        errors[key] = "Headers debe ser JSON válido";
      }
    }
  }

  return errors;
}
