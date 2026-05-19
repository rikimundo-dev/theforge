import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { UserProvidersService } from "./user-providers.service.js";
import type { TokenCryptoService } from "../crypto/token-crypto.service.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const USER_ID = "user-test-1";

function mockPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const store = {
    settings: null as {
      userId: string;
      activeProvider: string;
      embeddingProvider: string | null;
      embeddingsEnabled: boolean;
    } | null,
    configs: new Map<string, Record<string, unknown>>(),
  };

  return {
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
  } as unknown as PrismaService;
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
