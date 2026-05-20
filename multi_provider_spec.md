# The Forge - Arquitectura Multi-Proveedor (BYOK + tenant)

Cada usuario puede usar **instancias de proveedor a nivel tenant** (credenciales del equipo) o **BYOK personal** como respaldo. **No hay fallback a claves LLM en variables de entorno** (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, etc.).

## Roles

| Rol | Capacidades |
|-----|-------------|
| `super_admin` | CRUD de `ProviderInstance`, promover otros a `super_admin`, bypass de whitelist de modelos en instancias tenant |
| `admin` | Gestión de usuarios, uso de instancias tenant habilitadas |
| `developer` | Uso de instancias tenant + BYOK personal |

- Primer usuario (`POST /auth/register-first-admin`): `super_admin`.
- Migración prod: usuario más antiguo por `createdAt` → `super_admin` solo si no existe ningún `super_admin`.
- `BOOTSTRAP_ADMIN_EMAILS`: promueve a `admin` únicamente (nunca `super_admin`).

## Componentes

| Pieza | Ubicación |
|-------|-----------|
| Catálogo | `apps/api/src/modules/ai/providers/provider-catalog.ts` — modelos, whitelist base, `supportsStt` / `supportsEmbeddings` |
| Cifrado | `apps/api/src/modules/crypto/` — `TOKEN_MASTER_KEYS`, `TOKEN_ACTIVE_KEY_VERSION` |
| Tenant | `ProviderInstance` — slug único por `providerType`, token cifrado, modelos, `enabledForUsers`, listas blancas, `isTenantDefault` |
| Personal | `UserAISettings` (`activeProvider`, `activeTenantInstanceId`, `embeddingProvider`), `UserProviderConfig` (BYOK) |
| API tenant | `GET/POST/PUT/DELETE /provider-instances` (super_admin), `GET /provider-instances/enabled` |
| API usuario | `GET/PUT /user-providers/*` — `UserProvidersModule` |
| Factory | `AIFactory.createForUser` — resolución tenant-first en `UserProvidersService.resolveRuntime` |
| UI | `/settings` (hash `#/settings`) — instancias tenant, BYOK personal, modal «Agregar proveedor» (super_admin) |

## Flujo de resolución (tenant-first)

1. Si hay instancia tenant `enabledForUsers` y el usuario tiene `activeTenantInstanceId` (o default del tenant) → runtime con credenciales de la instancia.
2. Si no → BYOK personal (`UserProviderConfig` + `activeProvider`).
3. Jobs BullMQ: mismo criterio con `job.data.userId` vía `runWithRequestUserAsync`.
4. Modelos nuevos en catálogo: deshabilitados para no–super-admin hasta añadirlos a `allowedChatModels` / `allowedEmbeddingModels` de la instancia (lista vacía = solo modelos del catálogo publicados).
5. Embeddings: instancia tenant si soporta; si no, `embeddingProvider` personal (p. ej. anthropic activo + openai para vectores).

## Flujo BYOK personal (respaldo)

1. Usuario guarda clave API (`PUT /user-providers/configs/:provider`).
2. Usuario elige proveedor activo personal (`PUT /user-providers/settings`) cuando no usa solo tenant.
3. STT / Falkor: igual que antes según runtime resuelto.

## Env servidor (no claves LLM)

```env
TOKEN_MASTER_KEYS={"1":"<32-bytes-base64>"}
TOKEN_ACTIVE_KEY_VERSION=1
LLM_MAX_TOKENS=120000
# Opcionales — defaults cuando el usuario omite valor en BYOK:
STT_MODEL=whisper-1
EMBEDDING_DIM=1536
```

## Migraciones

- `20260519120000_user_provider_byok` — tablas base BYOK
- `20260519130000_user_provider_stt_embeddings` — `embeddingProvider`, `chatModelFallbacks`, `embeddingDimension`, `sttModel`
- `20260519140000_super_admin_provider_instances` — `ProviderInstance`, `activeTenantInstanceId`, rol `super_admin`, migración de `UserProviderConfig` → instancias legacy

## Rotación de clave maestra

1. Generar nueva versión: `openssl rand -base64 32`.
2. Añadir al JSON **sin quitar** versiones usadas en BD (p. ej. `{"1":"...","2":"..."}`).
3. `TOKEN_ACTIVE_KEY_VERSION=2` (o la versión nueva) y redeploy.
4. `npm run rotate-master-key` (migran `user_provider_configs` y `provider_instances`).
5. Tras verificar la UI, opcionalmente quitar versiones obsoletas del env.

Guía detallada (escenarios, coexistencia v2+v3, Dokploy): [README.md](./README.md#cifrado-de-tokens-byok-claves-maestras).

## Cloudflare Workers AI (`cloudflare`)

- API **OpenAI-compatible** en `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/v1` (chat + embeddings).
- BYOK: **API token** (Bearer) + **Account ID** obligatorio en `extras.accountId` (o inferido de `baseUrl` guardada).
- Modelos chat por defecto: `@cf/meta/llama-3.1-8b-instruct`; embeddings: `@cf/baai/bge-base-en-v1.5` (768 dims).
- `baseUrlEditable: true` — si el usuario no pasa `baseUrl`, se construye desde `accountId`.
- Headers opcionales en `extras.headers` (objeto o JSON string) para metadatos AI Gateway.
- **STT:** Workers AI tiene Whisper vía API nativa, pero el endpoint OpenAI-compatible **no** expone `/v1/audio/transcriptions` → `supportsStt: false` en catálogo.

## Groq (`groq`)

- API **OpenAI-compatible** en `https://api.groq.com/openai/v1` (chat + transcripción).
- BYOK: **API key** Bearer desde [console.groq.com/keys](https://console.groq.com/keys).
- Modelos chat por defecto: `llama-3.3-70b-versatile`; sugeridos en catálogo: `llama-3.1-8b-instant`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, etc.
- **STT:** `whisper-large-v3` vía `/v1/audio/transcriptions` → `supportsStt: true`.
- **Embeddings:** Groq **no** expone endpoint de embeddings en su API pública OpenAI-compatible → `supportsEmbeddings: false`. Si Groq es el proveedor activo, fija `embeddingProvider` a openai/openrouter/gemini/cloudflare configurado (igual que con Anthropic).

## Limitaciones conocidas

- **STT:** solo proveedores con `supportsStt` (openrouter, openai, groq). Gemini/Anthropic/Cloudflare no exponen STT vía el adaptador OpenAI-compatible actual.
- **Embeddings con Anthropic o Groq activo:** requiere `embeddingProvider` en ajustes apuntando a openai/openrouter/gemini/cloudflare configurado.
- **Falkor multi-dimensión:** un mismo grafo puede indexar vectores de distintas dimensiones; mezclar dimensiones en el mismo nodo rompe la búsqueda vectorial — conviene dimensión estable por despliegue/usuario.
- **Gemini STT:** no soportado en catálogo actual.
