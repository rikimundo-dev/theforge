# @theforge/api

Backend NestJS de TheForge.

- **Módulos:** Projects (incluye **`GET/POST/PATCH …/projects/:projectId/stages`** — crear/actualizar etapa responden `{ stage }`; **`POST …/generate-deliverables`** cascada por `complexity`; generación/preview de **Contratos API** bloqueada si el Blueprint no cubre el §3 del MDD; MDD por etapa con `stageId` en PATCH), Sessions, AI (adapter OpenRouter), Engine (cost-calculator, semáforo, conformance). **Ai-orchestrator:** `POST /ai-orchestrator/welcome` acepta `stageId` opcional (contexto MDD alineado a la etapa). **Ai-analysis:** checkpoints LangGraph / `mdd/thread` por `projectId` + `mddStageId`.
- **DB:** Prisma + PostgreSQL (schema en `packages/database`).
- **IA:** un solo proveedor, **OpenRouter** (`https://openrouter.ai/api/v1` compatible OpenAI). Config: `modules/ai/config/llm-config.ts` + `llm-model-fallback.ts`; `OpenRouterAdapter` + `createDbgaLLM` comparten `resolvePrimaryChatRuntime`. Clave: `OPENROUTER_API_KEY` o alias `AI_API_KEY` / `OPENAI_API_KEY`. Chat: default `nousresearch/hermes-3-llama-3.1-405b` (`OPENROUTER_CHAT_MODEL`); opcional cadena `OPENROUTER_CHAT_MODEL_FALLBACKS` (o `OPENROUTER_CHAT_MODEL_FALLBACK`) con `OPENROUTER_CHAT_FALLBACK_ON_429`. Sin fallbacks en env, comportamiento idéntico al de un solo modelo. Embeddings: mismo endpoint, default `openai/text-embedding-3-small` (`OPENROUTER_EMBEDDING_MODEL`); `LLM_EMBEDDINGS_PROVIDER=none` desactiva.

Env: `DATABASE_URL` y claves en `.env.example` (OpenRouter). **Auth multi-usuario:** Passport **`JwtStrategy`** + `JwtAuthGuard` global; `UserContextInterceptor` + `AsyncLocalStorage` propagan `userId` y `role` del JWT a `ProjectsService` / `SessionsService` (filtrado por propiedad). `JWT_SECRET` obligatorio en producción. **OTP por email:** el correo viene en el body del request y se valida contra la tabla `User` (anti-enumeración: si el email no existe, devuelve `ok` sin enviar nada). `SMTP_*` obligatorias en producción. Cada usuario tiene su propio `mcpSecret` (API key M2M para el MCP server, rotable desde la UI por el dueño o por un admin). El primer admin se crea desde la UI (SetupView) cuando `GET /auth/has-users` devuelve `false`. Las envs `EMAIL_OTP` / `AUTH_ALLOWED_OTP_EMAIL` están deprecadas.

**CORS:** `CORS_ORIGINS` (coma) obligatorio si `NODE_ENV=production`; `docker-compose` incluye por defecto `https://theforge.kreoint.mx`, `WEB_DOMAIN` y localhost (Vite). Sobreescribe en Dokploy si el front vive en otro origen.

**BullMQ (opcional):** con `REDIS_URL`, la cascada `POST /projects/:id/generate-deliverables` se encola (`theforge-deliverables`); el cliente usa polling o `GET …/deliverables-jobs/:jobId/stream` (SSE). Sin Redis, la respuesta sigue siendo el proyecto actualizado en la misma petición.

**SSRF (scrape):** `url-ssrf-guard.ts` — resolución DNS y `ip-range-check`; usado en `scrape-cheerio.tool.ts` y `ScraperService`. Proyectos **legacy** + MCP: `THEFORGE_MCP_URL`, tokens MCP; pipeline evidencia-primero y topes en variables `LEGACY_*` (ver raíz `.env.example` y `docs/notebooklm/LEGACY-EVIDENCE-CONTEXT.md`).

## Despliegue (Docker / Dokploy)

- **ENTRYPOINT** `docker-entrypoint.sh`: (1) espera TCP a Postgres vía `scripts/wait-for-postgres.cjs`, (2) `prisma migrate deploy` desde `packages/database`, (3) opcional `WIPE_BYOK_ON_START=1` → `scripts/wipe-byok-ciphertext.sql`, (4) arranca Nest (`main.js`).
- En la UI de Dokploy (o cualquier plataforma), **no** sustituir el comando de arranque por `node dist/main.js` solo: se saltarían las migraciones. Usar la imagen tal cual o un comando que invoque el mismo entrypoint.
- **BYOK / cifrado:** obligatorias `TOKEN_MASTER_KEYS` + `TOKEN_ACTIVE_KEY_VERSION`. Rotación de clave maestra: `cd /app && npm run rotate-master-key` en la terminal del contenedor (o desde el monorepo con `DATABASE_URL` de prod). Guía: [README raíz § Cifrado de tokens BYOK](../../README.md#cifrado-de-tokens-byok-claves-maestras). Si perdiste la clave vieja: nuevo `TOKEN_MASTER_KEYS`, `WIPE_BYOK_ON_START=1` en Dokploy, redeploy, quitar la variable, reconfigurar keys en UI.
- Opcional: `WAIT_FOR_POSTGRES_ATTEMPTS` (default 90), `WAIT_FOR_POSTGRES_DELAY_MS` (default 1000).
- **P3009** (`stage_sdd_deliverables`): el entrypoint intenta `migrate resolve --rolled-back` automáticamente antes de `deploy`. Otra migración atascada: `PRISMA_RESOLVE_ROLLED_BACK` o [packages/database/README.md](../../packages/database/README.md).
