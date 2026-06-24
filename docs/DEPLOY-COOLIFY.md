# Despliegue en Coolify

`docker-compose.yml` está optimizado para Coolify: un solo archivo, sin red externa ni `container_name` fijos.

## Compose

En **Coolify** (v4+):

1. Nuevo recurso → **Docker Compose**.
2. Repositorio + rama.
3. Archivo compose: **`docker-compose.yml`** (solo este).
4. Dominio → servicio **`theforge-web`**, puerto **80**.

Validar en local antes de subir:

```bash
docker compose config
# o: pnpm run compose:config
```

## Routing (recomendado: un solo dominio)

El compose monta `nginx.local.conf` en `theforge-web`, que hace proxy de `/api/` → `theforge-api:3000`. Configura **un dominio** apuntando a `theforge-web:80`; no hace falta path split en Traefik/Caddy.

El frontend usa `API_BASE = /api` por defecto; no hace falta `VITE_API_URL` en build.

### Alternativa: path split (estilo Dokploy)

Si prefieres `/` → web y `/api` → api (strip prefix), usa el perfil Dokploy localmente como referencia (`docker-compose.dokploy.yml`) y adapta: quita el `volumes` de `theforge-web` para usar solo estáticos (`nginx.conf` de la imagen).

## Variables de entorno

Inyecta en el servicio **`theforge-api`** (mínimo):

| Variable | Obligatoria prod |
|----------|------------------|
| `JWT_SECRET` | Sí |
| `TOKEN_MASTER_KEYS` | Sí |
| `TOKEN_ACTIVE_KEY_VERSION` | Sí |
| `CORS_ORIGINS` | Sí (dominio Coolify + localhost dev si aplica) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Sí (OTP login) |
| `OPENROUTER_API_KEY` | Opcional servidor; BYOK en UI |
| `THEFORGE_MCP_URL`, tokens MCP | Si usas Ariadne |
| `REDIS_URL` | Ya en compose: `redis://theforge-redis-queue:6379` |
| `FALKORDB_SDD_URL` | Ya en compose: `redis://theforge-falkor-sdd:6379` |

`DATABASE_URL` viene fijada en compose hacia `theforge-db`. No sobrescribas el **CMD/entrypoint** del API (`docker-entrypoint.sh` ejecuta migraciones Prisma).

## Healthchecks

- **API / MCP:** `http://localhost:3000/health` (probe dentro del contenedor).
- **Web:** `http://localhost:80/`.
- **Adminer:** `http://localhost:8080/`.

## Servicios opcionales

- **`theforge-mcp`:** expón path `/mcp` si Hermes/Cursor deben llamar al MCP HTTP.
- **`theforge-adminer`:** solo interno o detrás de auth; no exponer a internet sin restricción.

## Dokploy vs Coolify

| | Dokploy | Coolify |
|---|---------|---------|
| Compose | `docker-compose.yml` + `docker-compose.dokploy.yml` | Solo `docker-compose.yml` |
| Red externa | `dokploy-network` | Ninguna (red bridge del stack) |
| Proxy | Traefik Dokploy (path split) | Un dominio → web:80 (nginx proxy /api) |
| Local full-docker | `docker-compose.local.yml` | `docker-compose.local.yml` |

Ver también [README-LOCAL.md](../README-LOCAL.md) (dev nativo y compose local).
