# Changelog

Todas las notas relevantes de este repositorio se documentan aquí. El formato sigue una variante orientada a release técnico (Added / Changed / Fixed / Architecture).

## [0.10.0] — 2026-05-23

### Added

- **Fase 0 Interactiva — Entrevistador IA guiado:** Nuevo módulo dentro del pipeline de especificación que permite al usuario describir su idea (o pegar un documento externo) y recibir un borrador inicial de 8 secciones. Luego, el entrevistador hace **una pregunta a la vez** (máx 5) para llenar gaps críticos, actualizando el borrador en vivo tras cada respuesta. Al completarse, el documento se serializa a markdown y se inyecta como `dbgaContent` para que el pipeline MDD existente lo consuma automáticamente.
  - `ai-analysis/phase0/phase0.types.ts` — interfaces del documento (8 secciones: propósito, entidades, reglas, flujos, roles, integraciones, edge cases, pendientes)
  - `ai-analysis/phase0/phase0-gap-analyzer.ts` — 7 reglas lógicas de validación por criticidad (sin LLM, funciona como fallback)
  - `ai-analysis/phase0/phase0-to-markdown.ts` — serializa el JSON estructurado a markdown legible para el pipeline
  - `ai-analysis/phase0/phase0-interview.service.ts` — orquestador del loop: start → question → answer → finalize
  - 3 prompts en `prompts/phase0/`: arranque (idea/doc → borrador + gaps), question (una pregunta a la vez), update (respuesta → actualización)
  - 4 endpoints REST: `POST /ai-analysis/phase0/start`, `GET phase0/question/:threadId`, `POST phase0/answer`, `GET phase0/state/:threadId`
  - DB: 3 campos nuevos en `Project` (`phase0Status`, `phase0Gaps`, `phase0Questions`) + safe-schema-sync.sql
- **Frontend Phase0InterviewPanel:** Nuevo componente React con input inicial, indicador de progreso (5 dots), una pregunta a la vez con respuesta inline, borrador visible toggle, y estados idle/starting/interviewing/done/error. Integrado en la pestaña Fase 0 del Workshop.

### Changed

- **WorkshopView:** La pestaña Fase 0 ahora muestra el entrevistador interactivo cuando no hay `dbgaContent`, y el flujo legacy (DBGA) cuando ya existe contenido. La integración es transparente: al completar la entrevista, se genera `dbgaContent` y el panel legacy se muestra automáticamente.
- **load-prompts.ts:** Registro de `PHASE0_ARRANQUE_PROMPT`, `PHASE0_QUESTION_PROMPT`, `PHASE0_UPDATE_PROMPT` en el loader central.
- **AiAnalysisController / Module:** Import, provider, export e inyección de `Phase0InterviewService`.
- **BUILD_CACHE_BUST**: 80 → 81

## [0.10.1] — 2026-05-23

### Fixed

- **Phase0 build fix:** Eliminado import no usado de `Phase0QA` en `phase0-interview.service.ts` que rompía el build estricto de TypeScript en Docker.

### Changed

- **BUILD_CACHE_BUST**: 81 → 82

## [0.10.2] — 2026-05-23

### Fixed

- **Prompts Fase 0 contaminados con tecnología:** Los 3 prompts (arranque, question, update) no limitaban a análisis de dominio de negocio. El LLM respondía con decisiones técnicas (AriadneSpecs, PostgreSQL, FalkorDB, BullMQ, etc.) que corresponden al MDD, no a Fase 0. Se agregaron guardrails explícitos: instrucciones de QUÉ no incluir y conversión de lenguaje técnico a concepto de negocio.

### Changed

- **BUILD_CACHE_BUST**: 82 → 83

## [0.10.3] — 2026-05-23

### Fixed

- **MCP Server crash al inicio:** El Dockerfile del MCP copiaba `package.json` del mcp-server a la raíz (`./`) en vez de a su ruta correcta (`./packages/mcp-server/`), lo que rompía la resolución del workspace `@theforge/shared-types` desde node_modules hoisted.

### Changed

- **BUILD_CACHE_BUST**: 83 → 84

---


---

## [0.9.2] — 2026-05-22

