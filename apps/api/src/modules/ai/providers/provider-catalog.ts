export const PROVIDER_IDS = [
  "openrouter",
  "openai",
  "anthropic",
  "gemini",
  "cloudflare",
  "groq",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Plantilla de base URL de Workers AI (sustituir `{accountId}`). */
export const CLOUDFLARE_BASE_URL_TEMPLATE =
  "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1";

export function buildCloudflareBaseUrl(accountId: string): string {
  const id = accountId.trim();
  if (!id) {
    throw new Error("Cloudflare accountId is required to build base URL");
  }
  return CLOUDFLARE_BASE_URL_TEMPLATE.replace("{accountId}", encodeURIComponent(id));
}

/** Extrae account ID de extras o de una baseUrl ya persistida. */
export function resolveCloudflareAccountId(
  extras?: Record<string, unknown> | null,
  baseUrl?: string | null,
): string | null {
  const fromExtras =
    typeof extras?.accountId === "string" ? extras.accountId.trim() : "";
  if (fromExtras) return fromExtras;
  const url = baseUrl?.trim();
  if (!url) return null;
  const match = url.match(/\/accounts\/([^/]+)\/ai\/v1\/?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Dimensión conocida por id de modelo de embedding (catálogo). */
export const EMBEDDING_DIMENSION_BY_MODEL: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "openai/text-embedding-3-small": 1536,
  "openai/text-embedding-3-large": 3072,
  "text-embedding-004": 768,
  "text-embedding-ada-002": 1536,
  "@cf/baai/bge-base-en-v1.5": 768,
  "@cf/baai/bge-large-en-v1.5": 1024,
  "@cf/google/embeddinggemma-300m": 768,
};

export interface ProviderExtraFieldSpec {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  /** Enlace a la consola para crear API tokens. */
  apiKeyHelpUrl?: string;
  defaultChatModel: string;
  /** Modelos de chat sugeridos en la UI. */
  chatModels?: string[];
  defaultEmbeddingModel: string | null;
  embeddingModels?: string[];
  /** Dimensión del modelo de embedding por defecto del proveedor. */
  defaultEmbeddingDimension: number | null;
  defaultSttModel: string | null;
  defaultBaseUrl: string;
  /** Si el usuario puede editar baseUrl (p. ej. Cloudflare con account_id en la ruta). */
  baseUrlEditable?: boolean;
  /** Campos adicionales en `extras` (accountId, headers, etc.). */
  extraFields?: ProviderExtraFieldSpec[];
  supportsEmbeddings: boolean;
  supportsVision: boolean;
  supportsStt: boolean;
}

export const PROVIDER_CATALOG: Record<ProviderId, ProviderCatalogEntry> = {
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    defaultChatModel: "nousresearch/hermes-3-llama-3.1-405b",
    defaultEmbeddingModel: "openai/text-embedding-3-small",
    defaultEmbeddingDimension: 1536,
    defaultSttModel: "openai/whisper-1",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsEmbeddings: true,
    supportsVision: true,
    supportsStt: true,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultChatModel: "gpt-4o",
    defaultEmbeddingModel: "text-embedding-3-small",
    defaultEmbeddingDimension: 1536,
    defaultSttModel: "whisper-1",
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsEmbeddings: true,
    supportsVision: true,
    supportsStt: true,
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    defaultChatModel: "claude-3-5-sonnet-20240620",
    defaultEmbeddingModel: null,
    defaultEmbeddingDimension: null,
    defaultSttModel: null,
    defaultBaseUrl: "https://api.anthropic.com",
    supportsEmbeddings: false,
    supportsVision: true,
    supportsStt: false,
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    defaultChatModel: "gemini-1.5-pro",
    defaultEmbeddingModel: "text-embedding-004",
    defaultEmbeddingDimension: 768,
    defaultSttModel: null,
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    supportsEmbeddings: true,
    supportsVision: true,
    supportsStt: false,
  },
  cloudflare: {
    id: "cloudflare",
    label: "Cloudflare Workers AI",
    apiKeyHelpUrl: "https://dash.cloudflare.com/profile/api-tokens",
    defaultChatModel: "@cf/meta/llama-3.1-8b-instruct",
    chatModels: [
      "@cf/meta/llama-3.1-8b-instruct",
      "@cf/mistral/mistral-small-3.1-24b-instruct",
      "@cf/openai/gpt-oss-120b",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ],
    defaultEmbeddingModel: "@cf/baai/bge-base-en-v1.5",
    embeddingModels: [
      "@cf/baai/bge-base-en-v1.5",
      "@cf/baai/bge-large-en-v1.5",
      "@cf/google/embeddinggemma-300m",
    ],
    defaultEmbeddingDimension: 768,
    defaultSttModel: null,
    defaultBaseUrl: CLOUDFLARE_BASE_URL_TEMPLATE,
    baseUrlEditable: true,
    extraFields: [
      {
        key: "accountId",
        label: "Account ID",
        required: true,
        placeholder: "32-char hex account id",
        helpText: "Cloudflare dashboard → Workers & Pages → Account details",
      },
      {
        key: "headers",
        label: "Headers (JSON opcional)",
        required: false,
        placeholder: '{"cf-aig-metadata":"..."}',
      },
    ],
    supportsEmbeddings: true,
    supportsVision: false,
    supportsStt: false,
  },
  groq: {
    id: "groq",
    label: "Groq",
    apiKeyHelpUrl: "https://console.groq.com/keys",
    defaultChatModel: "llama-3.3-70b-versatile",
    chatModels: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "qwen/qwen3-32b",
    ],
    defaultEmbeddingModel: null,
    defaultEmbeddingDimension: null,
    defaultSttModel: "whisper-large-v3",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    supportsEmbeddings: false,
    supportsVision: false,
    supportsStt: true,
  },
};

export function listProviderCatalog(): ProviderCatalogEntry[] {
  return PROVIDER_IDS.map((id) => PROVIDER_CATALOG[id]);
}

/** Dimensión de embedding: override de usuario > catálogo por modelo > default del proveedor. */
export function resolveEmbeddingDimensionForModel(
  providerId: ProviderId,
  embeddingModel: string | null,
  userOverride?: number | null,
): number | null {
  if (userOverride != null && userOverride > 0) return userOverride;
  if (embeddingModel) {
    const byModel = EMBEDDING_DIMENSION_BY_MODEL[embeddingModel];
    if (byModel) return byModel;
    for (const [key, dim] of Object.entries(EMBEDDING_DIMENSION_BY_MODEL)) {
      if (embeddingModel.endsWith(key) || embeddingModel.includes(key)) return dim;
    }
  }
  return PROVIDER_CATALOG[providerId].defaultEmbeddingDimension;
}
