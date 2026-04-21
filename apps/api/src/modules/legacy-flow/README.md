# Módulo Legacy Flow

Flujo separado para **proyectos legacy** (documentados en TheForge): modificaciones sin Paso 0, con coordinador, revisor y cascada de entregables.

## Endpoints

- `POST /projects/:projectId/legacy/generate-codebase-doc` — Genera documentación de partida del codebase vía MCP (opcional, ideal como primer paso). Persiste en `legacyFlowState.codebaseDoc`. Devuelve `{ codebaseDoc }` o `null` si TheForge no está configurado.
- `PATCH /projects/:projectId/legacy/codebase-doc` — body `{ codebaseDoc?: string }`. Actualiza la documentación de partida (edición manual). Devuelve `{ codebaseDoc }`.
- `POST /projects/:projectId/legacy/start` — body `{ description: string }`. Llama a TheForge **`get_modification_plan`** (SPEC-MCP-001); si no está disponible, fallback a `ask_codebase`. Devuelve `{ filesToModify, questions }` y persiste en `legacyFlowState`.
- `POST /projects/:projectId/legacy/answer` — body `{ answers: Record<string, string> }`. Guarda respuestas del usuario.
- `POST /projects/:projectId/legacy/generate-mdd` — Genera el MDD de cambio (coordinador + revisor) y persiste en `mddContent`. Usa varias consultas a TheForge (qué existe, arquitectura, reglas) y exige al LLM inferir impacto completo en módulos/entidades/UI, no solo el requerimiento literal.
- `POST /projects/:projectId/legacy/generate-deliverables` — Despacho dinámico según `Project.complexity`: solo los pasos en `DELIVERABLES_BY_COMPLEXITY`, con contexto TheForge inyectado. **Fuente:** `mddContent` (MDD de cambio) o, si está vacío, `legacyFlowState.codebaseDoc` (MDD Inicial → ingeniería inversa). Si hay `complexityPending` sin confirmar, 400.
- `POST /projects/:projectId/legacy/resolve-index-sdd-conflict` — body `{ choice: "trust_index" | "trust_sdd" | "proceed_with_warnings" }`. Tras un **409** `LEGACY_INDEX_SDD_MISMATCH`, el usuario confirma cómo proceder; se persiste en `legacyFlowState.legacyIndexSddResolution` y se desbloquean `generate-codebase-doc`, `generate-mdd` y `generate-deliverables`.

## Alineación índice Ariadne ↔ grafo SDD (FalkorDB)

Antes de llamar a la IA en documentación/MDD/entregables legacy, el coordinador **consulta FalkorDB** (`GraphMemoryService.getSddStageSnapshot`: `DB_Entity`, `API_Endpoint` de la etapa principal) y lo cruza con señales del índice MCP (`gatherLegacyIndexSignals`: `semantic_search` + rutas, sin LLM).

- **Índice vacío + SDD “rico”** (varias entidades o endpoints en Falkor): **409** — el código indexado no aporta evidencia pero el SDD asimilado sí; riesgo de UUID/repo desalineado.
- **Solapamiento bajo** entre nombres de entidades/rutas del SDD y el texto del índice: **409** — discrepancia grave entre diseño en grafo y lo que refleja Ariadne.

Desactivar el guardarraíl: `LEGACY_SDD_INDEX_GATE=0`. Umbrales: `LEGACY_SDD_INDEX_MIN_OVERLAP_RATIO` (default 0.28), `LEGACY_SDD_RICH_MIN_ENTITIES`, `LEGACY_SDD_RICH_MIN_ENDPOINTS`, `LEGACY_SDD_MIN_ARTIFACTS_FOR_OVERLAP` — ver `legacy-index-sdd-alignment.util.ts`.

## Servicios