### Fixed

- **Diagramas Mermaid con errores de sintaxis en el MDD:** El pipeline de normalización interna (`sanitizeMermaidBlock`) solo corregía espacios unicode y comas `PK, FK`, pero no los errores estructurales más comunes que el LLM genera: IDs con espacios, bloques alt/opt/loop sin cerrar, subgraphs sin `end`, quotes inconsistentes, etc. Estos sí los corrige la herramienta experta `normalizeMermaid` de `@theforge/shared-types/mermaid`, pero no estaba integrada en el pipeline de persistencia.
  - `sanitizeMermaidBlock` ahora llama a `normalizeMermaid` después de sus correcciones básicas — corrige IDs, cierra bloques, normaliza quotes automáticamente
  - `validateMermaidSyntax` ahora también ejecuta `validateMermaid` (experta) además del chequeo de `PK, FK`
  - Corre en cada `PATCH /projects/:id` via `mddUpdatePipeline.process()` antes de persistir
- **`validateMermaid` de shared-types no reconocía `flowchart`:** La regex de detección de tipo solo incluía `graph`, no `flowchart`. También se pasaba el contenido con fences a `validateMermaid`, que espera el contenido crudo. Se usa `require()` dinámico para evitar errores de moduleResolution en build.
- **Frontend no normalizaba diagramas viejos con la experta al renderizar:** El backend ya aplica `normalizeMermaid` de shared-types al persistir (PATCH), pero diagramas guardados antes del fix quedan con errores en DB. El frontend solo aplicaba normalización básica (unicode spaces, indent, keyword casing) sin usar la experta. Se importa `normalizeMermaid` de `@theforge/shared-types/mermaid` y se aplica como pre-paso en ambos paths de render (useEffect y ReactMarkdown custom renderer), cubriendo todos los tipos de diagrama (graph, flowchart, sequenceDiagram, erDiagram, etc.).

### Changed

- **BUILD_CACHE_BUST**: 79 → 80

---

## [0.9.1] — 2026-05-22

### Fixed

- **§6 Seguridad no se generaba con DeepSeek/Claude:** `stripThinkingTags()` solo limpiaba tags HTML-style (``), ignorando los formatos nativos de DeepSeek (`` ```think``` ``) y Claude. El texto con razonamiento llegaba a `isCorruptedSecurityLlmText()` que lo descartaba como corrupto, eliminando toda la sección 6.
  - `stripThinkingTags` ahora también remueve fenced code blocks con "think/thought/reasoning"
  - Patrón `"6\.\s*Seguridad"\s*:` removido de `CORRUPTED_SECURITY_TEXT_PATTERNS` — matcheaba falsos positivos dentro de valores JSON válidos
  - `parseSecurityLlmResponse` ahora prueba legacy JSON (`{ securitySection }`) antes del chequeo de corrupción, alineado con el formato del prompt default
- **Prompts MDD con supresión de razonamiento explícito:** Software Architect, Security, Integration y MDD Auditor ahora incluyen "NO uses tags de razonamiento ni pienses en voz alta. Devuelve ÚNICAMENTE el JSON." para prevenir thinking output desde la fuente.
- **`prepareMddForOutput` pierde §6 al reconstruir desde structured:** Nueva guarda en `shouldPreferDraftOverStructured`: si el draft tiene contenido real en §6 (>15 chars, no "Pendiente") pero el structured solo tiene placeholder, se preserva el draft.

### Changed

- **BUILD_CACHE_BUST**: 75 → 76

---

## [0.9.0] — 2026-05-22

### Added

