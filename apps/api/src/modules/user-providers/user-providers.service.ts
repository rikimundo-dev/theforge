import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@theforge/database";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TokenCryptoService } from "../crypto/token-crypto.service.js";
import {
  PROVIDER_CATALOG,
  buildCloudflareBaseUrl,
  isProviderId,
  listProviderCatalog,
  resolveCloudflareAccountId,
  resolveEmbeddingDimensionForModel,
  type ProviderId,
} from "../ai/providers/provider-catalog.js";
import type { UserLLMRuntime } from "../ai/providers/llm-runtime.types.js";
import { getRequestUserId } from "../../common/request-user.store.js";

export interface UpsertProviderConfigDto {
  apiKey: string;
  chatModel?: string;
  chatModelFallbacks?: string[];
  embeddingModel?: string | null;
  embeddingDimension?: number | null;
  sttModel?: string | null;
  baseUrl?: string | null;
  extras?: Record<string, unknown> | null;
}

export interface UpdateAISettingsDto {
  activeProvider?: string;
  embeddingProvider?: string | null;
  embeddingsEnabled?: boolean;
}

@Injectable()
export class UserProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCrypto: TokenCryptoService,
  ) {}

  getCatalog() {
    return listProviderCatalog();
  }

  async getSettings(userId = getRequestUserId()) {
    const row = await this.prisma.userAISettings.findUnique({ where: { userId } });
    return {
      activeProvider: row?.activeProvider ?? null,
      embeddingProvider: row?.embeddingProvider ?? null,
      embeddingsEnabled: row?.embeddingsEnabled ?? true,
    };
  }

  async updateSettings(dto: UpdateAISettingsDto, userId = getRequestUserId()) {
    if (dto.activeProvider !== undefined) {
      if (!isProviderId(dto.activeProvider)) {
        throw new BadRequestException("Proveedor activo no válido");
      }
      const cfg = await this.prisma.userProviderConfig.findUnique({
        where: { userId_provider: { userId, provider: dto.activeProvider } },
      });
      if (!cfg) {
        throw new BadRequestException(
          `Configura primero el proveedor «${dto.activeProvider}» con tu clave API`,
        );
      }
    }
    if (dto.embeddingProvider !== undefined && dto.embeddingProvider !== null) {
      if (!isProviderId(dto.embeddingProvider)) {
        throw new BadRequestException("Proveedor de embeddings no válido");
      }
      const embCfg = await this.prisma.userProviderConfig.findUnique({
        where: { userId_provider: { userId, provider: dto.embeddingProvider } },
      });
      if (!embCfg) {
        throw new BadRequestException(
          `Configura primero el proveedor de embeddings «${dto.embeddingProvider}» con tu clave API`,
        );
      }
      const catalog = PROVIDER_CATALOG[dto.embeddingProvider];
      if (!catalog.supportsEmbeddings) {
        throw new BadRequestException(
          `El proveedor «${dto.embeddingProvider}» no soporta embeddings`,
        );
      }
    }
    const row = await this.prisma.userAISettings.upsert({
      where: { userId },
      create: {
        userId,
        activeProvider: dto.activeProvider ?? "openrouter",
        embeddingProvider: dto.embeddingProvider ?? undefined,
        embeddingsEnabled: dto.embeddingsEnabled ?? true,
      },
      update: {
        ...(dto.activeProvider !== undefined ? { activeProvider: dto.activeProvider } : {}),
        ...(dto.embeddingProvider !== undefined
          ? { embeddingProvider: dto.embeddingProvider }
          : {}),
        ...(dto.embeddingsEnabled !== undefined ? { embeddingsEnabled: dto.embeddingsEnabled } : {}),
      },
    });
    return {
      activeProvider: row.activeProvider,
      embeddingProvider: row.embeddingProvider,
      embeddingsEnabled: row.embeddingsEnabled,
    };
  }

  async listConfigs(userId = getRequestUserId()) {
    const rows = await this.prisma.userProviderConfig.findMany({
      where: { userId },
      orderBy: { provider: "asc" },
    });
    return rows.map((r) => ({
      provider: r.provider,
      chatModel: r.chatModel,
      chatModelFallbacks: r.chatModelFallbacks,
      embeddingModel: r.embeddingModel,
      embeddingDimension: r.embeddingDimension,
      sttModel: r.sttModel,
      baseUrl: r.baseUrl,
      extras: r.extras,
      configured: true,
      apiKeyHint: maskApiKeyHint(this.tokenCrypto.decrypt(r.tokenCiphertext, r.tokenKeyVersion)),
    }));
  }

  async upsertConfig(provider: string, dto: UpsertProviderConfigDto, userId = getRequestUserId()) {
    if (!isProviderId(provider)) {
      throw new BadRequestException("Proveedor no válido");
    }
    const key = dto.apiKey?.trim();
    if (!key) {
      throw new BadRequestException("La clave API es obligatoria");
    }
    const catalog = PROVIDER_CATALOG[provider];
    const chatModel = dto.chatModel?.trim() || catalog.defaultChatModel;
    const chatModelFallbacks = normalizeFallbacks(dto.chatModelFallbacks);
    const embeddingModel =
      dto.embeddingModel === null
        ? null
        : (dto.embeddingModel?.trim() || catalog.defaultEmbeddingModel);
    const embeddingDimension =
      dto.embeddingDimension === null
        ? null
        : dto.embeddingDimension !== undefined
          ? dto.embeddingDimension
          : resolveEmbeddingDimensionForModel(provider, embeddingModel);
    const sttModel =
      dto.sttModel === null
        ? null
        : (dto.sttModel?.trim() || catalog.defaultSttModel);
    if (sttModel && !catalog.supportsStt) {
      throw new BadRequestException(`El proveedor «${provider}» no soporta transcripción de audio`);
    }

    const extras = normalizeProviderExtras(provider, dto.extras);
    const baseUrl = resolveConfigBaseUrl(provider, dto.baseUrl, extras);

    const { ciphertext, keyVersion } = this.tokenCrypto.encrypt(key);

    const row = await this.prisma.userProviderConfig.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        tokenCiphertext: ciphertext,
        tokenKeyVersion: keyVersion,
        chatModel,
        chatModelFallbacks,
        embeddingModel,
        embeddingDimension,
        sttModel,
        baseUrl,
        extras: extras as Prisma.InputJsonValue,
      },
      update: {
        tokenCiphertext: ciphertext,
        tokenKeyVersion: keyVersion,
        chatModel,
        chatModelFallbacks,
        embeddingModel,
        embeddingDimension,
        sttModel,
        baseUrl,
        extras: extras as Prisma.InputJsonValue,
      },
    });

    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    if (!settings) {
      await this.prisma.userAISettings.create({
        data: { userId, activeProvider: provider, embeddingsEnabled: true },
      });
    }

    return {
      provider: row.provider,
      chatModel: row.chatModel,
      chatModelFallbacks: row.chatModelFallbacks,
      embeddingModel: row.embeddingModel,
      embeddingDimension: row.embeddingDimension,
      sttModel: row.sttModel,
      baseUrl: row.baseUrl,
      extras: row.extras,
      configured: true,
      apiKeyHint: maskApiKeyHint(key),
    };
  }

  async deleteConfig(provider: string, userId = getRequestUserId()) {
    if (!isProviderId(provider)) {
      throw new BadRequestException("Proveedor no válido");
    }
    const existing = await this.prisma.userProviderConfig.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!existing) {
      throw new NotFoundException("Configuración de proveedor no encontrada");
    }
    await this.prisma.userProviderConfig.delete({
      where: { userId_provider: { userId, provider } },
    });
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    if (settings?.activeProvider === provider) {
      const next = await this.prisma.userProviderConfig.findFirst({ where: { userId } });
      if (next) {
        await this.prisma.userAISettings.update({
          where: { userId },
          data: { activeProvider: next.provider },
        });
      } else {
        await this.prisma.userAISettings.delete({ where: { userId } }).catch(() => undefined);
      }
    }
    if (settings?.embeddingProvider === provider) {
      await this.prisma.userAISettings.update({
        where: { userId },
        data: { embeddingProvider: null },
      });
    }
    return { ok: true };
  }

  /** Runtime para chat/visión del proveedor activo. */
  async resolveRuntime(userId: string): Promise<UserLLMRuntime> {
    return this.resolveRuntimeForProvider(userId, await this.activeProviderId(userId));
  }

  /** Runtime para embeddings (proveedor dedicado o activo si soporta embeddings). */
  async resolveEmbeddingRuntime(userId: string): Promise<UserLLMRuntime> {
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    if (!settings?.embeddingsEnabled) {
      throw new BadRequestException("Los embeddings están desactivados en tus ajustes de IA");
    }
    const active = await this.activeProviderId(userId);
    const embProvider =
      settings.embeddingProvider && isProviderId(settings.embeddingProvider)
        ? settings.embeddingProvider
        : active;
    const catalog = PROVIDER_CATALOG[embProvider];
    if (!catalog.supportsEmbeddings) {
      throw new BadRequestException(
        `El proveedor «${embProvider}» no expone embeddings. Configura «embeddingProvider» en ajustes de IA con un proveedor que sí (p. ej. openai u openrouter).`,
      );
    }
    return this.resolveRuntimeForProvider(userId, embProvider);
  }

  /** STT: modelo y runtime del proveedor activo (o error si no soporta STT). */
  async resolveSttRuntime(userId: string): Promise<UserLLMRuntime & { sttModel: string }> {
    const runtime = await this.resolveRuntime(userId);
    const catalog = PROVIDER_CATALOG[runtime.providerId];
    if (!catalog.supportsStt) {
      throw new BadRequestException(
        `El proveedor activo «${runtime.providerId}» no soporta transcripción de audio. Usa OpenRouter, OpenAI o Groq.`,
      );
    }
    const sttModel =
      runtime.sttModel?.trim() ||
      catalog.defaultSttModel ||
      process.env.STT_MODEL?.trim() ||
      null;
    if (!sttModel) {
      throw new BadRequestException(
        "Configura sttModel en tu proveedor activo (p. ej. whisper-1) o define STT_MODEL como valor por defecto del servidor",
      );
    }
    return { ...runtime, sttModel };
  }

  private async activeProviderId(userId: string): Promise<ProviderId> {
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const active = settings?.activeProvider;
    if (!active || !isProviderId(active)) {
      throw new BadRequestException(
        "Configura un proveedor de IA en Ajustes (clave API y proveedor activo)",
      );
    }
    return active;
  }

  private async resolveRuntimeForProvider(
    userId: string,
    provider: ProviderId,
  ): Promise<UserLLMRuntime> {
    const cfg = await this.prisma.userProviderConfig.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!cfg) {
      throw new BadRequestException(`No hay clave API configurada para el proveedor «${provider}»`);
    }
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const catalog = PROVIDER_CATALOG[provider];
    const apiKey = this.tokenCrypto.decrypt(cfg.tokenCiphertext, cfg.tokenKeyVersion);
    const extras = (cfg.extras ?? {}) as Record<string, unknown>;
    const legacyFallbacks = extras.chatModelFallbacks;
    const chatModelFallbacks =
      cfg.chatModelFallbacks.length > 0
        ? cfg.chatModelFallbacks
        : Array.isArray(legacyFallbacks)
          ? legacyFallbacks.filter((m): m is string => typeof m === "string" && m.length > 0)
          : [];

    const embeddingModel = cfg.embeddingModel ?? catalog.defaultEmbeddingModel;
    const embeddingDimension = resolveEmbeddingDimensionForModel(
      provider,
      embeddingModel,
      cfg.embeddingDimension,
    );

    return {
      providerId: provider,
      apiKey,
      baseURL: resolveRuntimeBaseUrl(provider, cfg.baseUrl, extras),
      chatModel: cfg.chatModel,
      chatModelFallbacks,
      embeddingModel,
      embeddingDimension,
      embeddingsEnabled: settings?.embeddingsEnabled ?? true,
      sttModel: cfg.sttModel ?? catalog.defaultSttModel,
      visionModel:
        (typeof extras.visionModel === "string" && extras.visionModel.trim()) || cfg.chatModel,
      extras,
    };
  }
}

