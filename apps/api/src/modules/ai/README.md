# Módulo AI — LLM, prompts y contexto

- **`config/llm-config.ts`** — Runtime **OpenRouter** (chat + embeddings vía la misma API), `resolveChatModelChain()` / `hasChatModelFallback()`, `getLlmProvidersSnapshot()`. `LLM_EMBEDDINGS_PROVIDER=none` apaga embeddings.
- **`config/llm-model-fallback.ts`** — `runWithModelFallback`, `isModelExhaustionError` (402, quota, modelo no disponible, 429 opcional).
- **`adapters/openrouter.adapter.ts`** — `OpenRouterAdapter`: `chat.completions` y `embeddings` con SDK `openai` (base `OPENROUTER_BASE_URL`); cadena de modelos solo si hay `OPENROUTER_CHAT_MODEL_FALLBACK(S)`.
- **`ai.factory.ts`** — Devuelve siempre `OpenRouterAdapter`.
- **`ai.service.ts`** — `generateResponse` / `generateResponseStream`, ensambla system prompt (MDD, Blueprint, tab activo, etc.) y **`appendUxGuideStitchPolicy`** (Google Stitch solo proyectos **NEW** y tab **ux-ui-guide**; **LEGACY** prohíbe Stitch). Opción **`welcomeBrief`** (`GenerateResponseOptions`): system mínimo + sin pegar DBGA/MDD/Spec/etc. en system (p. ej. `generateWelcome`: el contexto va en el mensaje de usuario).
- **`ux-guide-llm-context.ts`** — `uxGuideLlmOptions(project)`: `projectTypeForUxGuide` + recortes de Spec, casos de uso, historias, flujos, arquitectura, API, DBGA, fase 0 para enriquecer la guía y el prompt Stitch del **producto**.
- **`prompts/`** — Markdown cargados en runtime; ver [prompts/README.md](prompts/README.md).
