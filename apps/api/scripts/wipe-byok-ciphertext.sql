-- Ejecutado solo si WIPE_BYOK_ON_START=1 en el entrypoint del API.
-- Tokens cifrados con TOKEN_MASTER_KEYS anterior son irrecuperables; re-ingresar API keys en la UI.
UPDATE "UserAISettings"
SET "activeTenantInstanceId" = NULL,
    "mddAuditorTenantInstanceId" = NULL;

DELETE FROM "UserProviderConfig";
DELETE FROM "ProviderInstance";
