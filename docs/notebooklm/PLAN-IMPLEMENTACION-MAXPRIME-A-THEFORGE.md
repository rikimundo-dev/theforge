# Plan de implementación: incorporar evolución de MaxPrime en The Forge

**Objetivo:** traer a The Forge las capacidades y reglas de producto que ya existen en MaxPrime (mismo linaje técnico) **sin** deshacer lo que The Forge añadió después (auth JWT/OTP, paquete `business-rules`, cola BullMQ/Redis, módulo TheForge MCP, alivio `sddDomainGraphOk` en semáforo HIGH, puertos del orquestador).

**Principio rector — “The Forge primero, MaxPrime encima”:** en cada porte, la base de verdad es el **código actual de The Forge**. Donde The Forge ya es **mejor o más completo** (tabla §1), **respétalo y construye sobre eso**: solo se añade lo que falta (tipos, parser, reglas, prompts, UX puntual). **No** sustituir módulos enteros de The Forge por la versión MaxPrime “porque es más nueva”; **sí** fusionar comportamiento (p. ej. semáforo: puertas MaxPrime **+** `sddDomainGraphOk`; grafo: opciones MCP **+** `TheForgeService`).

**Metodología:** diff sistemático de monorepo (Prisma ya está alineado en modelo Stage/EpisodicMemory; la brecha está sobre todo en **shared-types**, **parser MDD → JSON**, **semáforo HIGH/MEDIUM**, **estimación en vivo**, **grafo LangGraph**, **prompts**, **web**) y portar por **fases con dependencias claras**. Cada fase termina con la pregunta: *¿esto preserva las ventajas de The Forge listadas abajo?*

---

## 1. Contexto: qué ya está cubierto en The Forge (no regresar)

| Área | The Forge | MaxPrime | Nota |
|------|-----------|----------|------|
| Modelo datos | `User`, `Project.userId`, `Stage`, `Estimation` por etapa | Sin `User` (proyecto “abierto”) | **No revertir** multi-tenant/auth. |
| MCP código | `TheForgeModule`, `theforgeProjectId` | `RelicModule`, `relicProjectId` | Portar *ideas* de herramientas legacy; **siempre** `TheForgeService` / contratos del repo. |
| Costos | `@theforge/business-rules` + `CostCalculatorService` | Lógica duplicada en `cost-calculator.service.ts` | Una sola fuente: **business-rules**. Ampliar allí si hiciera falta; no copiar el servicio inline de MaxPrime. |
| Docker producción | DB + Falkor + **Redis cola** + API + Web | DB + Falkor + API + Web | Mantener stack async; solo **añadir** vars que falten (p. ej. Tavily) al servicio API. |
| Compose / secretos | `env_file: .env` opcional en API, JWT, CORS, SMTP documentados | Menos superficie | **No quitar** el patrón que evita pisar MCP con `${VAR:-}`. |
| Orquestación | Puertos `IOrchestratorProjectsPort` / `IOrchestratorTheForgePort`, guard JWT | Inyección directa de servicios | **Mantener** desac acoplamiento; nuevos flujos (imágenes, etc.) pasan por los mismos límites. |
| `AiAnalysisModule` | `GraphMemoryModule` explícito | `GraphMemoryService` como provider suelto | Conservar módulo Nest si ya resuelve dependencias; no “simplificar” copiando MaxPrime si rompe wiring. |
| Semáforo HIGH | `sddDomainGraphOk` (alivio cuando el grafo SDD cuadra dominio) | No existe | Al fusionar reglas MaxPrime, **este criterio sigue siendo válido**; orden de evaluación documentado en índice. |
| `EngineModule` | Importa `GraphMemoryModule` | No | Mantener si aporta a ingest / semáforo; no alinear a ciegas con MaxPrime. |
| Layout Workshop | Grid `lg` + estado móvil + componentes `ui/` (shadcn) | `useMediaQuery` + botones nativos | **No reescribir** el layout: añadir hooks/aviso pegado/imágenes **encima** del diseño actual. |

---

## 2. Brechas prioritarias (ordenadas por impacto)

### 2.1 Contrato MDD y semáforo “Constitución Cursor”

- **MaxPrime:** `packages/shared-types/mdd.ts` incluye `mddConstitutionSchema`, `constitution` en `mddJsonSchema` (`.passthrough()`).
- **The Forge:** `mddJsonSchema` mínimo sin `constitution` ni `.passthrough()`.