- **Enriquecimiento semántico UI/UX en MDD:** Nueva sección `## UI/UX Design Intent` añadida automáticamente al final del MDD. Clasifica cada entidad del modelo de datos (`CREATE TABLE` de §3) como `WorkflowProcess`, `DataRegistry` o `Configuration`; infiere lifecycle states con colores sugeridos; asigna `component_type` semántico (KanbanBoard, DataTable, PropertyGrid, etc.) y mapea props del modelo a props del componente. Implementado en `utils/mdd-enrich-uiux-intent.ts`; integrado en `prepareMddForOutput()` (chokepoint único de salida MDD). No altera contenido previo.
- **Sección 8: UI Design System & Component Mapping en Blueprint:** Nueva sección anexada automáticamente al final del Blueprint. Clasifica las entidades del MDD §3 (`WorkflowProcess`, `DataRegistry`, `Configuration`), asigna componentes recomendados (KanbanBoard, DataTable, PropertyGrid), y especifica reglas de renderizado (prioridad de componente, estándar de formularios React Hook Form + Zod, responsive MobileStackView, validación de contrato previa). Implementado en `engine/blueprint-enrich-ui-system.ts`; integrado en `generateBlueprint()`. No altera secciones previas del Blueprint.

### Changed

- **BUILD_CACHE_BUST**: 74 → 75

---

## [0.8.1] — 2026-05-21

### Added

- **Validación de idea DBGA insuficiente:** `streamAnalysis` rechaza saludos o textos demasiado cortos antes de invocar el grafo LangGraph, emitiendo un evento NDJSON `error` con código `INSUFFICIENT_IDEA` y mensaje en español orientado al Benchmark.
- **Util `dbga-idea-validation`:** Heurística de saludos (normalización NFD, sin acentos) y umbral de longitud mínima; tests unitarios dedicados.

### Fixed

- **Nodo Scout (DBGA):** Si el modelo responde en prosa en lugar de JSON (p. ej. ante un saludo), el parseo ya no aborta todo el stream: se reutiliza `parseJsonOrThrow` compartido y se continúa con lista vacía de competidores.
- **Errores de stream DBGA:** `formatDbgaStreamError` traduce `SyntaxError` por JSON inválido (token inesperado) a mensaje amigable en español, sin exponer detalles del motor de parseo al cliente.

---

## [0.8.0] — 2026-05-20

### Added

- **Arquitectura multi-proveedor BYOK + tenant:** Cada usuario resuelve runtime IA con prioridad **instancia tenant** (`ProviderInstance`) y respaldo **BYOK personal** (`UserProviderConfig`). Sin fallback a claves LLM en variables de entorno (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, etc.). Documentación: `multi_provider_spec.md`.
- **Rol `super_admin`:** CRUD de instancias tenant, promoción de otros super admins, bypass de whitelist de modelos en instancias. Primer usuario (`POST /auth/register-first-admin`) → `super_admin`. Migración: usuario más antiguo por `createdAt` si no existía ningún `super_admin`.
- **Cifrado de tokens BYOK:** Módulo `crypto/` con `TOKEN_MASTER_KEYS` y `TOKEN_ACTIVE_KEY_VERSION`. Script `scripts/rotate-master-key.ts` y `npm run rotate-master-key` (incluye `provider_instances`). Guía en README § Cifrado de tokens BYOK; script empaquetado en imagen API.
- **Catálogo de proveedores:** `provider-catalog.ts` — OpenRouter, OpenAI, Anthropic, Gemini, **Cloudflare Workers AI** y **Groq** (chat, embeddings y/o STT según capacidades del proveedor).
- **`AIFactory` + adaptadores OpenAI-compatible:** Resolución tenant-first vía `UserProvidersService.resolveRuntime`; jobs BullMQ propagan `userId` con `runWithRequestUserAsync`.
- **API tenant:** `GET/POST/PUT/DELETE /provider-instances` (super_admin), `GET /provider-instances/enabled` (usuarios con instancias habilitadas).
- **API usuario:** `GET/PUT /user-providers/*` — configuración BYOK personal, ajustes activos (`activeProvider`, `activeTenantInstanceId`, `embeddingProvider`), catálogo de modelos y fallbacks.
- **Visibilidad de proyectos:** Enum `Visibility` (`PRIVATE` | `SHARED`). `PRIVATE`: solo owner; `SHARED`: accesible a usuarios autenticados del tenant. Campo en Prisma, DTO y listado/filtrado en `projects.service.ts`.
- **UI de ajustes (`#/settings`):** `ProviderInstancesCard`, `AIProvidersCard`, modales `UserProviderConfigModal` / `ProviderInstanceConfigModal`, formularios compartidos y diálogo `ModelsUnavailableDialog` cuando no hay modelos configurados.
- **Filtro de errores LLM:** `ModelsUnavailableExceptionFilter` — respuestas HTTP coherentes cuando el runtime no tiene proveedor usable o modelos disponibles (chat, MDD, DBGA, entregables).