function normalizeFallbacks(raw?: string[]): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  return raw
    .map((m) => m.trim())
    .filter((m) => {
      if (!m || seen.has(m)) return false;
      seen.add(m);
      return true;
    });
}

function maskApiKeyHint(key: string): string {
  const t = key.trim();
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function normalizeProviderExtras(
  provider: ProviderId,
  raw?: Record<string, unknown> | null,
): Record<string, unknown> {
  const extras: Record<string, unknown> = { ...(raw ?? {}) };

  if (provider === "cloudflare") {
    const accountId =
      (typeof extras.accountId === "string" && extras.accountId.trim()) ||
      (typeof raw?.accountId === "string" && raw.accountId.trim()) ||
      "";
    if (!accountId) {
      throw new BadRequestException(
        "Cloudflare requiere accountId en extras (Account ID de tu cuenta Cloudflare)",
      );
    }
    extras.accountId = accountId;
  }

  return extras;
}

function resolveConfigBaseUrl(
  provider: ProviderId,
  dtoBaseUrl: string | null | undefined,
  extras: Record<string, unknown>,
): string {
  const catalog = PROVIDER_CATALOG[provider];
  const trimmed = dtoBaseUrl?.trim();

  if (provider === "cloudflare") {
    const accountId = resolveCloudflareAccountId(extras, trimmed);
    if (!accountId) {
      throw new BadRequestException(
        "Cloudflare requiere accountId en extras o una baseUrl con /accounts/{id}/ai/v1",
      );
    }
    if (trimmed && !trimmed.includes("{accountId}")) {
      return trimmed;
    }
    return buildCloudflareBaseUrl(accountId);
  }

  return trimmed || catalog.defaultBaseUrl;
}

function resolveRuntimeBaseUrl(
  provider: ProviderId,
  storedBaseUrl: string | null | undefined,
  extras: Record<string, unknown>,
): string {
  const catalog = PROVIDER_CATALOG[provider];
  const trimmed = storedBaseUrl?.trim();

  if (provider === "cloudflare") {
    const accountId = resolveCloudflareAccountId(extras, trimmed);
    if (accountId) {
      if (trimmed && !trimmed.includes("{accountId}")) {
        return trimmed;
      }
      return buildCloudflareBaseUrl(accountId);
    }
    throw new BadRequestException(
      "Configuración Cloudflare incompleta: falta accountId en extras",
    );
  }

  return trimmed || catalog.defaultBaseUrl;
}
