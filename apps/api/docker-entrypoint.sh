#!/bin/sh
set -e

# Esperar a que Postgres acepte TCP (Dokploy / orquestadores pueden levantar api antes que db)
node /app/apps/api/scripts/wait-for-postgres.cjs

cd /app/packages/database

# NOTA: No marcar migraciones como applied en cada arranque. Eso provocaba que en BD vacías
# se saltara 20250311000000 y fallara 20250311100000 (Project no existe).
# Si db push creó el schema y "ProjectType already exists", ejecutar manualmente una vez:
#   prisma migrate resolve --applied 20250311000000_add_project_type_relic

# P3018: 20250311100000 falló por "Project does not exist" (20250309000000 crea el schema). Desbloquear.
if npx prisma migrate resolve --rolled-back 20250311100000_add_legacy_flow_state 2>/dev/null; then
  echo "migrate resolve: cleared failed record for 20250311100000_add_legacy_flow_state"
fi

# P3009: migración stage_sdd fallida en deploys viejos (enum Status). Idempotente: solo actúa si sigue en estado fallido.
# Tras deploy con 20260327140000_ensure_pg_enums_idempotent los ENUM suelen existir incluso si una migración falló antes.
if npx prisma migrate resolve --rolled-back 20250319140000_stage_sdd_deliverables 2>/dev/null; then
  echo "migrate resolve: cleared failed record for 20250319140000_stage_sdd_deliverables"
fi

# P3009: agent_checkpoint_mdd_stage fallida (p. ej. constraint/index ya existente o tabla no creada).
if npx prisma migrate resolve --rolled-back 20260319130000_agent_checkpoint_mdd_stage 2>/dev/null; then
  echo "migrate resolve: cleared failed record for 20260319130000_agent_checkpoint_mdd_stage"
fi

# Otra migración atascada (opcional): PRISMA_RESOLVE_ROLLED_BACK=<nombre_carpeta>
if [ -n "$PRISMA_RESOLVE_ROLLED_BACK" ]; then
  echo "prisma migrate resolve --rolled-back $PRISMA_RESOLVE_ROLLED_BACK"
  npx prisma migrate resolve --rolled-back "$PRISMA_RESOLVE_ROLLED_BACK" || true
fi

# Migraciones en cada arranque del contenedor (producción); fallo → exit 1, sin API
echo "Running prisma migrate deploy..."
npx prisma migrate deploy || {
  echo "ERROR: prisma migrate deploy failed. Check DATABASE_URL and that migrations exist."
  echo "Si es P3009 con otra migración: packages/database/README.md — PRISMA_RESOLVE_ROLLED_BACK o resolve manual."
  exit 1
}

# Opcional (una vez): tras rotar TOKEN_MASTER_KEYS sin la clave vieja. Idempotente; quitar env tras el deploy.
if [ "${WIPE_BYOK_ON_START:-}" = "1" ]; then
  echo "WIPE_BYOK_ON_START=1: wiping ProviderInstance and UserProviderConfig..."
  npx prisma db execute --file /app/apps/api/scripts/wipe-byok-ciphertext.sql
  echo "WIPE_BYOK_ON_START: done. Unset WIPE_BYOK_ON_START in Dokploy before the next redeploy."
fi

# Sincronizar schema: crea columnas/índices no cubiertos por migraciones versionadas
# (ej. mcpSecret agregado directamente en schema.prisma sin generar migración)
echo "Running prisma db push (schema sync)..."
npx prisma db push --accept-data-loss || true

# Fallback SQL directo por si db push no creó la columna
echo "Checking mcpSecret column via SQL..."
PGPASSWORD=${POSTGRES_PASSWORD:-theforge} psql -U ${POSTGRES_USER:-theforge} -d ${POSTGRES_DB:-theforge} -h localhost -c 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mcpSecret" TEXT UNIQUE;' 2>&1 || true

cd /app/apps/api
MAIN_JS="$(find . -name main.js -type f 2>/dev/null | head -1)"
if [ -z "$MAIN_JS" ]; then
  echo "ERROR: main.js not found in dist. Check Nest build output."
  exit 1
fi
echo "Starting API ($MAIN_JS)..."
exec node "$MAIN_JS"