**Consecuencia:** no se pueden aplicar en HIGH las puertas extra (`template_detected`, mapa de contextos, glosario, Gherkin, bloqueantes, ADR/stack) que ya implementa `SemaphoreService` en MaxPrime.

**Dependencias:** ampliar Zod → actualizar `SemaphoreService` (fusionar lógica MaxPrime **con** `sddDomainGraphOk` y flujo actual de The Forge) → asegurar que `mdd-markdown-parser` rellene `constitution` en el JSON stringificado que consume el semáforo.

### 2.2 Parser markdown → JSON (`mdd-markdown-parser`)

- **MaxPrime:** parser extendido: `extractSectionByNumber`, `extractConstitutionSignalsFromMarkdown`, merge con JSON embebido, tests `mdd-markdown-parser.constitution.spec.ts`.
- **The Forge:** parser reducido sin `constitution` ni helpers de sección.

**Acción:** portar el **comportamiento** del módulo MaxPrime (funciones, tests) y renombrar imports `@maxprime/*` → `@theforge/*`. Si The Forge tiene utilidades locales que ya cubren parte del parseo, **integrar** en lugar de borrarlas a favor de un reemplazo ciego.

### 2.3 Semáforo MEDIUM / HIGH

Diff actual (resumen):

- **MEDIUM:** MaxPrime exige también **historias de usuario** y umbrales 5/3 gates; The Forge usa 4 gates y umbrales más laxos.
- **HIGH:** MaxPrime aplica `applyConstitutionHighGates` cuando `constitution.template_detected`; The Forge prioriza alivio por grafo SDD (`sddDomainGraphOk`) y no tiene puertas de constitución.

**Acción:** diseñar **una sola** función `evaluateHigh` que:

1. Mantenga el criterio de negocio de MaxPrime para checklist clásico + constitución.
2. Preserve el bypass/atenuación por **grafo de dominio OK** de The Forge donde ya esté cableado (evitar regresión en proyectos que dependen de esa señal).

Documentar la regla combinada en `docs/notebooklm/THEFORGE-INDEX.md` (sección semáforo) cuando se implemente.

### 2.4 Estimación en vivo (`estimation.service.ts`)

- **MaxPrime:** tipo `EstimationComplexity`, `cacheProjectComplexity`, `adjustGapsForEstimationComplexity` (LOW/MEDIUM relajan penalizaciones de consistencia en métricas en vivo).
- **The Forge:** versión anterior sin ese eje.

**Acción:** portar tipos + mapa en caché + ajustes de gaps; conectar de nuevo desde `AiAnalysisService` donde MaxPrime llama a `cacheProjectComplexity` y pasa complejidad al estado MDD si aplica.

### 2.5 LangGraph MDD / DBGA

- **MaxPrime:** `LANGGRAPH_RECURSION_LIMIT = 100` en `invoke`/`stream` y graphs; `createMddGraph(graphMemory, { relic })` inyecta herramientas legacy al arquitecto.
- **The Forge:** sin límite explícito; `createMddGraph` sin opciones; `createMddGraphWithManager` no recibe `compileOptions` con servicio MCP.

**Acción:**

- Reintroducir **recursionLimit** configurable (env opcional) para evitar cortes en Manager + DBGA.
- Añadir opciones de compilación análogas a `MddGraphCompileOptions` usando **`TheForgeService`** (no Relic): pasar a `createMddSoftwareArchitectNode` igual que MaxPrime pasa `RelicService`.

### 2.6 Rigurosidad por complejidad en el arquitecto MDD

- **MaxPrime:** `mdd-complexity-rigor.ts` (`softwareArchitectComplexityAppendix`, `contextSynthesizerComplexityAppendix`) y uso en `mdd-software-architect.node.ts`.
- **The Forge:** archivo ausente; nodo arquitecto sin ese apéndice.

**Acción:** copiar utilidad y cablear en el nodo (y cualquier otro nodo que en MaxPrime importe el módulo).

### 2.7 Límites de contexto del Manager / brief (`mdd-pipeline-limits`)

- **MaxPrime:** constantes centralizadas en `shared-types`; `mdd-user-brief.ts` y `mdd-manager.node.ts` las consumen.
- **The Forge:** `mdd-user-brief.ts` con límites hardcodeados (p. ej. `500`); manager sin imports de límites compartidos.

