import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { requestUserStore } from "../../common/request-user.store.js";
import { ProviderInstancesService } from "./provider-instances.service.js";
import { UserProvidersService } from "./user-providers.service.js";
import type { TokenCryptoService } from "../crypto/token-crypto.service.js";
import type { PrismaService } from "../../prisma/prisma.service.js";

const ACTOR_ID = "super-admin-1";

function mockCrypto(): TokenCryptoService {
  return {
    encrypt: (plain: string) => ({ ciphertext: `enc:${plain}`, keyVersion: 1 }),
    decrypt: (cipher: string, _keyVersion: number) => cipher.replace(/^enc:/, ""),
    getActiveVersion: () => 1,
    listKeyVersions: () => [1],
  } as unknown as TokenCryptoService;
}

function matchesListWhere(
  row: Record<string, unknown>,
  where: { OR?: Array<{ createdByUserId?: string; enabledForUsers?: boolean }> },
  actorUserId: string,
): boolean {
  if (!where.OR?.length) return true;
  return where.OR.some((clause) => {
    if (clause.createdByUserId !== undefined && row.createdByUserId === clause.createdByUserId) {
      return true;
    }
    if (clause.enabledForUsers === true && row.enabledForUsers === true) {
      return true;
    }
    return false;
  });
}

function mockPrisma() {
  const instances = new Map<string, Record<string, unknown>>();
  return {
    providerInstance: {
      findMany: async ({
        where,
      }: {
        where?: { OR?: Array<{ createdByUserId?: string; enabledForUsers?: boolean }> };
      } = {}) => {
        const rows = [...instances.values()];
        if (!where?.OR) return rows;
        const actorId = where.OR.find((c) => c.createdByUserId)?.createdByUserId ?? "";
        return rows.filter((row) => matchesListWhere(row, where, actorId));
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        instances.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { enabledForUsers?: boolean } }) => {
        for (const row of instances.values()) {
          if (where.enabledForUsers === undefined || row.enabledForUsers === where.enabledForUsers) {
            return row;
          }
        }
        return null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `inst-${instances.size + 1}`;
        const row = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
        instances.set(id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...instances.get(where.id)!, ...data };
        instances.set(where.id, row);
        return row;
      },
      updateMany: async () => ({ count: 0 }),
      delete: async ({ where }: { where: { id: string } }) => {
        instances.delete(where.id);
      },
    },
    userAISettings: {
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as PrismaService;
}

function mockUserProviders(): UserProvidersService {
  return {
    validateUserMayUseChatModels: async () => undefined,
  } as unknown as UserProvidersService;
}

test("ProviderInstancesService.create — requiere apiKey", async () => {
  const svc = new ProviderInstancesService(mockPrisma(), mockCrypto(), mockUserProviders());
  await assert.rejects(
    () =>
      requestUserStore.run({ userId: ACTOR_ID, role: "admin" }, () =>
        svc.create(
          {
            providerType: "openai",
            slug: "prod",
            displayName: "OpenAI prod",
            apiKey: "",
          },
          ACTOR_ID,
        ),
      ),
    (err: unknown) => err instanceof BadRequestException,
  );
});

test("ProviderInstancesService.listForManagement — admin ve instancias del equipo", async () => {
  const prisma = mockPrisma();
  const svc = new ProviderInstancesService(prisma, mockCrypto(), mockUserProviders());
  await requestUserStore.run({ userId: ACTOR_ID, role: "super_admin" }, () =>
    svc.create(
      {
        providerType: "openrouter",
        slug: "team",
        displayName: "OpenRouter equipo",
        apiKey: "sk-or-test-12345678",
        enabledForUsers: true,
      },
      ACTOR_ID,
    ),
  );
  const list = await svc.listForManagement("admin-1", "admin");
  assert.equal(list.length, 1);
  assert.equal(list[0]?.displayName, "OpenRouter equipo");
});

test("ProviderInstancesService.create — crea instancia", async () => {
  const svc = new ProviderInstancesService(mockPrisma(), mockCrypto(), mockUserProviders());
  const row = await requestUserStore.run({ userId: ACTOR_ID, role: "super_admin" }, () =>
    svc.create(
      {
        providerType: "openrouter",
        slug: "team",
        displayName: "OpenRouter equipo",
        apiKey: "sk-or-test-12345678",
        enabledForUsers: true,
      },
      ACTOR_ID,
    ),
  );
  assert.equal(row.providerType, "openrouter");
  assert.equal(row.slug, "team");
  assert.equal(row.enabledForUsers, true);
  assert.ok(row.apiKeyHint?.includes("…"));
});
