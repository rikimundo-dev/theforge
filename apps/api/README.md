# @theforge/api

Backend NestJS de TheForge.

- **Módulos:** Projects (incluye **`GET/POST/PATCH …/projects/:projectId/stages`** — crear/actualizar etapa responden `{ stage }`; **`POST …/generate-deliverables`** cascada por `complexity`; generación/preview de **Contratos API** bloqueada si el Blueprint no cubre el §3 del MDD; MDD por etapa con `stageId` en PATCH), Sessions, AI (adapters OpenAI/Gemini), Engine (cost-calculator, semáforo, conformance). **Ai-orchestrator:** `POST /ai-orchestrator/welcome` acepta `stageId` opcional (contexto MDD alineado a la etapa). **Ai-analysis:** checkpoints LangGraph / `mdd/thread` por `projectId` + `mddStageId`.
- **DB:** Prisma + PostgreSQL (schema en `packages/database`).
- **IA:** proveedor activo `AI_PROVIDER` (`openai` \| `google` \| `gemini` \| `kimi` \| `moonshot`). Config central `modules/ai/config/llm-config.ts`: mismo runtime para adapters y `createDbgaLLM`. OpenAI-compatible usa `AI_API_KEY` (alias `OPENAI_API_KEY`) + opcional `OPENAI_BASE_URL` / `OPENAI_CHAT_MODEL`. Embeddings: `LLM_EMBEDDINGS_PROVIDER` opcional; con chat Kimi y clave Google, embeddings vía Gemini.

Env: `DATABASE_URL`, claves existentes (`AI_API_KEY` o `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEY`). Ver `.env.example`. **Auth (Fase 1):** Passport **`JwtStrategy`** + `JwtAuthGuard` global; `UserContextInterceptor` + `AsyncLocalStorage` propagan `userId` del JWT a `ProjectsService` / `SessionsService` (filtrado por propiedad). `JWT_SECRET` obligatorio en producción. **OTP:** `EMAIL_OTP` (recomendado en Docker/Dokploy) o `AUTH_ALLOWED_OTP_EMAIL` — único correo que recibe el código; en producción uno de los dos es obligatorio al arranque. SMTP como en `.env.example`; tras verify, `User` en BD y **`sub` en JWT = `User.id`**.

**CORS:** `CORS_ORIGINS` (coma) obligatorio si `NODE_ENV=production`; `docker-compose` incluye por defecto `https://theforge.kreoint.mx`, `WEB_DOMAIN` y localhost (Vite). Sobreescribe en Dokploy si el front vive en otro origen.

**BullMQ (opcional):** con `REDIS_URL`, la cascada `POST /projects/:id/generate-deliverables` se encola (`theforge-deliverables`); el cliente usa polling o `GET …/deliverables-jobs/:jobId/stream` (SSE). Sin Redis, la respuesta sigue siendo el proyecto actualizado en la misma petición.

**SSRF (scrape):** `url-ssrf-guard.ts` — resolución DNS y `ip-range-check`; usado en `scrape-cheerio.tool.ts` y `ScraperService`. Proyectos **legacy** + MCP: `THEFORGE_MCP_URL`, tokens MCP; pipeline evidencia-primero y topes en variables `LEGACY_*` (ver raíz `.env.example` y `docs/LEGACY-EVIDENCE-CONTEXT.md`).

## Despliegue (Docker / Dokploy)

- **ENTRYPOINT** `docker-entrypoint.sh`: (1) espera TCP a Postgres vía `scripts/wait-for-postgres.cjs`, (2) `prisma migrate deploy` desde `packages/database`, (3) arranca Nest (`main.js`).
- En la UI de Dokploy (o cualquier plataforma), **no** sustituir el comando de arranque por `node dist/main.js` solo: se saltarían las migraciones. Usar la imagen tal cual o un comando que invoque el mismo entrypoint.
- Opcional: `WAIT_FOR_POSTGRES_ATTEMPTS` (default 90), `WAIT_FOR_POSTGRES_DELAY_MS` (default 1000).
- **P3009** (`stage_sdd_deliverables`): el entrypoint intenta `migrate resolve --rolled-back` automáticamente antes de `deploy`. Otra migración atascada: `PRISMA_RESOLVE_ROLLED_BACK` o [packages/database/README.md](../../packages/database/README.md).