**Acción:** añadir `mdd-pipeline-limits.ts` al paquete `@theforge/shared-types`, exportar en `index.ts`, actualizar API y (opcional) web para aviso de pegado largo.

### 2.8 Markdown en UI y persistencia

- **MaxPrime:** `repairMarkdownFences` en `shared-types/markdown-repair.ts`; uso en `MddViewer.tsx` y `document-content.util.ts`.
- **The Forge:** sin reparación de fences; `cleanDocumentContent` más simple.

**Acción:** portar `markdown-repair.ts` (export o ruta estable como en MaxPrime), integrar en web y en util de sesiones/documentos.

### 2.9 Chat multimodal

- **MaxPrime:** `ChatImagePart` en `session.ts`, validación Zod, orquestador y flujos con `userImages`, `AiService` preparado para adjuntos.
- **The Forge:** paridad con MaxPrime en API + web: `ChatImagePart`, `appendChatSchema` / historial, `parseChatImageAttachments`, `OpenRouterAdapter`, orquestador + Manager MDD (`describeImagesForMddPipeline`), `workshopStore` / `ChatContainer`.

**Estado:** Hecho — límites MIME/tamaño en `chat-image-attachments.util.ts`, máx. 6 imágenes (Zod alineado con API y UI). Sin cambiar guards JWT ni rate limits.

### 2.10 Prompts y esqueleto constitucional

- `diff` masivo en `apps/api/src/modules/ai/prompts/**/*.md` y `.ts` entre repos.

**Acción:** importación **por lotes temáticos** (master, blueprint, legacy, UX, user-stories, conformance, etc.). En conflicto, **gana el texto que refleja The Forge** (MCP TheForge, auth, multi-usuario, colas) y se **incrustan** párrafos nuevos de MaxPrime (constitución, rigor SDD). Añadir prompt faltante `ai-analysis/prompts/mdd/mdd-constitution-skeleton.md` desde MaxPrime y enlazarlo donde el skill de MaxPrime indica (manager / constitution path).

### 2.11 Infra declarada (Dokploy / Compose)

- **MaxPrime:** `TAVILY_API_KEY` en `docker-compose` del servicio API.
- **The Forge:** variable solo en `.env.example`, no inyectada en `docker-compose.yml`.

**Acción:** añadir entrada al servicio `theforge-api` para paridad operativa (valor vacío por defecto como otras claves).

### 2.12 Dev local `scripts/ensure-infra.js`

Opcional: MaxPrime y The Forge solo levantan Postgres + Falkor. The Forge en producción usa **Redis cola**; para paridad local, valorar tercer contenedor en el script o documentar `docker compose up theforge-redis-queue` cuando se pruebe BullMQ.

---

## 3. Fases de implementación sugeridas

### Fase A — Contrato y parsing (base del semáforo)

1. Actualizar `packages/shared-types/src/mdd.ts` (constitución + `passthrough` donde aplique).
2. Portar `markdown-repair.ts` y `mdd-pipeline-limits.ts`; exportar en `index.ts` (y re-export de `markdown-repair` si la web importa subpath, igual que MaxPrime).
3. Sustituir `apps/api/.../engine/mdd-markdown-parser.ts` por la versión completa + tests `.constitution.spec.ts`.
4. `pnpm run build` / tests en paquetes y API.

**Criterio de hecho:** tests de constitución verdes; `mddJsonSchema` valida `constitution` opcional.

**Estado:** Fase A implementada en código (`shared-types` + `mdd-markdown-parser` + spec `mdd-markdown-parser.constitution.spec.ts`).

### Fase B — Semáforo y MEDIUM

1. Fusionar `SemaphoreService`: reglas MaxPrime (MEDIUM estricto, HIGH + constitución) **+** `sddDomainGraphOk` de The Forge.
2. Revisar todos los call sites que arman `SemaphoreEvaluationInput` (p. ej. tras ingest SDD) para pasar `sddDomainGraphOk` cuando corresponda.
3. Actualizar documentación del semáforo en `docs/notebooklm/THEFORGE-INDEX.md`.

**Criterio de hecho:** mismos casos de prueba mental que en MaxPrime (plantilla §1 nueva → AMARILLO si faltan señales); proyectos que ya usan alivio por grafo no quedan peor que hoy.

