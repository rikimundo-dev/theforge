import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveDisplayVisionModel,
  resolveEffectiveProvider,
  visionModelHint,
} from "./resolve-effective-provider.js";
import type {
  ProviderCatalogEntry,
  ProviderInstanceSummary,
  UserAISettings,
  UserProviderConfigSummary,
} from "@/types/user-providers";

const openrouterCatalog: ProviderCatalogEntry = {
  id: "openrouter",
  label: "OpenRouter",
  defaultChatModel: "nousresearch/hermes-3-llama-3.1-405b",
  defaultEmbeddingModel: "openai/text-embedding-3-small",
  defaultEmbeddingDimension: 1536,
  defaultSttModel: "openai/whisper-1",
  defaultVisionModel: "openai/gpt-4o",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  supportsEmbeddings: true,
  supportsVision: true,
  supportsStt: true,
};

const baseInstance = (
  overrides: Partial<ProviderInstanceSummary> & Pick<ProviderInstanceSummary, "id">,
): ProviderInstanceSummary => ({
  providerType: "openrouter",
  slug: "default",
  displayName: "OpenRouter",
  chatModel: "gpt-4o-mini",
  chatModelFallbacks: [],
  auditorChatModel: null,
  embeddingModel: null,
  embeddingDimension: null,
  sttModel: null,
  visionModel: null,
  baseUrl: null,
  extras: null,
  enabledForUsers: true,
  allowedChatModels: [],
  allowedEmbeddingModels: [],
  isTenantDefault: false,
  ...overrides,
});

describe("resolveEffectiveProvider", () => {
  it("prefiere instancia marcada como activa", () => {
    const instances = [
      baseInstance({ id: "a", displayName: "A", isTenantDefault: true }),
      baseInstance({ id: "b", displayName: "B" }),
    ];
    const settings: UserAISettings = {
      activeProvider: null,
      activeTenantInstanceId: "b",
      mddAuditorTenantInstanceId: null,
      embeddingProvider: null,
      embeddingsEnabled: true,
    };
    const result = resolveEffectiveProvider(instances, settings, []);
    assert.equal(result.source, "selected-instance");
    assert.equal(result.instance?.id, "b");
  });

  it("usa predeterminada del equipo si no hay selección", () => {
    const instances = [
      baseInstance({ id: "a", isTenantDefault: false }),
      baseInstance({ id: "b", isTenantDefault: true, displayName: "Team default" }),
    ];
    const settings: UserAISettings = {
      activeProvider: null,
      activeTenantInstanceId: null,
      mddAuditorTenantInstanceId: null,
      embeddingProvider: null,
      embeddingsEnabled: true,
    };
    const result = resolveEffectiveProvider(instances, settings, []);
    assert.equal(result.source, "tenant-default");
    assert.equal(result.instance?.id, "b");
  });

  it("cae a BYOK personal si no hay instancias tenant", () => {
    const settings: UserAISettings = {
      activeProvider: "openai",
      activeTenantInstanceId: null,
      mddAuditorTenantInstanceId: null,
      embeddingProvider: null,
      embeddingsEnabled: true,
    };
    const configs: UserProviderConfigSummary[] = [
      {
        provider: "openai",
        chatModel: "gpt-4o",
        chatModelFallbacks: [],
        embeddingModel: null,
        embeddingDimension: null,
        sttModel: null,
        visionModel: null,
        baseUrl: null,
        extras: null,
        configured: true,
        apiKeyHint: "sk-…1234",
      },
    ];
    const result = resolveEffectiveProvider([], settings, configs);
    assert.equal(result.source, "personal-byok");
    assert.equal(result.personalConfig?.provider, "openai");
  });
});

describe("resolveDisplayVisionModel", () => {
  it("uses catalog default when instance vision is empty", () => {
    const result = resolveDisplayVisionModel(
      "openrouter",
      "openai/gpt-oss-120b:free",
      null,
      null,
      openrouterCatalog,
    );
    assert.equal(result.supportsVision, true);
    assert.equal(result.model, "openai/gpt-4o");
    assert.equal(result.source, "catalog-default");
    assert.equal(visionModelHint(result.source), "Predeterminado del catálogo");
  });

  it("prefers configured vision model", () => {
    const result = resolveDisplayVisionModel(
      "openrouter",
      "openai/gpt-oss-120b:free",
      "google/gemini-2.0-flash",
      null,
      openrouterCatalog,
    );
    assert.equal(result.model, "google/gemini-2.0-flash");
    assert.equal(result.source, "configured");
    assert.equal(visionModelHint(result.source), null);
  });

  it("returns unsupported for providers without vision", () => {
    const result = resolveDisplayVisionModel("groq", "llama", null, null, {
      ...openrouterCatalog,
      id: "groq",
      supportsVision: false,
      defaultVisionModel: null,
    });
    assert.equal(result.supportsVision, false);
  });
});
