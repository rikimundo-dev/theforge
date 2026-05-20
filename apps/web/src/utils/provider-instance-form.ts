import type { ProviderId } from "@/types/user-providers";

export type ProviderInstanceMetaFields = "slug" | "displayName";

export type ProviderInstanceMetaErrors = Partial<
  Record<ProviderInstanceMetaFields, string>
>;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeProviderInstanceSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function validateProviderInstanceMeta(args: {
  editing: boolean;
  slug: string;
  displayName: string;
  takenSlugsForType: string[];
}): ProviderInstanceMetaErrors {
  const errors: ProviderInstanceMetaErrors = {};

  if (!args.editing) {
    const normalized = normalizeProviderInstanceSlug(args.slug);
    if (!normalized) {
      errors.slug = "El slug es obligatorio";
    } else if (!SLUG_RE.test(normalized)) {
      errors.slug =
        "Usa minúsculas, números y guiones (sin espacios ni guión al inicio/fin)";
    } else if (args.takenSlugsForType.includes(normalized)) {
      errors.slug = "Ya existe una instancia con este slug para este tipo";
    }
  }

  if (!args.displayName.trim()) {
    errors.displayName = "El nombre para mostrar es obligatorio";
  }

  return errors;
}

/** @deprecated use validateProviderInstanceMeta */
export type ProviderInstanceFormFields = ProviderInstanceMetaFields | "apiKey" | "chatModel" | "accountId";
export type ProviderInstanceFormErrors = ProviderInstanceMetaErrors;

export function validateProviderInstanceForm(args: {
  editing: boolean;
  providerType: ProviderId;
  slug: string;
  displayName: string;
  apiKey: string;
  chatModel: string;
  accountId: string;
  takenSlugsForType: string[];
}): ProviderInstanceFormErrors {
  return validateProviderInstanceMeta({
    editing: args.editing,
    slug: args.slug,
    displayName: args.displayName,
    takenSlugsForType: args.takenSlugsForType,
  });
}
