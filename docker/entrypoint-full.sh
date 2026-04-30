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

# Migraciones — primero las versionadas, después sincronizar schema actual
cd /app/packages/database 2>&1 && \
  ./node_modules/.bin/prisma migrate deploy 2>&1 && \
  echo "[entrypoint] Migraciones versionadas aplicadas correctamente" || \
  (echo "[entrypoint] Sin migraciones versionadas — ejecutando db push para sincronizar schema..." && \
   ./node_modules/.bin/prisma db push 2>&1 && \
   echo "[entrypoint] Schema sincronizado via db push")

# API en background
cd /app/apps/api
node dist/main.js &
sleep 2

# Nginx en primer plano
exec nginx -g "daemon off;"
