# Despliegue en Coolify

`docker-compose.yml` está optimizado para Coolify: un solo archivo, sin red externa ni `container_name` fijos.

## Compose

En **Coolify** (v4+):

1. Nuevo recurso → **Docker Compose**.
2. Repositorio + rama `master`.
3. Archivo compose: **`docker-compose.yaml`** (por defecto en Coolify) o **`docker-compose.yml`**.
4. Dominio → servicio **`theforge-web`**, puerto **80**.

Validar en local antes de subir:

```bash
docker compose config
# o: pnpm run compose:config
```

## Routing (un solo dominio)

La imagen web incluye `nginx.local.conf` (proxy `/api/` → `theforge-api:3000`). Configura **un dominio** → `theforge-web:80`.

El frontend usa `API_BASE = /api` por defecto; no hace falta `VITE_API_URL` en build.

## Ajustes en Coolify (importante)

### Servidor / build

| Ajuste | Valor recomendado |
|--------|-------------------|
| RAM del servidor | **≥ 4 GB** (ideal 8 GB en el primer deploy) |
| Swap | Activado si el VPS tiene poca RAM |
| Compose file | `docker-compose.yaml` |

Si el build vuelve a fallar con exit code **255** tras muchos minutos (timeout/OOM):

1. En el recurso → **Environment Variables** (nivel stack), añade:
   - `COMPOSE_PARALLEL_LIMIT=1` — builds uno a uno (más lento, menos RAM).
2. En **Server** → revisa que no haya límite de timeout de deploy demasiado bajo.
3. Redeploy tras el push con Dockerfiles optimizados (install filtrado por servicio).

### Variables de entorno (servicio `theforge-api`)

| Variable | Obligatoria prod |
|----------|------------------|
| `JWT_SECRET` | Sí |
| `TOKEN_MASTER_KEYS` | Sí |
| `TOKEN_ACTIVE_KEY_VERSION` | Sí |
| `CORS_ORIGINS` | Sí (tu dominio Coolify + localhost dev si aplica) |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Sí (OTP login) |
| `OPENROUTER_API_KEY` | Opcional servidor; BYOK en UI |
| `THEFORGE_MCP_URL`, tokens MCP | Si usas Ariadne externo |
| `REDIS_URL` | Ya en compose: `redis://theforge-redis-queue:6379` |
| `FALKORDB_SDD_URL` | Ya en compose: `redis://theforge-falkor-sdd:6379` |

`DATABASE_URL` viene fijada en compose hacia `theforge-db`. **No** sobrescribas el entrypoint del API.

Las variables de runtime **no** deben pasarse como build-args si Coolify ofrece desactivar “inject env into build”; no es obligatorio, pero reduce ruido en el build.

### Servicio MCP (opcional)

`theforge-mcp` usa el profile **`mcp`** y **no se despliega** por defecto (evita un tercer build pesado).

Para activarlo más adelante, en Environment Variables del stack:

```text
COMPOSE_PROFILES=mcp
```

Luego expón path `/mcp` → `theforge-mcp:3000` si lo necesitas.

## Healthchecks

- **API / MCP:** `http://localhost:3000/health`
- **Web:** `http://localhost:80/`
- **Adminer:** `http://localhost:8080/`

## Servicios opcionales

- **`theforge-adminer`:** solo interno o detrás de auth.
- **`theforge-mcp`:** profile `mcp` (ver arriba).

## Dokploy vs Coolify

| | Dokploy | Coolify |
|---|---------|---------|
| Compose | `docker-compose.yml` + `docker-compose.dokploy.yml` | Solo `docker-compose.yml` |
| Red externa | `dokploy-network` | Ninguna |
| Proxy | Traefik path split | Un dominio → web:80 |
| MCP | Siempre en stack | Profile `mcp` (opcional) |

Ver también [README-LOCAL.md](../README-LOCAL.md).
