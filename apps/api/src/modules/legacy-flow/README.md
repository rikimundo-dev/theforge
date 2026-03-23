# Módulo Legacy Flow

Flujo separado para **proyectos legacy** (documentados en TheForge): modificaciones sin Paso 0, con coordinador, revisor y cascada de entregables.

## Endpoints

- `POST /projects/:projectId/legacy/generate-codebase-doc` — Genera documentación de partida del codebase vía MCP (opcional, ideal como primer paso). Persiste en `legacyFlowState.codebaseDoc`. Devuelve `{ codebaseDoc }` o `null` si TheForge no está configurado.
- `POST /projects/:projectId/legacy/start` — body `{ description: string }`. Llama a TheForge **`get_modification_plan`** (SPEC-MCP-001); si no está disponible, fallback a `ask_codebase`. Devuelve `{ filesToModify, questions }` y persiste en `legacyFlowState`.
- `POST /projects/:projectId/legacy/answer` — body `{ answers: Record<string, string> }`. Guarda respuestas del usuario.
- `POST /projects/:projectId/legacy/generate-mdd` — Genera el MDD de cambio (coordinador + revisor) y persiste en `mddContent`. Usa varias consultas a TheForge (qué existe, arquitectura, reglas) y exige al LLM inferir impacto completo en módulos/entidades/UI, no solo el requerimiento literal.
- `POST /projects/:projectId/legacy/generate-deliverables` — Despacho dinámico según `Project.complexity`: solo los pasos en `DELIVERABLES_BY_COMPLEXITY` (`@theforge/shared-types`), con contexto TheForge inyectado por paso. Si hay `complexityPending` sin confirmar, 400 (igual que proyectos nuevos).

## Servicios

- **LegacyCoordinatorService:** Orquesta start (TheForge), answer, generateMdd, generateDeliverables. Usa knowledge pack y AiService para generación. En legacy, **prioriza TheForge**: genera codebase doc con ask_codebase + semantic_search; genera MDD con ask_codebase, semantic_search, validate_before_edit, get_definitions, get_functions_in_file, get_file_content; genera entregables con getContextForDeliverables (ask_codebase + semantic_search). Contexto inyectado en cada paso vía `theforgeContext`. **Regla aplicada a todos los entregables:** no inventar; apegarse al MDD y al conocimiento TheForge.
- **LegacyReviewerService:** Revisa lista archivos/preguntas y borrador MDD antes de devolver al usuario.

## Conocimiento

Carpeta `knowledge/`: contenido derivado de los 3 cuadernos NotebookLM (Arquitectura de Prompts, Specification-Driven Development, Architecting Agentic Systems). Se carga en runtime con `loadLegacyKnowledgePack()` e se inyecta en los prompts del coordinador y revisor.

## Dependencias

- TheForgeService (getModificationPlan preferido para start; askCodebase para contexto MDD y sugerencias de respuestas).
- AiService (generateSpec, generateArchitecture, etc., como librería).
- PrismaService (Project.legacyFlowState, mddContent, entregables).

La API pública (coordinador, revisor, controlador, knowledge-loader) está documentada con **JSDoc en español** (`@param`, `@returns`).

Ver plan histórico en `docs/archive/PLAN-FLUJO-LEGACY-V2.md`.

## Contrato con TheForge (SPEC-MCP-001)

- **Primario:** Se llama **`get_modification_plan(userDescription, projectId)`**. Respuesta: `{ filesToModify: string[], questionsToRefine: string[] }`. Garantías del MCP: `filesToModify` = solo rutas de nodos File del proyecto en FalkorDB (verificadas); `questionsToRefine` = solo preguntas de negocio/funcionalidad (no "¿hay otros componentes?").
- **Fallback:** Si el MCP no expone `get_modification_plan`, se usa `ask_codebase` con un prompt que pide el mismo JSON; se filtran preguntas tipo "otros componentes".
- **Sugerencias de respuestas:** Tras obtener las preguntas, se llama `ask_codebase` para rellenar sugerencias desde el codebase.