**Estado:** Fase B implementada: `SemaphoreService` (MEDIUM 5 gates, HIGH `mergeConstitutionHigh` + `sddDomainGraphOk`), tests en `semaphore.service.spec.ts`, índice §4 ampliado.

### Fase C — Estimación en vivo y rigor MDD

1. Portar `EstimationComplexity`, caché y `adjustGapsForEstimationComplexity` en `estimation.service.ts` + `estimation.types.ts`.
2. Añadir `mdd-complexity-rigor.ts` y actualizar `mdd-software-architect.node.ts` (y nodos que usen el synthesizer si aplica).
3. Reconectar `cacheProjectComplexity` / estado `mddComplexity` en `ai-analysis.service.ts` como en MaxPrime.

**Criterio de hecho:** complejidad LOW/MEDIUM reduce penalizaciones en breakdown en vivo; sin regresiones en HIGH.

**Estado:** Fase C implementada: `EstimationService` (`adjustGapsForEstimationComplexity`, caché por proyecto/etapa, criterios verde LOW/MEDIUM/HIGH, `infrastructure_ready` relajado fuera de HIGH), `mdd-complexity-rigor.ts`, apéndices en Clarificador / Arquitecto / Auditor, `mddComplexity` vía `buildMddAgentContext` + `cacheProjectComplexity` en streams, `getPrecisionBreakdown` con contexto de proyecto en controller y regeneración §1 con apéndice del sintetizador.

### Fase D — LangGraph y MCP en el grafo

1. Reintroducir `LANGGRAPH_RECURSION_LIMIT` (constante + opcional env).
2. Extender `createMddGraph` / `createMddGraphWithManager` para inyectar `TheForgeService` al arquitecto (patrón `MddGraphCompileOptions` de MaxPrime sustituyendo Relic).
3. Alinear `mdd-manager.node.ts` / `tool-registry` si el diff muestra herramientas o deps faltantes.

**Criterio de hecho:** flujos largos no terminan por límite de recursión por defecto; legacy sigue teniendo herramientas MCP en el nodo arquitecto.

**Estado:** Fase D implementada: `LANGGRAPH_RECURSION_LIMIT` (default 100, env10–500) en `streamMddAnalysis`, `streamMddAnalysisWithManager` y `streamMddResume`; `MddGraphCompileOptions` + `createMddGraph(..., { theforge })` y `createMddGraphWithManager(..., compileOptions?)`; Arquitecto con `getMddArchitectTheForgeTools` cuando `isLegacyProject` + `theforgeProjectId` + MCP configurado (hasta 5 rondas de tools).

### Fase E — Límites de brief/manager y limpieza markdown servidor

1. Actualizar `mdd-user-brief.ts` para usar constantes de `shared-types`.
2. Alinear `mdd-manager.node.ts` con truncados MaxPrime.
3. Enriquecer `document-content.util.ts` con `repairMarkdownFences` tras normalización actual.

**Estado:** Hecho — `mdd-user-brief.ts` importa límites desde `@theforge/shared-types`; `mdd-manager.node.ts` alineado (goals con `MDD_MAX_GOAL_*`, `inferSectionsFromMessage` DENUE/INEGI, `briefForGoal` completo, regeneración completa MDD + recorte `MDD_MAX_PLAN_DIRECTIVE_CHARS`, fusión `impactSummary` en `acceptedProposalDirective` al aprobar plan, `requestQuestionsOnly` si `clarifier_only`); `document-content.util.ts` aplica `repairMarkdownFences` al final de `cleanDocumentContent`.

### Fase F — Frontend

1. `MddViewer`: aplicar `repairMarkdownFences` antes del render (como MaxPrime).
2. `ChatContainer`: aviso `MDD_LONG_PASTE_WARN_CHARS` en pestaña MDD.
3. **No** sustituir el layout responsive actual por el de MaxPrime salvo necesidad: `useMediaQuery` solo si aporta algo que CSS no cubra.
4. Fase **imágenes**: portar tipos compartidos, store/hooks, y UI de adjuntos **sobre** `apiClient` + auth existente; coordinar con endpoints del orquestador.

**Estado:** Hecho — incluye **chat multimodal**: `ChatImagePart`, orquestador + Manager MDD (`describeImagesForMddPipeline`), `sessions`/`appendChat` con `images` (máx. 6 alineado con `parseChatImageAttachments`), `workshopStore` + `useInterview` + `ChatContainer` (adjuntos y burbujas). También: `MddViewer` + `repairMarkdownFences`; aviso pegado largo en MDD; `@theforge/shared-types` en `apps/web/package.json`.

