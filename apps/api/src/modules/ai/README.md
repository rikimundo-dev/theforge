# Módulo AI — LLM, prompts y contexto

- **`config/llm-config.ts`** — Proveedor activo (`AI_PROVIDER`), runtime unificado para chat, embeddings opcionales (`LLM_EMBEDDINGS_PROVIDER`) y `getLlmProvidersSnapshot()` (qué IDs tienen clave sin exponer secretos). Kimi = OpenAI-compatible con defaults Moonshot.
- **`embeddings/gemini-text-embedding.ts`** — `gemini-embedding-001` compartido por adapters que delegan en Gemini.
- **`ai.factory.ts`** — `google` → `GeminiAdapter`; `openai` / `kimi` → `OpenAIAdapter`.
- **`ai.service.ts`** — `generateResponse` / `generateResponseStream`, ensambla system prompt (MDD, Blueprint, tab activo, etc.) y **`appendUxGuideStitchPolicy`** (Google Stitch solo proyectos **NEW** y tab **ux-ui-guide**; **LEGACY** prohíbe Stitch).
- **`ux-guide-llm-context.ts`** — `uxGuideLlmOptions(project)`: `projectTypeForUxGuide` + recortes de Spec, casos de uso, historias, flujos, arquitectura, API, DBGA, fase 0 para enriquecer la guía y el prompt Stitch del **producto**.
- **`prompts/`** — Markdown cargados en runtime; ver [prompts/README.md](prompts/README.md).