### Changed

- **Pipeline IA (MDD, DBGA, entregables, chat, audio STT, embeddings/Falkor):** Todas las llamadas LLM usan runtime BYOK del usuario autenticado (o `job.data.userId` en cola).
- **`docker-compose` / `.env.example`:** Eliminadas variables de claves LLM en servidor; obligatorias `TOKEN_MASTER_KEYS` + `TOKEN_ACTIVE_KEY_VERSION`. Opcionales de servidor: `LLM_MAX_TOKENS`, `STT_MODEL`, `EMBEDDING_DIM` como defaults cuando el usuario omite valor en BYOK.
- **`BOOTSTRAP_ADMIN_EMAILS`:** Solo promueve a `admin` (nunca `super_admin`).
- **Setup / Login:** Primer admin con `super_admin` y `mcpSecret` autogenerado; `UsersList` permite asignar `super_admin` solo si el usuario actual lo es.
- **Workshop:** Integración de selección de instancia tenant / proveedor personal en el store y vistas.

### Fixed

- **Asignación de `super_admin`:** Lógica de bootstrap y creación de usuarios aclarada — `BOOTSTRAP_ADMIN_EMAILS` no eleva a super admin; rol reservado al primer registro o migración explícita.

### Impacto arquitectónico

- **Nuevo eje de configuración IA:** De “clave global en env” a “tenant instance → BYOK personal → error explícito”. `EngineModule` / LangGraph / `ProjectsService` dependen de `UserProvidersModule`.
- **Seguridad:** Tokens API nunca en texto plano en BD; solo `tokenCiphertext` + versión de clave. Rotación sin re-ingestar proyectos.
- **Despliegue:** Requiere migraciones `20260519120000`–`20260519140000` y definir `TOKEN_MASTER_KEYS` antes de arrancar el API en producción.

---

## [0.7.3] — 2026-05-20

### Added

- **Corazón de favoritos en proyectos:** Cada proyecto en el listado ahora muestra un ❤️ que permite marcarlo como favorito con toggle persistente en BD. Backend: `FavoriteProject` table (Prisma + migración), `POST /projects/:id/favorite`, `GET /projects/favorites`. Frontend: `isFavorite` desde API + `onToggleFavorite` en `ProjectFolderTile`.

### Changed

- **BUILD_CACHE_BUST**: 73 → 74

### Fixed

- **Blueprint pierde contenido al modificar por chat:** `mergeDocSectionOrUseFull()` tenía un fallback peligroso: si el LLM devolvía un fragmento ≥600 chars sin encabezado `## N.`, reemplazaba todo el documento. Ahora cualquier contenido sin encabezado numerado preserva el documento existente.

---

## [0.7.2] — 2026-05-21

### Fixed

- **Botón Reparar YAML en Guía UX/UI no mostraba loading:** `repairUxGuide` no establecía `uxGenerating`, por lo que no había spinner ni progreso visible. Ahora usa el mismo patrón que `generateUxGuideSequential`.
- **React error #310 al reparar YAML:** `repairUxGuide` llamaba `setUxUiGuideContent()` + `persistUxUiGuideContent()` causando doble re-render y colapso de hooks. Se eliminó la llamada directa al store — `persistUxUiGuideContent` maneja todo el estado en un solo re-render vía `persistField`.

### Changed

- **N/A**

---

## [0.7.1] — 2026-05-21

### Fixed