### Fase G — Prompts y documentación de producto

1. Merge de `apps/api/src/modules/ai/prompts` desde MaxPrime (revisión manual por archivo).
2. Copiar `mdd-constitution-skeleton.md` y referencias en código/prompts loader.
3. Actualizar `.cursor/skills/theforge/SKILL.md` si el flujo SDD/constitución cambia respecto al índice actual.

**Estado:** **Hecho (merge consciente)** — Ítems 1–3 cubiertos: prompts `ai/prompts` fusionados con MaxPrime donde aporta (master/blueprint, transversales, tasks/spec/infra/flujos/UX legacy, complexity MEDIUM, `user-stories` = paridad de contenido con sustitución Relic→TheForge). **No** se persigue diff cero vs MaxPrime: siguen diferencias **intencionales** (marca TheForge, arquitectura orientada al **producto** no “agentico”, `legacy-documentation-prompt` más rico, guía UX con política NEW/LEGACY + Stitch, `master-prompt.ts` fallback TheForge). Un `diff -rq` frente a MaxPrime seguirá listando archivos por esas razones.

### Fase H — Infra y DX

1. Añadir `TAVILY_API_KEY` al servicio API en `docker-compose.yml`.
2. Documentar Redis local para colas en `scripts/README.md` o ampliar `ensure-infra.js`.

**Estado:** Hecho — `TAVILY_API_KEY` en `docker-compose.yml` (servicio `theforge-api`); `scripts/README.md` con Redis de cola vs FalkorDB.

---

## 4. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Regresión semáforo (más ROJO/AMARILLO de la cuenta) | Feature flag env opcional para puertas de constitución hasta validar en staging. |
| Divergencia prompts TheForge vs MaxPrime | Diff por archivo; conservar párrafos que mencionan MCP TheForge / auth. |
| Chat con imágenes y JWT | Validar tamaño base64, tipos MIME, y no romper sesiones existentes sin campo `images`. |
| Duplicación futura business-rules vs API | Seguir una sola fuente en `packages/business-rules`; no reintroducir duplicado de MaxPrime en servicio Nest. |
| Sustitución masiva “porque MaxPrime” | Checklist por PR: ¿se mantiene auth, puertos, Redis queue, `sddDomainGraphOk`, `env_file`, shadcn? |

---

## 5. Validación final

- `pnpm exec turbo run build --filter=@theforge/api` (desde la raíz) y `pnpm --filter @theforge/api test` en specs afectados.
- Prueba manual Workshop: MDD con plantilla constitución §1 → semáforo AMARILLO esperado si faltan señales.
- Legacy: verificar herramientas TheForge en grafo arquitecto.
- Docker: build compose con nueva env Tavily declarada.

---

## 6. Referencias de archivos clave (MaxPrime → The Forge)

| MaxPrime | The Forge (destino o análogo) |
|----------|-------------------------------|
| `packages/shared-types/src/mdd.ts` | mismo path |
| `packages/shared-types/src/mdd-pipeline-limits.ts` | crear |
| `packages/shared-types/src/markdown-repair.ts` | crear |
| `packages/shared-types/src/session.ts` (imágenes) | extender |
| `apps/api/.../engine/mdd-markdown-parser.ts` | reemplazar |
| `apps/api/.../engine/semaphore.service.ts` | fusionar |
| `apps/api/.../estimation/estimation.service.ts` | portar bloques |
| `apps/api/.../utils/mdd-complexity-rigor.ts` | crear |
| `apps/api/.../graph/mdd-graph.ts` | opciones compile + recursion |
| `apps/api/.../ai-analysis/ai-analysis.service.ts` | alinear con MaxPrime donde falte |
| `apps/api/.../ai-orchestrator/ai-orchestrator.service.ts` | imágenes (tras DTOs) |
| `apps/web/.../MddViewer.tsx`, `ChatContainer.tsx` | UX paridad |
| `apps/api/.../prompts/mdd/mdd-constitution-skeleton.md` | crear |
| `docker-compose.yml` (TAVILY) | servicio API |

---

*Documento generado como plan previo a cambios de código; la ejecución debe hacerse por fases con commits revisables.*

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-05-22 (pnpm). Rutas relativas al monorepo `theforge`.*
