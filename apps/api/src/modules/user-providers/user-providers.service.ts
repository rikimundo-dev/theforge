import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@theforge/database";
import type { ProviderInstance } from "@theforge/database";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TokenCryptoService } from "../crypto/token-crypto.service.js";
import {
  PROVIDER_CATALOG,
  catalogChatModels,
  globalGrantAssignableChatModels,
  isChatModelAllowedForTenantUser,
  isEmbeddingModelWhitelisted,
  isProviderId,
  listProviderCatalog,
  parseChatModelList,
  resolveEmbeddingDimensionForModel,
  type ProviderId,
} from "../ai/providers/provider-catalog.js";
import { isSuperAdmin } from "../../common/roles.js";
import type { UserLLMRuntime } from "../ai/providers/llm-runtime.types.js";
import { getRequestUserId } from "../../common/request-user.store.js";
import {
  buildModelFields,
  maskApiKeyHint,
  normalizeProviderExtras,
  resolveConfigBaseUrl,
  resolveRuntimeBaseUrl,
  resolveVisionModelForRuntime,
} from "./provider-config.helpers.js";

export interface UpsertProviderConfigDto {
  apiKey: string;
  chatModel?: string;
  chatModelFallbacks?: string[];
  embeddingModel?: string | null;
  embeddingDimension?: number | null;
  sttModel?: string | null;
  visionModel?: string | null;
  baseUrl?: string | null;
  extras?: Record<string, unknown> | null;
}

