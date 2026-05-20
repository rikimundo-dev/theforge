-- super_admin role + instancias de proveedor tenant (ProviderInstance)

CREATE TABLE "ProviderInstance" (
    "id" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "tokenCiphertext" TEXT NOT NULL,
    "tokenKeyVersion" INTEGER NOT NULL,
    "chatModel" TEXT NOT NULL,
    "chatModelFallbacks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embeddingModel" TEXT,
    "embeddingDimension" INTEGER,
    "sttModel" TEXT,
    "baseUrl" TEXT,
    "extras" JSONB,
    "enabledForUsers" BOOLEAN NOT NULL DEFAULT false,
    "allowedChatModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedEmbeddingModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isTenantDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderInstance_providerType_slug_key" ON "ProviderInstance"("providerType", "slug");
CREATE INDEX "ProviderInstance_providerType_idx" ON "ProviderInstance"("providerType");
CREATE INDEX "ProviderInstance_enabledForUsers_idx" ON "ProviderInstance"("enabledForUsers");

ALTER TABLE "ProviderInstance" ADD CONSTRAINT "ProviderInstance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserAISettings" ADD COLUMN IF NOT EXISTS "activeTenantInstanceId" TEXT;

ALTER TABLE "UserAISettings" DROP CONSTRAINT IF EXISTS "UserAISettings_activeTenantInstanceId_fkey";
ALTER TABLE "UserAISettings" ADD CONSTRAINT "UserAISettings_activeTenantInstanceId_fkey" FOREIGN KEY ("activeTenantInstanceId") REFERENCES "ProviderInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Usuario más antiguo → super_admin (prod bootstrap)
UPDATE "User" SET "role" = 'super_admin'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1);

-- Migrar BYOK existentes a instancias tenant (propiedad del super_admin más antiguo)
INSERT INTO "ProviderInstance" (
    "id",
    "providerType",
    "slug",
    "displayName",
    "tokenCiphertext",
    "tokenKeyVersion",
    "chatModel",
    "chatModelFallbacks",
    "embeddingModel",
    "embeddingDimension",
    "sttModel",
    "baseUrl",
    "extras",
    "enabledForUsers",
    "allowedChatModels",
    "allowedEmbeddingModels",
    "isTenantDefault",
    "createdByUserId",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    upc."provider",
    'legacy-' || substr(replace(upc."id", '-', ''), 1, 12),
    'Legacy ' || upc."provider",
    upc."tokenCiphertext",
    upc."tokenKeyVersion",
    upc."chatModel",
    COALESCE(upc."chatModelFallbacks", ARRAY[]::TEXT[]),
    upc."embeddingModel",
    upc."embeddingDimension",
    upc."sttModel",
    upc."baseUrl",
    upc."extras",
    true,
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    false,
    (SELECT "id" FROM "User" WHERE "role" = 'super_admin' ORDER BY "createdAt" ASC LIMIT 1),
    CURRENT_TIMESTAMP
FROM "UserProviderConfig" upc
WHERE EXISTS (SELECT 1 FROM "User" WHERE "role" = 'super_admin' LIMIT 1);

-- Primera instancia habilitada como default del tenant
UPDATE "ProviderInstance" pi
SET "isTenantDefault" = true
WHERE pi."id" = (
    SELECT "id" FROM "ProviderInstance"
    WHERE "enabledForUsers" = true
    ORDER BY "createdAt" ASC
    LIMIT 1
);

-- Enlazar usuarios con ajustes previos a la instancia legacy del mismo providerType
UPDATE "UserAISettings" uas
SET "activeTenantInstanceId" = pi."id"
FROM "ProviderInstance" pi
WHERE pi."providerType" = uas."activeProvider"
  AND pi."slug" LIKE 'legacy-%'
  AND pi."enabledForUsers" = true
  AND uas."activeTenantInstanceId" IS NULL;
