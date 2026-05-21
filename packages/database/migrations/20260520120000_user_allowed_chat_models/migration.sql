-- Modelos de chat permitidos por usuario (grants super_admin sobre instancia tenant)

ALTER TABLE "UserAISettings" ADD COLUMN IF NOT EXISTS "allowedChatModels" TEXT[] DEFAULT ARRAY[]::TEXT[];
