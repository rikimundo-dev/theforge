import type {
  ProviderCatalogEntry,
  ProviderInstanceSummary,
  UserAISettings,
  UserProviderConfigSummary,
} from "@/types/user-providers";

export type DisplayVisionModelSource =
  | "configured"
  | "extras"
  | "catalog-default"
  | "chat-fallback"
  | null;

export interface DisplayVisionModel {
  supportsVision: boolean;
  model: string | null;
  source: DisplayVisionModelSource;
}

const VISION_HINT_BY_SOURCE: Record<
  Exclude<DisplayVisionModelSource, null>,
  string
> = {
  configured: "",
  extras: "",
  "catalog-default": "Predeterminado del catálogo",
  "chat-fallback": "Mismo modelo que el chat",
};

export function visionModelHint(source: DisplayVisionModelSource): string | null {
  if (!source) return null;
  const hint = VISION_HINT_BY_SOURCE[source];
  return hint || null;
}

/** Mirrors API `resolveVisionModelForRuntime` for read-only UI. */
export function resolveDisplayVisionModel(
  _providerType: string | null,
  chatModel: string | null,
  visionModel: string | null | undefined,
  extras: Record<string, unknown> | null | undefined,
  catalogEntry: ProviderCatalogEntry | undefined,
): DisplayVisionModel {
  if (!catalogEntry?.supportsVision) {
    return { supportsVision: false, model: null, source: null };
  }
  const configured = visionModel?.trim();
  if (configured) {
    return { supportsVision: true, model: configured, source: "configured" };
  }
  const legacyExtras =
    typeof extras?.visionModel === "string" ? extras.visionModel.trim() : "";
  if (legacyExtras) {
    return { supportsVision: true, model: legacyExtras, source: "extras" };
  }
  const catalogDefault = catalogEntry.defaultVisionModel?.trim();
  if (catalogDefault) {
    return { supportsVision: true, model: catalogDefault, source: "catalog-default" };
  }
  const chat = chatModel?.trim();
  if (chat) {
    return { supportsVision: true, model: chat, source: "chat-fallback" };
  }
  return { supportsVision: true, model: null, source: null };
}

export type EffectiveProviderSource =
  | "selected-instance"
  | "tenant-default"
  | "first-enabled"
  | "personal-byok"
  | "none";

export interface EffectiveProviderInfo {
  source: EffectiveProviderSource;
  instance: ProviderInstanceSummary | null;
  personalConfig: UserProviderConfigSummary | null;
}

function isAccessibleInstance(
  instance: ProviderInstanceSummary,
  userId: string | undefined,
): boolean {
  if (instance.enabledForUsers) return true;
  return !!userId && instance.createdByUserId === userId;
}

/**
 * Réplica en cliente de la resolución del backend (`resolveEffectiveTenantInstanceForUser`
 * + fallback BYOK personal).
 */
export function resolveEffectiveProvider(
  instances: ProviderInstanceSummary[],
  settings: UserAISettings | null,
  personalConfigs: UserProviderConfigSummary[],
  userId?: string,
): EffectiveProviderInfo {
  const accessible = instances.filter((inst) => isAccessibleInstance(inst, userId));

  if (settings?.activeTenantInstanceId) {
    const chosen = accessible.find((inst) => inst.id === settings.activeTenantInstanceId);
    if (chosen) {
      return { source: "selected-instance", instance: chosen, personalConfig: null };
    }
  }

  const tenantDefault = accessible.find(
    (inst) => inst.enabledForUsers && inst.isTenantDefault,
  );
  if (tenantDefault) {
    return { source: "tenant-default", instance: tenantDefault, personalConfig: null };
  }

  const firstEnabled = accessible.find((inst) => inst.enabledForUsers);
  if (firstEnabled) {
    return { source: "first-enabled", instance: firstEnabled, personalConfig: null };
  }

  const activeProvider = settings?.activeProvider;
  if (activeProvider) {
    const personal = personalConfigs.find(
      (cfg) => cfg.provider === activeProvider && cfg.configured,
    );
    if (personal) {
      return { source: "personal-byok", instance: null, personalConfig: personal };
    }
  }

  return { source: "none", instance: null, personalConfig: null };
}