- **Cascada de documentos trabada en "Generando...":** El polling frontend consultaba `j.state` pero la API devuelve `j.status`. Nunca detectaba "completed" y el loop seguía hasta el deadline de 45 min.
- **Modificaciones al MDD vía chat no se aplicaban:** El LLM respondía solo con "MDD generado" sin incluir el documento actualizado con el delimitador `---FIN_MDD---`. Reforzada la instrucción en el system prompt del tab MDD para que SIEMPRE devuelva el MDD completo con los cambios.
- **Botón reparar YAML frontmatter de Guía UX/UI ahora usa LLM con contexto MDD:** Antes solo hacía regex sobre el body existente (fallaba si el formato no era limpio). Ahora llama al endpoint `POST /projects/:id/repair-ux-ui-guide` que genera el YAML de diseño desde el MDD, Blueprint y Spec.
- **Botón "Generar documentos" mostraba conteo incorrecto (125):** Cambiado de `cascadeProgress.length` (cuenta todos los ticks de polling) a `cascadeCompleted/cascadeTotal` (solo docs únicos completados).
- **Progreso sin visibilidad en el chat:** `agentProgress` ahora se muestra en el ChatContainer durante la cascada de entregables (`loadingReason === "deliverables-cascade"`).

### Changed

- **UX de progreso en cascada:** Ahora se inicializan los 11 documentos con `⚪ Nombre — Generando…` y al completarse cambian a `✅ Nombre — Terminado`. Se actualizan in-place en vez de acumular entradas duplicadas.

---

## [0.7.0] — 2026-05-19

### Added

- **Cascada de documentos en paralelo:** `generateDeliverablesCascade` reemplaza `for...of await` con `Promise.allSettled()`. Los 11 documentos (Blueprint, Spec, Arquitectura, etc.) se generan simultáneamente. HIGH: de ~5-22min a ~30s-2min. Cada documento es una llamada LLM independiente sin estado compartido — riesgo cero de `INVALID_CONCURRENT_GRAPH_UPDATE`.
- **Progreso visible en el chat:** `agentProgress` ahora acumula (append) cada documento completado con icono ✅. El botón muestra "Generando documentos (N)" con el conteo en vivo.

### Changed

- **`projects.service.ts`**: `completedCount` atómico en vez de array index para progreso real con paralelismo. Labels legibles para la UI (Blueprint, Spec, Arquitectura, etc.).
- **`workshopStore.ts`**: `generateDeliverablesCascade` usa `set((s) => ({ agentProgress: [...s.agentProgress, { agent, message }] }))` en vez de reemplazar.
- **`WorkshopView.tsx`**: Botón muestra "Generando documentos (N)" en vez de "Generando step (N/11)".

### Fixed

