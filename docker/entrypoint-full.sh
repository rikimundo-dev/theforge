#!/bin/sh
set -e

# Iniciar Postgres en background (entrypoint por defecto de la imagen)
if [ -x /usr/local/bin/docker-entrypoint.sh ]; then
  /usr/local/bin/docker-entrypoint.sh postgres &
elif [ -x /docker-entrypoint.sh ]; then
  /docker-entrypoint.sh postgres &
else
  su postgres -c "pg_ctl -D /var/lib/postgresql/data start" &
fi

# Esperar a que Postgres acepte conexiones
until pg_isready -U theforge -d theforge -h localhost 2>/dev/null; do
  sleep 1
done

# Migraciones versionadas (si hay archivos en prisma/migrations/)
cd /app/packages/database
echo "[entrypoint] Ejecutando migrate deploy..."
./node_modules/.bin/prisma migrate deploy 2>&1 || true

# Sincronizar schema completo (crea columnas faltantes, índices, etc.)
echo "[entrypoint] Sincronizando schema con db push..."
./node_modules/.bin/prisma db push --accept-data-loss 2>&1 || true

# Fallback directo SQL por si db push no funcionó (cache o schema desfasado)
echo "[entrypoint] Verificando columna mcpSecret via SQL directo..."
PGPASSWORD=theforge psql -U theforge -d theforge -h localhost -c 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mcpSecret" TEXT UNIQUE;' 2>&1 || true
echo "[entrypoint] Schema sincronizado correctamente"

# API en background
cd /app/apps/api
node dist/main.js &
sleep 2

# Nginx en primer plano
exec nginx -g "daemon off;"
