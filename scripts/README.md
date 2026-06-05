# Scripts

Scripts de utilidad para el monorepo.

## rotate-master-key

Re-cifra API keys BYOK almacenadas hacia `TOKEN_ACTIVE_KEY_VERSION`.

**Tablas:** `user_provider_configs`, `provider_instances`.

**Requisitos de entorno:**

- `DATABASE_URL` — PostgreSQL (misma BD que el API en prod)
- `TOKEN_MASTER_KEYS` — JSON con **todas** las versiones presentes en BD (p. ej. `{"1":"...","2":"..."}`)
- `TOKEN_ACTIVE_KEY_VERSION` — versión destino (debe existir en el JSON)

**Uso:**

```bash
pnpm run rotate-master-key
```

**Dokploy (sin SSH):** Terminal web del contenedor `theforge-api`:

```bash
cd /app && pnpm run rotate-master-key
```

Documentación completa: [README.md § Cifrado de tokens BYOK](../README.md#cifrado-de-tokens-byok-claves-maestras).

## ensure-infra.js

Asegura runtime Docker (Colima en Mac si hace falta) y contenedores:

| Contenedor | Puerto host |
|------------|-------------|
| `theforge-db` | 5432 |
| `theforge-falkor-sdd` | 6379 |
| `theforge-redis-queue` | 6381 |

Usado por `dev:local` y `dev:api`. Ver [README-LOCAL.md](../README-LOCAL.md).

## wait-for-api.js

Antes de `vite`, hace polling a `GET /health` en el API (por defecto `http://127.0.0.1:3000/health`) hasta que responda o agote el timeout (120s). Lo usa `@theforge/web` en `pnpm run dev` / `dev:local` para que el proxy no reciba `ECONNREFUSED` mientras Nest compila.

Variables opcionales: `PORT` / `API_PORT`, `API_WAIT_HOST`, `API_WAIT_TIMEOUT_MS`, `API_WAIT_INTERVAL_MS`.

Si solo levantas el front (`dev:web`), el API debe estar ya en marcha o el script fallará con timeout.

## ensure-postgres.js

Asegura que Colima (runtime de contenedores) y el contenedor Docker `theforge-db` (Postgres) estén en ejecución. **Preferir `ensure-infra.js`** (Postgres + Falkor + Redis cola).

1. **Colima:** si no está corriendo, ejecuta `colima start --cpu 2 --memory 4`.
2. **Postgres:** si el contenedor no existe, lo crea; si existe pero está parado, lo inicia; si ya está Up, no hace nada.

Se usa desde el script `dev:local` del `package.json` raíz. Requiere Colima y Docker CLI instalados.

## Redis de cola (BullMQ) y `REDIS_URL`

En **Docker Compose** (`docker-compose.yml`) el servicio **`theforge-redis-queue`** expone Redis 6379 **solo en la red interna** del stack; el API recibe `REDIS_URL=redis://theforge-redis-queue:6379` por defecto.

- **Local sin Compose:** levanta Redis (p. ej. `redis-server` o un contenedor en `localhost:6379`) y en `.env` define `REDIS_URL=redis://localhost:6379`. Si `REDIS_URL` está vacío, la API puede operar en modo síncrono para cascadas cortas; cascadas largas de entregables conviene no depender de ello.
- **No confundir** con **FalkorDB** (`theforge-falkor-sdd`): ese servicio es el grafo SDD (Cypher / MDD_Section), no la cola BullMQ.