export interface UpdateAISettingsDto {
  activeProvider?: string;
  activeTenantInstanceId?: string | null;
  mddAuditorTenantInstanceId?: string | null;
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
      activeTenantInstanceId: row?.activeTenantInstanceId ?? null,
      mddAuditorTenantInstanceId: row?.mddAuditorTenantInstanceId ?? null,
      embeddingProvider: row?.embeddingProvider ?? null,
      embeddingsEnabled: row?.embeddingsEnabled ?? true,
      allowedChatModels: row?.allowedChatModels ?? [],
    };
  }

  /** Catálogo + modelos/fallbacks de proveedores visibles para el equipo. */
  async buildGlobalGrantAssignableChatModels(): Promise<string[]> {
    const teamRows = await this.prisma.providerInstance.findMany({
      where: { enabledForUsers: true },
      select: {
        providerType: true,
        chatModel: true,
        chatModelFallbacks: true,
        allowedChatModels: true,
      },
    });
    return globalGrantAssignableChatModels(teamRows);
  }

  /** super_admin: grants de modelos por usuario (vista de usuarios). */
  async getUserChatModelGrants(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId: targetUserId } });
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      allowedChatModels: settings?.allowedChatModels ?? [],
      assignableChatModels: await this.buildGlobalGrantAssignableChatModels(),
    };
  }

  /** super_admin: modelos permitidos para un admin/dev (sin cambiar su proveedor activo). */
  async updateUserAllowedChatModels(targetUserId: string, modelsRaw: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException("Usuario no encontrado");
    if (target.role === "super_admin") {
      throw new BadRequestException("No se asignan grants de modelos a otro super_admin");
    }

    const models = parseChatModelList(modelsRaw);
    for (const model of models) {
      if (model.length < 2 || model.length > 256) {
        throw new BadRequestException(
          `Nombre de modelo no válido: «${model}». Usa entre 2 y 256 caracteres.`,
        );
      }
    }

    const existing = await this.prisma.userAISettings.findUnique({ where: { userId: targetUserId } });
    const row = await this.prisma.userAISettings.upsert({
      where: { userId: targetUserId },
      create: {
        userId: targetUserId,
        activeProvider: existing?.activeProvider ?? "openrouter",
        activeTenantInstanceId: existing?.activeTenantInstanceId ?? undefined,
        allowedChatModels: models,
      },
      update: { allowedChatModels: models },
    });
    return {
      userId: targetUserId,
      allowedChatModels: row.allowedChatModels,
    };
  }

  /** Admin: solo modelos que el super_admin compartió o los del catálogo del proveedor. */
  async validateUserMayUseChatModels(
    userId: string,
    provider: ProviderId,
    modelIds: string[],
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || isSuperAdmin(user.role)) return;

    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const grants = settings?.allowedChatModels ?? [];
    const toCheck = modelIds.filter((m) => m.trim().length > 0);

    if (grants.length > 0) {
      const invalid = toCheck.filter((m) => !grants.includes(m));
      if (invalid.length > 0) {
        throw new BadRequestException(
          `Modelo no autorizado: ${invalid.join(", ")}. El super_admin te permitió: ${grants.join(", ")}`,
        );
      }
      return;
    }

    const catalog = catalogChatModels(provider);
    const invalid = toCheck.filter((m) => !catalog.includes(m));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Modelo no válido para «${provider}»: ${invalid.join(", ")}. Usa un modelo del catálogo o pide al super_admin que te habilite modelos.`,
      );
    }
  }

  async updateSettings(dto: UpdateAISettingsDto, userId = getRequestUserId()) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (user?.role === "developer") {
      if (
        dto.activeTenantInstanceId !== undefined ||
        dto.activeProvider !== undefined ||
        dto.mddAuditorTenantInstanceId !== undefined
      ) {
        throw new ForbiddenException(
          "Los developers usan el proveedor predeterminado configurado por el super_admin",
        );
      }
    }
    for (const instanceId of [
      dto.activeTenantInstanceId,
      dto.mddAuditorTenantInstanceId,
    ]) {
      if (instanceId === undefined || instanceId === null) continue;
      const inst = await this.prisma.providerInstance.findFirst({
        where: {
          id: instanceId,
          ...this.instanceAccessibleByUser(userId),
        },
      });
      if (!inst) {
        throw new BadRequestException("Instancia de proveedor no disponible");
      }
    }
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
        activeTenantInstanceId: dto.activeTenantInstanceId ?? undefined,
        mddAuditorTenantInstanceId: dto.mddAuditorTenantInstanceId ?? undefined,
        embeddingProvider: dto.embeddingProvider ?? undefined,
        embeddingsEnabled: dto.embeddingsEnabled ?? true,
      },
      update: {
        ...(dto.activeProvider !== undefined ? { activeProvider: dto.activeProvider } : {}),
        ...(dto.activeTenantInstanceId !== undefined
          ? { activeTenantInstanceId: dto.activeTenantInstanceId }
          : {}),
        ...(dto.mddAuditorTenantInstanceId !== undefined
          ? { mddAuditorTenantInstanceId: dto.mddAuditorTenantInstanceId }
          : {}),
        ...(dto.embeddingProvider !== undefined
          ? { embeddingProvider: dto.embeddingProvider }
          : {}),
        ...(dto.embeddingsEnabled !== undefined ? { embeddingsEnabled: dto.embeddingsEnabled } : {}),
      },
    });
    return {
      activeProvider: row.activeProvider,
      activeTenantInstanceId: row.activeTenantInstanceId,
      mddAuditorTenantInstanceId: row.mddAuditorTenantInstanceId,
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
      visionModel: r.visionModel,
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
    const models = buildModelFields(provider, dto);
    await this.validateUserMayUseChatModels(userId, provider, [
      models.chatModel,
      ...models.chatModelFallbacks,
    ]);
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
        ...models,
        baseUrl,
        extras: extras as Prisma.InputJsonValue,
      },
      update: {
        tokenCiphertext: ciphertext,
        tokenKeyVersion: keyVersion,
        ...models,
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
      visionModel: row.visionModel,
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

  /** Indica si el usuario tiene proveedor usable (tenant o BYOK personal). */
  async hasUsableProvider(userId: string): Promise<boolean> {
    try {
      await this.resolveRuntime(userId);
      return true;
    } catch {
      return false;
    }
  }

  /** Runtime para chat/visión: tenant primero, luego BYOK personal. */
  async resolveRuntime(userId: string): Promise<UserLLMRuntime> {
    const tenant = await this.resolveTenantInstanceForUser(userId);
    if (tenant) {
      return this.runtimeFromTenantInstance(userId, tenant);
    }
    return this.resolveRuntimeForProvider(userId, await this.activeProviderId(userId));
  }

  /**
   * Runtime del agente Auditor (grafo MDD). Si hay `mddAuditorTenantInstanceId` accesible, esa instancia;
   * si no, el mismo runtime que `resolveRuntime`.
   */
  async resolveAuditorRuntime(userId: string): Promise<UserLLMRuntime> {
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const auditorInstanceId = settings?.mddAuditorTenantInstanceId;
    if (auditorInstanceId) {
      const inst = await this.prisma.providerInstance.findFirst({
        where: { id: auditorInstanceId, ...this.instanceAccessibleByUser(userId) },
      });
      if (inst) {
        return this.runtimeFromTenantInstance(userId, inst);
      }
    }
    return this.resolveRuntime(userId);
  }

  async resolveEmbeddingRuntime(userId: string): Promise<UserLLMRuntime> {
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    if (!settings?.embeddingsEnabled) {
      throw new BadRequestException("Los embeddings están desactivados en tus ajustes de IA");
    }

    const tenant = await this.resolveTenantInstanceForUser(userId);
    if (tenant && isProviderId(tenant.providerType)) {
      const tenantProvider = tenant.providerType;
      const catalog = PROVIDER_CATALOG[tenantProvider];
      const bypass = await this.userBypassesModelPolicy(userId);
      const embModel = tenant.embeddingModel ?? catalog.defaultEmbeddingModel;
      if (
        catalog.supportsEmbeddings &&
        embModel &&
        isEmbeddingModelWhitelisted(
          tenantProvider,
          embModel,
          tenant.allowedEmbeddingModels,
          bypass,
        )
      ) {
        return this.runtimeFromTenantInstance(userId, tenant, { forEmbeddings: true });
      }
    }

    const active = await this.activeProviderId(userId);
    const embProvider =
      settings?.embeddingProvider && isProviderId(settings.embeddingProvider)
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

  async resolveSttRuntime(userId: string): Promise<UserLLMRuntime & { sttModel: string }> {
    const runtime = await this.resolveRuntime(userId);
    const catalog = PROVIDER_CATALOG[runtime.providerId];
    if (!catalog.supportsStt) {
      throw new BadRequestException(
        `El proveedor activo «${runtime.providerId}» no soporta transcripción de audio. Usa OpenRouter, OpenAI o Groq.`,
      );
    }
    const sttModel = runtime.sttModel?.trim() || catalog.defaultSttModel || null;
    if (!sttModel) {
      throw new BadRequestException(
        "Configura el modelo de transcripción (STT) en tu proveedor activo en Ajustes (p. ej. whisper-1)",
      );
    }
    return { ...runtime, sttModel };
  }

  /** super_admin y admin: eligen proveedor activo sin restricción por grants de Usuarios. */
  private async userBypassesModelPolicy(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const role = user?.role ?? "developer";
    return role === "super_admin" || role === "admin";
  }

  private instanceAccessibleByUser(userId: string): Prisma.ProviderInstanceWhereInput {
    return {
      OR: [
        { enabledForUsers: true },
        { createdByUserId: userId, enabledForUsers: false },
      ],
    };
  }

  /**
   * Proveedor activo del usuario:
   * 1) Instancia marcada como «Activa» (activeTenantInstanceId).
   * 2) Si no hay selección, la del equipo con isTenantDefault.
   * 3) Si no hay default, la primera visible del equipo.
   * Las instancias personales solo aplican si el usuario las eligió en el paso 1.
   */
  async resolveEffectiveTenantInstanceForUser(userId: string): Promise<ProviderInstance | null> {
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const access = this.instanceAccessibleByUser(userId);
    if (settings?.activeTenantInstanceId) {
      const chosen = await this.prisma.providerInstance.findFirst({
        where: { id: settings.activeTenantInstanceId, ...access },
      });
      if (chosen) return chosen;
    }
    const tenantDefault = await this.prisma.providerInstance.findFirst({
      where: { enabledForUsers: true, isTenantDefault: true },
    });
    if (tenantDefault) return tenantDefault;
    return this.prisma.providerInstance.findFirst({
      where: { enabledForUsers: true },
      orderBy: { displayName: "asc" },
    });
  }

  private async resolveTenantInstanceForUser(userId: string): Promise<ProviderInstance | null> {
    return this.resolveEffectiveTenantInstanceForUser(userId);
  }

  private async runtimeFromTenantInstance(
    userId: string,
    instance: ProviderInstance,
    opts?: { forEmbeddings?: boolean },
  ): Promise<UserLLMRuntime> {
    if (!isProviderId(instance.providerType)) {
      throw new BadRequestException("Instancia tenant con tipo de proveedor no válido");
    }
    const provider = instance.providerType;
    const bypass = await this.userBypassesModelPolicy(userId);
    const catalog = PROVIDER_CATALOG[provider];
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const userGrants = settings?.allowedChatModels ?? [];
    const chatModel = instance.chatModel;

    if (
      !isChatModelAllowedForTenantUser(
        chatModel,
        userGrants,
        provider,
        instance.allowedChatModels,
        bypass,
      )
    ) {
      const hint =
        userGrants.length > 0
          ? `Modelos permitidos para ti: ${userGrants.join(", ")}. Activa un proveedor cuyo modelo esté en esa lista.`
          : `Pide al super_admin modelos en Usuarios o revisa el proveedor «${instance.displayName}».`;
      throw new BadRequestException(
        `El modelo «${chatModel}» del proveedor activo «${instance.displayName}» no está autorizado. ${hint}`,
      );
    }

    const embeddingModel = instance.embeddingModel ?? catalog.defaultEmbeddingModel;
    if (
      opts?.forEmbeddings &&
      embeddingModel &&
      !isEmbeddingModelWhitelisted(
        provider,
        embeddingModel,
        instance.allowedEmbeddingModels,
        bypass,
      )
    ) {
      throw new BadRequestException(
        `El modelo de embeddings «${embeddingModel}» no está permitido en la instancia tenant`,
      );
    }

    const apiKey = this.tokenCrypto.decrypt(instance.tokenCiphertext, instance.tokenKeyVersion);
    const extras = (instance.extras ?? {}) as Record<string, unknown>;
    const legacyFallbacks = extras.chatModelFallbacks;
    const chatModelFallbacks =
      instance.chatModelFallbacks.length > 0
        ? instance.chatModelFallbacks
        : Array.isArray(legacyFallbacks)
          ? legacyFallbacks.filter((m): m is string => typeof m === "string" && m.length > 0)
          : [];

    const effectiveFallbacks =
      userGrants.length > 0
        ? chatModelFallbacks.filter((m) => userGrants.includes(m))
        : chatModelFallbacks;
    for (const fallbackModel of effectiveFallbacks) {
      if (
        !isChatModelAllowedForTenantUser(
          fallbackModel,
          userGrants,
          provider,
          instance.allowedChatModels,
          bypass,
        )
      ) {
        throw new BadRequestException(
          `El modelo de respaldo «${fallbackModel}» no está autorizado.`,
        );
      }
    }

    return {
      providerId: provider,
      apiKey,
      baseURL: resolveRuntimeBaseUrl(provider, instance.baseUrl, extras),
      chatModel,
      chatModelFallbacks: effectiveFallbacks,
      embeddingModel,
      embeddingDimension: resolveEmbeddingDimensionForModel(
        provider,
        embeddingModel,
        instance.embeddingDimension,
      ),
      embeddingsEnabled: settings?.embeddingsEnabled ?? true,
      sttModel: instance.sttModel ?? catalog.defaultSttModel,
      visionModel: resolveVisionModelForRuntime({
        visionModel: instance.visionModel,
        chatModel,
        extras,
        catalogDefaultVisionModel: catalog.defaultVisionModel,
        supportsVision: catalog.supportsVision,
      }),
      extras,
    };
  }

  private async activeProviderId(userId: string): Promise<ProviderId> {
    const settings = await this.prisma.userAISettings.findUnique({ where: { userId } });
    const active = settings?.activeProvider;
    if (!active || !isProviderId(active)) {
      throw new BadRequestException(
        "Configura un proveedor de IA en Ajustes (instancia tenant o clave API personal)",
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
      visionModel: resolveVisionModelForRuntime({
        visionModel: cfg.visionModel,
        chatModel: cfg.chatModel,
        extras,
        catalogDefaultVisionModel: catalog.defaultVisionModel,
        supportsVision: catalog.supportsVision,
      }),
      extras,
    };
  }
}