- **LegacyCoordinatorService:** Orquesta start (TheForge), answer, generateMdd, generateDeliverables. Usa knowledge pack y AiService para generación. Inyecta **GraphMemoryService** para el gate índice/SDD (Falkor) y **AgentSupervisorService** para resolver `theforgeProjectId` de etapa en el descubrimiento escalonado. Con **evidencia-primero** activo (`LEGACY_EVIDENCE_FIRST_CONTEXT`, default `true`), `generate-codebase-doc` y el bloque de contexto en `generate-mdd` usan **descubrimiento escalonado** (Plan-and-Execute): LLM (`createDbgaLLM`) + herramientas TheForge `ask_codebase`, `semantic_search`, `get_file_content` según `prompts/staged-discovery-mdd-prompt.md`. Antes de la primera ronda ReAct, `runLegacyStagedDiscoveryMddAgent` inyecta en el system prompt el catálogo **`list_known_projects`** (`staged-discovery-catalog.util.ts` → placeholder `{{ariadneRepositoriesCatalog}}`) para que el agente **Fase 0** fije repos, ramas y **roles** antes de búsquedas masivas. El prompt se **hidrata** con `hydrateStagedDiscoveryMddPrompt` (`{{theforgeProjectId}}` + catálogo). Las herramientas LangChain exigen `projectId` en el esquema (valor literal al UUID resuelto); la ejecución sigue usando ese id para las llamadas MCP. Rondas máx. de tool-calling: `LEGACY_STAGED_DISCOVERY_MAX_TOOL_ROUNDS` (default 18); salida máx.: `LEGACY_STAGED_DISCOVERY_OUTPUT_MAX_CHARS` (default 96000). Si falla o queda vacío, **fallback** a modo clásico en `generate-codebase-doc`: **cuatro** `ask_codebase` por defecto **en serie** para no saturar ingest/MCP (`LEGACY_CODEBASE_DOC_PARALLEL_ASK=1` restaura paralelo). El agente ReAct de descubrimiento no puede forzar `semantic_search` con `limit` demasiado bajo: suelo `LEGACY_STAGED_DISCOVERY_SEMANTIC_FLOOR` (ver `ARIADNE-CONSULTA-DESDE-THEFORGE.md`). Si las cuatro siguen vacías, una **síntesis única** en español. Si §1–4 y esa síntesis quedan vacías pero el `semantic_search` sí devolvió texto, el documento se antepone un **aviso en markdown** (timeout MCP / `THEFORGE_MCP_TIMEOUT_MS`) para que no parezca un “resumen deliberado”. El recorte del bloque §5 usa `LEGACY_CODEBASE_DOC_SEMANTIC_MAX_CHARS` (default 48k), no el recorte genérico de otros flujos. Los bloques de `semantic_search` pasan un filtro que omite líneas tipo `GEMINI.md` (ruido de instrucciones, no código). La **puerta índice↔SDD** sigue usando `gatherLegacyIndexSignals` (sin LLM) — no se mezcla con el agente. `getContextForDeliverables` en TheForgeService puede seguir usando `buildLegacyEvidenceMarkdown` (pipeline monolítico). Límite de contexto en prompts del MDD de cambio: `LEGACY_MDD_THEFORGE_CONTEXT_MAX_CHARS` (default 24000). Ver `../theforge/README.md` y `.env.example`.
- **LegacyReviewerService:** Revisa lista archivos/preguntas y borrador MDD. Si el MDD casi no cita rutas (menos de 3 referencias tipo `archivo.ts`), antepone aviso SDD al prompt de revisión.

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
- **Fallback:** Si el MCP no expone `get_modification_plan`, se usa `ask_codebase` con un prompt que pide el mismo JSON; se filtran preguntas tipo "otros componentes". Los `filesToModify` usan `getDefaultRepoIdForStoredProject` como **`repoId`** (primer root del workspace en catálogo), no el UUID del proyecto workspace crudo.
- **`generate-mdd`:** `validate_before_edit` / `get_definitions` usan un nombre de nodo inferido desde `get_functions_in_file` (`legacy-graph-node-name.util.ts`), no solo el stem del path.
- **`ask_codebase` en legacy:** Por defecto `raw_evidence` + `deterministicRetriever` + `twoPhase` (`getLegacyAskCodebaseOptions` / default en `TheForgeService.askCodebase`); prosa clásica sin flags: `LEGACY_ASK_CODEBASE_EVIDENCE_FIRST=0`.
- **Sugerencias de respuestas:** Tras obtener las preguntas, se llama `ask_codebase` para rellenar sugerencias desde el codebase.
