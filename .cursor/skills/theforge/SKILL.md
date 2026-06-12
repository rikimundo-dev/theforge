---
name: theforge
description: Guides work on The Forge monorepo (NestJS API, React Vite web, Prisma, IA-agnostic interview, Workshop view, MDD semaphore, MXN cost estimation, Dokploy). Use when editing The Forge codebase, blueprint, MDD, Workshop, AI module, engine, Docker, or when the user mentions The Forge, Workshop, MDD, semáforo, or cost estimation.
---

# The Forge

## Reference docs

- **Ariadne MCP (legacy / grafo):** `docs/notebooklm/integracion-theforge/` — espejo de `MCP_HTTPS.md` / SPEC-MCP-001 (`Llamadas-HTTPS-MCP-AriadneSpecs.md`, `SPEC-MCP-001-THEFORGE.md`). API: `THEFORGE_MCP_URL`, `theforge.service.ts`, `ariadne-mcp-scope.util.ts`. Dos redes: token `MCP_AUTH_TOKEN` (cliente→`/mcp`) vs `ARIADNE_API_*` (solo proceso MCP→Nest).
- **Architecture:** `docs/notebooklm/THEFORGE-INDEX.md` — flujo, IA agnóstica, Semáforo, estimación, Dokploy.
- **Blueprint:** `blueprint.md` — estructura monorepo, Prisma, módulos AI/engine.
- **MDD:** El MDD es la Constitución del proyecto (SDD); gobierna Blueprint, Contratos, Infra. Estructura canónica: 7 secciones. **Esqueleto constitución (YAGNI, §4.A antes que §4.B):** `apps/api/src/modules/ai-analysis/prompts/mdd/mdd-constitution-skeleton.md` (`MDD_CONSTITUTION_SKELETON_MARKDOWN` en `load-prompts.ts`). Ver `docs/notebooklm/ENTREGABLES-SDD-VALIDACION.md` §0.
- **UI:** `docs/notebooklm/ui-spec.md` — Workshop tres columnas, chat, MDD viewer, Semáforo. Brief Google Stitch: `docs/notebooklm/stitch-master-prompt.md`.
- **Rules:** `.cursor/rules/` — tech-stack, architect-behavior, the-forge-flow.

## Monorepo structure

```
apps/api          NestJS (modules: ai, ai-orchestrator, engine, projects, sessions)
apps/web          React (Vite) + Tailwind (views/WorkshopView, components, store, hooks, utils)
packages/database     Prisma schema + client (schema en packages/database)
packages/shared-types DTOs + Zod (Status, ChecklistResult, mddJson, etc.)
packages/business-rules Estimación MXN y reglas puras compartidas API + web
packages/config       tsconfig.base, eslint, tailwind
```

## IA agnóstica

- **Contrato:** `LLMProvider` (generateResponse, parseChecklist). Adapters solo en `apps/api/src/modules/ai/adapters/`.
- **Config:** **OpenRouter** único (`OPENROUTER_API_KEY` o alias `AI_API_KEY` / `OPENAI_API_KEY`). Default chat: `nousresearch/hermes-3-llama-3.1-405b`. Factory por env. Sin lógica de proveedor fuera de adapters.
- **Prompt maestro:** `apps/api/src/modules/ai/prompts/master-prompt.md` — editar el .md; el .ts lo carga en runtime.

## Semáforo y estimación

- **Semáforo:** Depende de `ComplexityLevel` (LOW/MEDIUM/HIGH). HIGH: ROJO/AMARILLO/VERDE según MDD JSON + opcional `sddDomainGraphOk` + puertas **Constitución Cursor** si `constitution.template_detected`. Detalle: `docs/notebooklm/THEFORGE-INDEX.md` §4.
- **Costos:** Fuente única `packages/business-rules` (consumen `CostCalculatorService` y `costCalculator.ts` en web). No alterar fórmula/tarifas sin acuerdo: ver `docs/notebooklm/THEFORGE-INDEX.md` §5. Motor de estimación siempre activo en UI; botón "Generar Entregables" solo en VERDE.

## Workshop (frontend)

- **Estado:** Zustand store `useWorkshopStore` (project, session, mddContent, sendMessage, persistMddContent).
- **Vista:** `WorkshopView.tsx` — grid 3 columnas: ChatContainer (useInterview) | MddViewer (secciones, streaming sin parpadeo) | Semáforo + costos (calculateCostFromMdd).
- **API:** `POST /ai-orchestrator/chat` y `POST /ai-orchestrator/chat/stream` con `{ projectId, sessionId?, message?, …, images? }` — `message` puede ir vacío si hay `images` (PNG/JPEG/WebP/GIF, máx. 6). **`POST /sessions/:id/chat`** delega en el mismo flujo que el orquestador (`chatBySessionId`: HITL, supervisor, MDD/UX/DBGA desde body, `uxGuideLlmOptions` cuando aplica, etc.); body alineado (`message`/`images`, `activeTab`, `stageId`, `mddContent`, …). Respuesta no-stream: **`{ session, project, uxUiGuideContent?, evaluatorCritique? }`**. Manager MDD: `mdd/stream/manager` y `mdd/stream/resume` también aceptan `images`.

## Docker / Dokploy

- **Un contenedor:** servicio `theforge-db` (Postgres + API + Nginx). Conexión interna `localhost:5432`.
- **Env:** DATABASE_URL, `OPENROUTER_API_KEY` (o `AI_API_KEY` / `OPENAI_API_KEY`), opcional `OPENROUTER_BASE_URL` / `OPENROUTER_CHAT_MODEL` / `OPENROUTER_EMBEDDING_MODEL`. Opcional: `LANGGRAPH_RECURSION_LIMIT` (10–500, default 100) para el grafo MDD. Nuevos servicios/variables → actualizar `docker-compose.yml`.

## Reglas de código

- Sin `any`. DTOs desde `shared-types`. Zod para validación en runtime.
- Lógica de negocio en Services, no en Controllers.
- try/catch y logs en llamadas a adapters. Verificar semáforo VERDE antes de generar código cuando aplique.
- YAGNI: no implementar funcionalidad hasta que sea necesaria.

## Checklist al cambiar

- [ ] IA: ¿Solo OpenRouter + factory? ¿Imports de SDKs solo en ai/adapters?
- [ ] Estimación: ¿Fórmula/tarifas intactas en `packages/business-rules`?
- [ ] Docker: ¿docker-compose y env actualizados?
- [ ] README de la carpeta afectada actualizado si creas componente/página.
