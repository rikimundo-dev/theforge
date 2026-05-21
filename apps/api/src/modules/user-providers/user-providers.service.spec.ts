import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UserProvidersService } from "./user-providers.service.js";
import type { TokenCryptoService } from "../crypto/token-crypto.service.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const USER_ID = "user-test-1";

function mockPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const store = {
    settings: null as {
      userId: string;
      activeProvider: string;
      activeTenantInstanceId: string | null;
      embeddingProvider: string | null;
      embeddingsEnabled: boolean;
    } | null,
    configs: new Map<string, Record<string, unknown>>(),
    instances: new Map<string, Record<string, unknown>>(),
    userRole: "admin" as string,
  };

  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === USER_ID ? { role: store.userRole } : null,
    },
    providerInstance: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          enabledForUsers?: boolean;
          isTenantDefault?: boolean;
          createdByUserId?: string;
          OR?: Array<{ enabledForUsers?: boolean; createdByUserId?: string }>;
        };
      }) => {
        for (const inst of store.instances.values()) {
          if (where.id && inst.id !== where.id) continue;
          if (where.OR) {
            const ok = where.OR.some((clause) => {
              if (clause.enabledForUsers === true && inst.enabledForUsers === true) return true;
              if (
                clause.enabledForUsers === false &&
                clause.createdByUserId === inst.createdByUserId &&
                inst.enabledForUsers === false
              ) {
                return true;
              }
              return false;
            });
            if (!ok) continue;
            return inst;
          }
          if (where.enabledForUsers !== undefined && inst.enabledForUsers !== where.enabledForUsers) {
            continue;
          }
          if (where.isTenantDefault !== undefined && inst.isTenantDefault !== where.isTenantDefault) {
            continue;
          }
          if (
            where.createdByUserId !== undefined &&
            inst.createdByUserId !== where.createdByUserId
          ) {
            continue;
          }
          return inst;
        }
        return null;
      },
      findMany: async ({
        where,
      }: {
        where?: { enabledForUsers?: boolean };
      } = {}) => {
        const rows = [...store.instances.values()];
        if (where?.enabledForUsers === undefined) return rows;
        return rows.filter((inst) => inst.enabledForUsers === where.enabledForUsers);
      },
    },
    userAISettings: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        where.userId === USER_ID ? store.settings : null,
      upsert: async ({ create, update }: { create: typeof store.settings; update: object }) => {
        store.settings = { ...(store.settings ?? create!), ...update } as typeof store.settings;
        return store.settings;
      },
      create: async ({ data }: { data: typeof store.settings }) => {
        store.settings = data;
        return data;
      },
      update: async ({ data }: { data: Partial<typeof store.settings> }) => {
        store.settings = { ...store.settings!, ...data };
        return store.settings;
      },
      delete: async () => {
        store.settings = null;
      },
    },
    userProviderConfig: {
      findUnique: async ({
        where,
      }: {
        where: { userId_provider: { userId: string; provider: string } };
      }) => {
        const { userId, provider } = where.userId_provider;
        return store.configs.get(`${userId}:${provider}`) ?? null;
      },
      findFirst: async ({ where }: { where: { userId: string } }) => {
        for (const [k, v] of store.configs) {
          if (k.startsWith(`${where.userId}:`)) return v;
        }
        return null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_provider: { userId: string; provider: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`;
        const row = {
          id: "cfg-1",
          chatModelFallbacks: [],
          embeddingDimension: 1536,
          sttModel: null,
          ...(store.configs.get(key) ?? create),
          ...update,
        };
        store.configs.set(key, row);
        return row;
      },
      delete: async ({ where }: { where: { userId_provider: { userId: string; provider: string } } }) => {
        store.configs.delete(`${where.userId_provider.userId}:${where.userId_provider.provider}`);
      },
      findMany: async ({ where }: { where: { userId: string } }) =>
        [...store.configs.entries()]
          .filter(([k]) => k.startsWith(`${where.userId}:`))
          .map(([, v]) => v),
    },
    ...overrides,
    __store: store,
  } as unknown as PrismaService & { __store: typeof store };
}

function mockCrypto(): TokenCryptoService {
  return {
    encrypt: (plain: string) => ({ ciphertext: `enc:${plain}`, keyVersion: 1 }),
    decrypt: (cipher: string) => cipher.replace(/^enc:/, ""),
    getActiveVersion: () => 1,
  } as TokenCryptoService;
}

test("UserProvidersService.resolveRuntime — sin settings", async () => {
  const svc = new UserProvidersService(mockPrisma(), mockCrypto());
  await assert.rejects(
    () => svc.resolveRuntime(USER_ID),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("UserProvidersService — upsert y resolveRuntime", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig("openrouter", { apiKey: "sk-test-key-12345678" }, USER_ID);
  await svc.updateSettings({ activeProvider: "openrouter" }, USER_ID);
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.providerId, "openrouter");
  assert.equal(runtime.apiKey, "sk-test-key-12345678");
  assert.ok(runtime.chatModel.length > 0);
  assert.equal(runtime.embeddingDimension, 1536);
});

test("UserProvidersService.resolveEmbeddingRuntime — anthropic activo sin override", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig("anthropic", { apiKey: "sk-ant-test-12345678" }, USER_ID);
  await svc.updateSettings({ activeProvider: "anthropic" }, USER_ID);
  await assert.rejects(
    () => svc.resolveEmbeddingRuntime(USER_ID),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("UserProvidersService.resolveEmbeddingRuntime — anthropic + embeddingProvider openai", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig("anthropic", { apiKey: "sk-ant-test-12345678" }, USER_ID);
  await svc.upsertConfig("openai", { apiKey: "sk-openai-test-12345678" }, USER_ID);
  await svc.updateSettings(
    { activeProvider: "anthropic", embeddingProvider: "openai" },
    USER_ID,
  );
  const runtime = await svc.resolveEmbeddingRuntime(USER_ID);
  assert.equal(runtime.providerId, "openai");
  assert.equal(runtime.embeddingDimension, 1536);
});

test("UserProvidersService.resolveSttRuntime — openai con sttModel", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig(
    "openai",
    { apiKey: "sk-openai-test-12345678", sttModel: "whisper-1" },
    USER_ID,
  );
  await svc.updateSettings({ activeProvider: "openai" }, USER_ID);
  const runtime = await svc.resolveSttRuntime(USER_ID);
  assert.equal(runtime.sttModel, "whisper-1");
});

test("UserProvidersService — cloudflare requiere accountId", async () => {
  const svc = new UserProvidersService(mockPrisma(), mockCrypto());
  await assert.rejects(
    () => svc.upsertConfig("cloudflare", { apiKey: "cf-token-test-12345678" }, USER_ID),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("UserProvidersService — cloudflare upsert y baseURL", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig(
    "cloudflare",
    {
      apiKey: "cf-token-test-12345678",
      extras: { accountId: "cf-account-abc" },
    },
    USER_ID,
  );
  await svc.updateSettings({ activeProvider: "cloudflare" }, USER_ID);
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.providerId, "cloudflare");
  assert.equal(
    runtime.baseURL,
    "https://api.cloudflare.com/client/v4/accounts/cf-account-abc/ai/v1",
  );
  assert.equal(runtime.embeddingDimension, 768);
});

test("UserProvidersService.updateSettings — instancia personal del usuario", async () => {
  const prisma = mockPrisma();
  const store = (prisma as { __store: { instances: Map<string, Record<string, unknown>> } })
    .__store;
  store.instances.set("personal-1", {
    id: "personal-1",
    providerType: "openrouter",
    displayName: "Mi OR",
    createdByUserId: USER_ID,
    enabledForUsers: false,
    isTenantDefault: false,
    tokenCiphertext: "enc:sk-personal-key-12345678",
    tokenKeyVersion: 1,
    chatModel: "nousresearch/hermes-3-llama-3.1-405b",
    chatModelFallbacks: [],
    embeddingModel: "openai/text-embedding-3-small",
    embeddingDimension: 1536,
    sttModel: null,
    baseUrl: null,
    extras: {},
    allowedChatModels: [],
    allowedEmbeddingModels: [],
  });
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig("openrouter", { apiKey: "sk-byok-fallback-12345678" }, USER_ID);
  const settings = await svc.updateSettings(
    { activeTenantInstanceId: "personal-1" },
    USER_ID,
  );
  assert.equal(settings.activeTenantInstanceId, "personal-1");
});

test("UserProvidersService.updateSettings — rechaza instancia personal de otro usuario", async () => {
  const prisma = mockPrisma();
  const store = (prisma as { __store: { instances: Map<string, Record<string, unknown>> } })
    .__store;
  store.instances.set("other-personal", {
    id: "other-personal",
    providerType: "openrouter",
    displayName: "Ajena",
    createdByUserId: "other-user",
    enabledForUsers: false,
    isTenantDefault: false,
    tokenCiphertext: "enc:sk-other-12345678",
    tokenKeyVersion: 1,
    chatModel: "nousresearch/hermes-3-llama-3.1-405b",
    chatModelFallbacks: [],
    embeddingModel: null,
    embeddingDimension: 1536,
    sttModel: null,
    baseUrl: null,
    extras: {},
    allowedChatModels: [],
    allowedEmbeddingModels: [],
  });
  const svc = new UserProvidersService(prisma, mockCrypto());
  await assert.rejects(
    () => svc.updateSettings({ activeTenantInstanceId: "other-personal" }, USER_ID),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("UserProvidersService.resolveRuntime — tenant primero", async () => {
  const prisma = mockPrisma();
  const store = (
    prisma as {
      __store: {
        settings: {
          userId: string;
          activeProvider: string;
          activeTenantInstanceId: string | null;
          embeddingProvider: string | null;
          embeddingsEnabled: boolean;
        } | null;
        instances: Map<string, Record<string, unknown>>;
      };
    }
  ).__store;
  store.instances.set("tenant-1", {
    id: "tenant-1",
    providerType: "openrouter",
    displayName: "Equipo OR",
    enabledForUsers: true,
    isTenantDefault: true,
    tokenCiphertext: "enc:sk-tenant-key-12345678",
    tokenKeyVersion: 1,
    chatModel: "nousresearch/hermes-3-llama-3.1-405b",
    chatModelFallbacks: [],
    embeddingModel: "openai/text-embedding-3-small",
    embeddingDimension: 1536,
    sttModel: null,
    baseUrl: null,
    extras: {},
    allowedChatModels: [],
    allowedEmbeddingModels: [],
  });
  store.settings = {
    userId: USER_ID,
    activeProvider: "openrouter",
    activeTenantInstanceId: "tenant-1",
    embeddingProvider: null,
    embeddingsEnabled: true,
    allowedChatModels: [],
  };
  const svc = new UserProvidersService(prisma, mockCrypto());
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.apiKey, "sk-tenant-key-12345678");
  assert.equal(runtime.providerId, "openrouter");
});

test("UserProvidersService.updateSettings — developer no puede elegir proveedor", async () => {
  const prisma = mockPrisma();
  (prisma as { __store: { userRole: string } }).__store.userRole = "developer";
  const svc = new UserProvidersService(prisma, mockCrypto());
  await assert.rejects(
    () => svc.updateSettings({ activeProvider: "openai" }, USER_ID),
    (err: unknown) => err instanceof ForbiddenException,
  );
});

test("UserProvidersService.updateUserAllowedChatModels — super_admin puede asignar modelo libre", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  const result = await svc.updateUserAllowedChatModels(
    USER_ID,
    "minimax/minimax-m2.5, custom/vendor-model-xyz",
  );
  assert.deepEqual(result.allowedChatModels, [
    "minimax/minimax-m2.5",
    "custom/vendor-model-xyz",
  ]);
});

test("UserProvidersService.updateUserAllowedChatModels — rechaza nombre demasiado corto", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await assert.rejects(
    () => svc.updateUserAllowedChatModels(USER_ID, "x"),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("UserProvidersService.resolveRuntime — usa modelo del proveedor activo", async () => {
  const prisma = mockPrisma();
  const store = (
    prisma as {
      __store: {
        settings: {
          userId: string;
          activeProvider: string;
          activeTenantInstanceId: string | null;
          embeddingProvider: string | null;
          embeddingsEnabled: boolean;
          allowedChatModels: string[];
        } | null;
        instances: Map<string, Record<string, unknown>>;
      };
    }
  ).__store;
  store.instances.set("mini", {
    id: "mini",
    providerType: "openrouter",
    displayName: "Mini max",
    createdByUserId: USER_ID,
    enabledForUsers: false,
    isTenantDefault: false,
    tokenCiphertext: "enc:sk-tenant-key-12345678",
    tokenKeyVersion: 1,
    chatModel: "minimax/minimax-m2.5",
    chatModelFallbacks: [],
    embeddingModel: null,
    embeddingDimension: 1536,
    sttModel: null,
    baseUrl: null,
    extras: {},
    allowedChatModels: [],
    allowedEmbeddingModels: [],
  });
  store.settings = {
    userId: USER_ID,
    activeProvider: "openrouter",
    activeTenantInstanceId: "mini",
    embeddingProvider: null,
    embeddingsEnabled: true,
    allowedChatModels: ["minimax/minimax-m2.5"],
  };
  const svc = new UserProvidersService(prisma, mockCrypto());
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.chatModel, "minimax/minimax-m2.5");
});

test("UserProvidersService.resolveRuntime — sin activo usa default del equipo", async () => {
  const prisma = mockPrisma();
  const store = (
    prisma as {
      __store: {
        settings: {
          userId: string;
          activeProvider: string;
          activeTenantInstanceId: string | null;
          embeddingProvider: string | null;
          embeddingsEnabled: boolean;
          allowedChatModels: string[];
        } | null;
        instances: Map<string, Record<string, unknown>>;
      };
    }
  ).__store;
  store.instances.set("legacy", {
    id: "legacy",
    providerType: "openrouter",
    displayName: "Legacy openrouter",
    enabledForUsers: true,
    isTenantDefault: true,
    tokenCiphertext: "enc:sk-tenant-key-12345678",
    tokenKeyVersion: 1,
    chatModel: "nousresearch/hermes-3-llama-3.1-405b",
    chatModelFallbacks: [],
    embeddingModel: null,
    embeddingDimension: 1536,
    sttModel: null,
    baseUrl: null,
    extras: {},
    allowedChatModels: [],
    allowedEmbeddingModels: [],
  });
  store.settings = {
    userId: USER_ID,
    activeProvider: "openrouter",
    activeTenantInstanceId: null,
    embeddingProvider: null,
    embeddingsEnabled: true,
    allowedChatModels: [],
  };
  const svc = new UserProvidersService(prisma, mockCrypto());
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.chatModel, "nousresearch/hermes-3-llama-3.1-405b");
});

test("UserProvidersService.resolveRuntime — grant de usuario fuera del catálogo", async () => {
  const prisma = mockPrisma();
  const store = (
    prisma as {
      __store: {
        settings: {
          userId: string;
          activeProvider: string;
          activeTenantInstanceId: string | null;
          embeddingProvider: string | null;
          embeddingsEnabled: boolean;
          allowedChatModels: string[];
        } | null;
        instances: Map<string, Record<string, unknown>>;
      };
    }
  ).__store;
  store.instances.set("tenant-minimax", {
    id: "tenant-minimax",
    providerType: "openrouter",
    displayName: "Mini max",
    enabledForUsers: true,
    isTenantDefault: false,
    tokenCiphertext: "enc:sk-tenant-key-12345678",
    tokenKeyVersion: 1,
    chatModel: "minimax/minimax-m2.5",
    chatModelFallbacks: [],
    embeddingModel: null,
    embeddingDimension: 1536,
    sttModel: null,
    baseUrl: null,
    extras: {},
    allowedChatModels: [],
    allowedEmbeddingModels: [],
  });
  store.settings = {
    userId: USER_ID,
    activeProvider: "openrouter",
    activeTenantInstanceId: "tenant-minimax",
    embeddingProvider: null,
    embeddingsEnabled: true,
    allowedChatModels: ["minimax/minimax-m2.5"],
  };
  const svc = new UserProvidersService(prisma, mockCrypto());
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.chatModel, "minimax/minimax-m2.5");
});

test("UserProvidersService — groq upsert, baseURL y STT", async () => {
  const prisma = mockPrisma();
  const svc = new UserProvidersService(prisma, mockCrypto());
  await svc.upsertConfig("groq", { apiKey: "gsk_test_groq_key_12345678" }, USER_ID);
  await svc.updateSettings({ activeProvider: "groq" }, USER_ID);
  const runtime = await svc.resolveRuntime(USER_ID);
  assert.equal(runtime.providerId, "groq");
  assert.equal(runtime.baseURL, "https://api.groq.com/openai/v1");
  assert.equal(runtime.chatModel, "llama-3.3-70b-versatile");
  const stt = await svc.resolveSttRuntime(USER_ID);
  assert.equal(stt.sttModel, "whisper-large-v3");
});