- **INVALID_CONCURRENT_GRAPH_UPDATE revertido (PR #175):** Security e Integration escriben ambos a `mddStructured` (canal `LastValue`). Revertidos a secuencial. CrossConsistency+DiagramInjector permanecen en paralelo porque escriben a canales distintos.
- **Docker build mcp-server (PR #171, #173, #174):** Contexto cambiado de subdirectorio a repo root para resolver workspaces npm. Agregados `@theforge/shared-types` y `@theforge/config` como dependencias. Producción copia `node_modules` raíz (npm hoist).

---

## [0.6.0] — 2026-05-19

### Added

- **NodeCacheService**: Cache en memoria por nodo LLM con TTL de 1 hora. Cada nodo del pipeline MDD (Clarifier, Software Architect, Security, Integration, LLM Formatter, Cross-Consistency) calcula un hash SHA-256 de sus campos de entrada y reusa el resultado si el input no cambió. En re-runs tras fallo, el ahorro es de ~70-85% del tiempo total del pipeline.
- **Paralelismo Security + Integration** (ambos grafos): Security (§6) e Integration (§7) corren en paralelo en el grafo `createMddGraph` (one-shot) y `createMddGraphWithManager` (Manager). Escriben keys distintas del estado (`mddStructured.seguridad` vs `mddStructured.integracion`). Ahorro ~15s.
- **Paralelismo Cross-Consistency + DiagramInjector** (grafo one-shot): CrossConsistency (read-only, produce `internalDirectives`) y DiagramInjector (code-only, inyecta diagramas) corren en paralelo tras LLMFormatter. Auditor espera a ambos mediante fan-in. Sin riesgo de precisión porque el Auditor usa shortcut code-only (99% casos) que no evalúa diagramas.

### Changed

- **`mdd-graph.ts`**: Los nodos LLM se envuelven con `wrapCache()` que checkea cache antes de ejecutar. Se añadió `routeAfterSecurity` → `format_after_redactor` (en vez de `integration`) para el caso default.
- **`ai-analysis.service.ts`**: Inyecta `NodeCacheService` y lo pasa a `createMddGraph` y `createMddGraphWithManager` via `MddGraphCompileOptions.nodeCache`.

---

## [0.5.0] — 2026-05-19

### Added

- **Cross-project table import (`get_project_tables` tool):** El Software Architect ahora puede importar tablas SQL de otro proyecto de TheForge durante la generación del MDD. Se invoca con `get_project_tables(projectId, tableNames?)`. Útil cuando un proyecto necesita tablas compartidas de un proyecto existente. Ver README sección "Cross-Project Table References".
- **MCP tool `get_project_tables`:** Nueva herramienta en el MCP server que expone la misma funcionalidad para acceso externo.
- **Detección de lenguaje natural para regenerar secciones:** El chat del MDD ahora reconoce frases como "regenera sección 2" sin necesidad del comando `/`.

### Fixed

- **Secciones §6-§7 preservadas al regenerar §2:** Doble capa: prompt + post-processing code para que el SA no reemplace Seguridad e Infraestructura con placeholders.
- **Líneas en blanco en tablas markdown:** Regla explícita en prompts para evitar renderizado roto.
- **Anti-Swagger/OpenAPI en §4:** Prohibición explícita con ejemplo concreto para evitar que el SA genere OpenAPI specs en vez de markdown plano.

### Changed

- **`tool-registry.ts`:** `getMddArchitectTools()` ahora retorna `[createGetProjectTablesTool()]` (antes array vacío).

---

## [0.4.0] — 2026-05-16

### Changed

- **BRD (greenfield y legacy):** El prompt de generación ahora exige que el BRD comience con la sección **«Pain Points & Problem Statement»**, incluyendo mapa de dolores (tabla), validación de demanda, perfil del cliente objetivo y consecuencias de no actuar. Los datos se extraen del DBGA o codebase doc; si falta evidencia se indica como «Por validar».
  - `apps/api/src/modules/projects/projects.service.ts` — prompt `DBGA_BRD_TOBE_SUGGEST_SYSTEM` + `brdPrompt` para greenfield
  - `apps/api/src/modules/legacy-flow/legacy-coordinator.service.ts` — prompts de BRD inicial y BRD de cambio para legacy

### Added

- **Sección Pain Points & Problem Statement en BRD:** Estructura estandarizada de 4 sub-secciones que obliga al LLM a documentar el problema de negocio antes de pasar a requisitos.
- **Botón «Reparar» en guía UX/UI:** Nuevo botón con icono Wrench en la toolbar del panel UX/UI Guide que toma el markdown existente (de IAs externas o copiado manualmente) y genera el YAML frontmatter estructurado para el preview visual de DesignMdPreview. Usa las funciones existentes `replaceYamlFrontMatter`, `extractDesignMdFrontMatter`, `fillDesignMdDefaults` y `tokensToYamlFrontMatter`.

---

## [0.3.0] — 2026-05-02

### Added

- **AEM (Análisis y Estrategia de Mercado)**: nueva pestaña en el Workshop con editor preview/source, auto-save al perder foco, y soporte en ZIP de descarga. Campo `aemContent` en Prisma + DTO + MCP tool `set_aem_content`.
- **Design token extraction**: reemplazado extractor LLM-based por tool MCP dedicado `extract_design_tokens` en AriadneSpecs (sin LLM, más rápido). Añadido método `extractDesignTokens()` en TheForgeService. Eliminado `design-token-extractor.ts`.

### Changed

- **Docs**: actualizados MCP server docs, CHANGELOG, README.

---

## [0.2.0] — 2026-05-02

### Added

- **BRD/To-Be/As-Is por Stage:** Campos `brdContent`, `toBeManualContent`, `asIsManualContent`, `brdApprovedAt`, `toBeApprovedAt` en Prisma `Stage`. Flujo greenfield: BRD → To-Be (gate opcional) → MDD. Flujo legacy: As-Is desde codebaseDoc → BRD/To-Be → MDD de cambio.
- **Gates BRD/To-Be:** `requireBrdTobeGate` por proyecto. Streams MDD emiten `blocked` si faltan aprobaciones. Preámbulo `composeBrdToBeAsIsPreamble` en síntesis MDD.
- **Etapas como cambios legacy:** Cada etapa de cambio es un `Stage` independiente con FalkorDB (`LegacyStage` nodos + `DERIVED_FROM` por ordinal). Dual-write legacy → stage para migración gradual.
- **Prompts incrementales en etapas legacy:** MDD de etapa base (hasta 30k chars) inyectado como contexto con instrucción "describe SOLO las modificaciones respecto a esta línea base".
- **BRD/To-Be legacy como reflejo del MDD inicial:** En Stage 1 se titulan "BRD (sistema actual)" y "Manual To-Be (sistema actual)".
- **Desambiguación en chat legacy:** Instrucción en prompt: "Si el usuario menciona un cambio o hay ambigüedad, preguntar si es consulta o cambio."
- **Botón "+ Nueva etapa de cambio":** En WorkshopView, modal con selección de etapa fuente para crear nuevas etapas legacy.
- **FalkorDB `syncLegacyStage` / `clearLegacyStage`:** Sincronización de nodos `:LegacyStage` con relaciones `DERIVED_FROM` y `HAS_LEGACY_STAGE`.
- **Schema `copyLegacyChangeFromStageId`:** En `createStageBodySchema` para copiar estado legacy entre etapas.
- **Variables de entorno:** Documentación completa de todas las variables `LEGACY_*`, `THEFORGE_CONTEXT_*`, `MCP_*`, `FALKORDB_*`, `PRISMA_*` y operacionales en `README.md` y `.env.example`.

### Changed

- **`LegacyCoordinatorService`:** Migración completa de métodos → `getLegacyChangeState()` + `persistLegacyChangeState()` con dual-write y fallback a `project.legacyFlowState`.
- **`createStage` en `proyectos.service.ts`:** Búsqueda de `parentStageId` por ordinal para FalkorDB `DERIVED_FROM`.
- **`WorkshopView.tsx` y `workshopStore.ts`:** ~30 referencias migradas de `project.legacyFlowState` → `activeLegacyState`.
- **Controller legacy:** Endpoints aceptan `stageId` opcional para operaciones multi-etapa.
- **Documentación:** `blueprint.md`, `mdd.md`, `PROJECT_BRAIN_DUMP.md` actualizados a v2.0 reflejando el estado actual del proyecto.

### Fixed

- **Error de build en Dokploy:** `@theforge/web#build` fallaba por `brdGateBlocked` declarada pero no usada en `WorkshopView.tsx`. Eliminadas IIFEs muertas. Commit `0a8c600`.
- **Legacy:** BRD/To-Be en Stage 1 ahora reflejan el MDD inicial como sistema actual, no como documento de cambio.

### Impacto arquitectónico

- **Nuevo eje en Pipeline MDD:** BRD/To-Be como precursores opcionales antes del MDD técnico. Gates que bloquean pasos LLM y emiten eventos `blocked`.
- **Grafo de etapas:** FalkorDB ahora modela relaciones `DERIVED_FROM` entre etapas legacy por ordinal, permitiendo trazabilidad completa de cambios.
- **Dual-write:** `legacyFlowState` en `legacyCoordinator` se escribe tanto en `project.legacyFlowState` como en `stage.legacyChangeState` durante migración.

---

## [0.1.0] — 2026-03-27

### Added

- **`@theforge/business-rules`**: paquete compartido con estimación de costo (MXN), parsing de horas fijas de infra, estructura de equipo por defecto y constantes alineadas con negocio. Fuente única de verdad para API y Workshop web.
- **Grafo SDD (FalkorDB) — lectura y salud** (`GraphMemoryService`):
  - `getSddStageSnapshot`: entidades y endpoints ingeridos por `projectId` + `stageId`.
  - `evaluateSddDependencyHealth`: coherencia `API_Endpoint -[:CONSUMES]-> DB_Entity` (conteo de huérfanos y bandera `isCoherent`).
- **Pipeline MDD** (`MddUpdatePipelineService`): con `graphScope` en complejidad **HIGH**, re-ingiere MDD al grafo y pasa `sddDomainGraphOk` al semáforo para **relajar** el camino documental estricto (edge_cases / field_types) cuando el grafo es coherente.
- **Legacy — puerta índice vs SDD**: `assertLegacyIndexSddGate` cruza índice Ariadne (MCP) con snapshot Falkor; discrepancia grave → `409` con código `LEGACY_INDEX_SDD_MISMATCH` y payload `gate`; resolución explícita en `legacyFlowState.legacyIndexSddResolution` (`trust_index` | `trust_sdd` | `proceed_with_warnings`). Feature flag `LEGACY_SDD_INDEX_GATE` (default activo).
- **Util `legacy-index-sdd-alignment.util.ts`**: heurísticas de solapamiento y umbrales tunables vía env (`LEGACY_SDD_*`).
- **Puertos de orquestación**: `PROJECTS_ORCHESTRATOR_PORT`, `THEFORGE_ORCHESTRATOR_PORT` con implementación `useExisting` sobre servicios concretos; tests de DI (`ai-orchestrator.di.spec.ts`, `semaphore.service.spec.ts`, specs de alineación legacy).
- **`gatherLegacyIndexSignals`** y **`legacyIndexHasUsableGraphEvidence`** en `theforge-evidence-context.util.ts` para reutilizar recolección MCP sin duplicar lógica.
- **Módulo** `graph-memory.module.ts` y documentación README en submódulos (ai-analysis graph-memory, ai-orchestrator, business-rules).

### Changed

- **`CostCalculatorService`** y **`apps/web/src/utils/costCalculator.ts`**: delegan en `@theforge/business-rules` (sin duplicar multiplicadores, buffer ni tarifas).
- **`SemaphoreService` (HIGH)**: nuevo input opcional `sddDomainGraphOk`; si el MDD tiene lagunas documentales pero el grafo SDD es sano, puede alcanzar **VERDE** con `precisionScore` ajustado (92 vs 95).
- **`MddUpdatePipelineService.process`**: ahora **async** e inyecta `GraphMemoryService`; `EngineModule` importa `GraphMemoryModule`.
- **`LegacyCoordinatorService`**: inyección de `GraphMemoryService`; manejo de `ConflictException` para el gate índice/SDD.
- **`AiOrchestratorService`**: depende de puertos `IOrchestratorProjectsPort` / `IOrchestratorTheForgePort` en lugar de clases concretas.
- **`ProjectsModule` / `TheForgeModule`**: exportan tokens de puerto para consumo del orquestador.
- **Documentación**: actualizaciones en `docs/notebooklm/THEFORGE-INDEX.md`, `docs/notebooklm/LEGACY-EVIDENCE-CONTEXT.md`, skill The Forge; ajustes en `docker-compose.yml`, `vite.config.ts` y paths TS del web según el paquete compartido.

### Fixed

- **Consistencia estimación**: elimina el riesgo de drift entre front (Workshop) y API al centralizar reglas en `business-rules`.
- **Semáforo HIGH**: reduce falsos AMARILLO cuando el modelo de dominio en grafo está enlazado aunque el texto MDD aún no cubra todos los apartados §3–§5.
- **Legacy**: evita avanzar con síntesis LLM cuando el índice MCP y el SDD ingerido divergen de forma grave, salvo resolución explícita del usuario.

### Impacto arquitectónico (grafo de dependencias)

- **Nuevo nodo de paquete**: `api` y `web` → `@theforge/business-rules` ← `@theforge/shared-types`.
- **`EngineModule` → `GraphMemoryModule`**: el motor de validación MDD/semáforo queda acoplado al subsistema de grafo (Falkor) en el camino HIGH con scope de proyecto/etapa.
- **`LegacyFlowModule` → `AiAnalysisModule`**: el coordinador legacy depende explícitamente de `GraphMemoryService` para gates de alineación.
- **Inversión de dependencias en orquestador**: `AiOrchestratorService` solo conoce interfaces (puertos); los módulos `projects` y `theforge` mantienen las implementaciones Nest y exportan los tokens.

---

Este documento representa el estado incremental del proyecto a fecha de **20 de mayo de 2026**.
