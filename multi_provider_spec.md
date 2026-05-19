# The Forge - Arquitectura Multi-Proveedor (BYOK)

Cada usuario configura sus proveedores de IA en la UI. **No hay fallback a claves LLM en variables de entorno** (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, etc.).

## Componentes

| Pieza | Ubicación |
|-------|-----------|
| Catálogo | `apps/api/src/modules/ai/providers/provider-catalog.ts` — modelos por defecto, `supportsStt` / `supportsEmbeddings`, dimensiones de embedding |
| Cifrado | `apps/api/src/modules/crypto/` — `TOKEN_MASTER_KEYS`, `TOKEN_ACTIVE_KEY_VERSION` en env |
| Persistencia | `UserAISettings` (activeProvider, embeddingProvider, embeddingsEnabled), `UserProviderConfig` (token cifrado, chatModel, chatModelFallbacks, embeddingModel, embeddingDimension, sttModel, baseUrl, extras) |
| API | `GET/PUT /user-providers/*` — `UserProvidersModule` |
| Factory | `AIFactory.createForUser`, `createEmbeddingForUser`, `resolveSttRuntime` |
| LangGraph | `createDbgaLLM` — openrouter, openai, anthropic, gemini, cloudflare, groq |
| Contexto HTTP | `getRequestUserId()` — `request-user.store.ts` |

## Flujo

1. Usuario guarda clave API por proveedor (`PUT /user-providers/configs/:provider`) con modelos opcionales (`sttModel`, `embeddingDimension`, `chatModelFallbacks`).
2. Usuario elige proveedor activo (`PUT /user-providers/settings`). Si el activo no tiene embeddings (anthropic), puede fijar `embeddingProvider` a otro proveedor configurado.
3. Servicios llaman `await aiFactory.createForUser(getRequestUserId())` (o `userId` del job BullMQ vía `runWithRequestUserAsync`).
4. LangGraph DBGA/MDD usa `createDbgaLLM(aiFactory, userId)` con el proveedor activo del usuario.
5. STT: `GET /audio/config` y `POST /audio/transcribe` usan `sttModel` del proveedor activo (fallback servidor `STT_MODEL` solo si el usuario no define modelo).
6. Falkor: índices vectoriales por dimensión bajo demanda según `embeddingDimension` / catálogo del runtime de embeddings del usuario.

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

## Rotación de clave maestra

```bash
npx tsx scripts/rotate-master-key.ts
```

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
