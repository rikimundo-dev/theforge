# TheForge — Qué hace el proyecto (detalle técnico y flujos)

**Propósito:** Descripción operativa y técnica de TheForge para uso como fuente en NotebookLM y onboarding. Complementa la Documentación Estratégica (valor ejecutivo).

---

## 1. Resumen en una frase

TheForge es un monorepo (API NestJS + Web React) que orquesta una **entrevista proactiva con IA** hasta producir un **MDD (Master Design Document)** como Constitución del proyecto; valida completitud con un **semáforo** (ROJO/AMARILLO/VERDE), calcula **estimación en MXN** y genera entregables (Blueprint, API, Flujos, Infra). Soporta **proyectos nuevos** (desde cero) y **proyectos legacy** (cambios en código existente) integrando el grafo de código vía **MCP AriadneSpecs** (HTTP JSON-RPC; ver monorepo Ariadne `MCP_HTTPS.md` / `mcp_server_specs.md`).

---

## 2. Dos flujos principales

| Flujo | Entrada | Salida principal | Dónde vive |
|-------|---------|-------------------|------------|
| **Proyecto nuevo (SADD)** | Nombre del proyecto, chat con IA (entrevista) | MDD en sesión → Semáforo → Estimación → Entregables (Blueprint, SPEC, Casos de Uso, Historias, API, Flujos, Infra, Tasks) | Workshop: pestañas Entrevista, MDD, Semáforo, Entregables. Backend: `modules/ai`, `modules/engine`, `modules/projects`. |
| **Proyecto legacy** | Repo(s) indexados en Ariadne + etapas (`Stage`) | **Etapa 1:** MDD Inicial (`codebaseDoc`) → MDD AS-IS (`mddContent`) → entregables. **Etapas 2+:** Modificación (plan + preguntas) → MDD de cambio → entregables | Workshop: **MDD Inicial**, **MDD**, **Modificación**, BRD. Backend: `legacy-flow`, `theforge` (MCP). Ver [LEGACY-FLOW-AS-IS-MDD.md](./LEGACY-FLOW-AS-IS-MDD.md). |

En ambos casos el **MDD es la Constitución**: todo se valida contra él (SDD). El semáforo y el estimador leen el contenido del MDD (y del proyecto) para calcular estado y coste.

---

## 3. Estructura del monorepo (pnpm + Turborepo)

Gestor: **pnpm** (`pnpm-workspace.yaml`, `pnpm-lock.yaml`). Desarrollo: `pnpm install` → `pnpm run dev:local` (ver [README-LOCAL.md](../../README-LOCAL.md)).

```
/
├── apps/
│   ├── api/          # NestJS: proyectos, sesiones, IA, engine, legacy-flow, theforge (MCP)
│   └── web/          # React (Vite) + Tailwind: landing, Workshop (vista por proyecto)
├── packages/
│   ├── database/     # Prisma schema (Project, Stage, Session, Estimation→Stage, etc.) y client
│   ├── shared-types/ # DTOs e interfaces compartidas (Zod)
│   ├── mcp-server/   # MCP propio (tools sobre API Nest)
│   └── config/       # TypeScript, ESLint, Tailwind base
├── docs/             # docs/README.md + notebooklm/ (corpus) + archive/ (histórico)
├── blueprint.md      # Guía de implementación técnica (Constitución → plan)
├── mdd.md            # MDD del producto TheForge (7 secciones)
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## 4. Módulos principales del backend (apps/api)

| Módulo | Responsabilidad |
|--------|-----------------|
| **projects** | CRUD de proyectos; MDD + semáforo + estimación por **Stage** (etapa activa); entregables (Blueprint, SPEC, …) en `Project`; tipo NEW/LEGACY, `theforgeProjectId` para legacy (ID proyecto o repo en Ariadne). |
| **sessions** | Sesiones por proyecto; `chatLog` (historial de chat), `contextStep` (CONTEXT, DATA, LOGIC, SECURITY); persistencia de la entrevista. |
| **ai** | Orquestación de IA: `OpenRouterAdapter` (OpenRouter); generación de respuesta, checklist, Spec, MDD (multiagente: Clarifier, Architect, Security, Integration, Auditor), Blueprint, Casos de Uso, Historias, etc. Prompts en `modules/ai/prompts/`. |
| **engine** | Semáforo (validación del JSON/estructura del proyecto: entidades, business_core, edge_cases, field_types) y motor de estimación (cost-calculator: horas × tarifas MXN por rol). Lógica pura, sin IA. |
| **legacy-flow** | Coordinador (start → archivos + preguntas; answer; generate-mdd; generate-deliverables) y Revisor (revisa listas y documentos antes de persistir). Knowledge pack (NotebookLM/SDD/Agentic) en `knowledge/`. |
| **theforge** | Cliente HTTP al MCP AriadneSpecs (`THEFORGE_MCP_URL`): `list_known_projects`, `get_modification_plan`, `ask_codebase`, `validate_before_edit`, `get_file_content`, `get_legacy_impact`, `semantic_search`, etc. Usado por legacy-flow y orquestador para plan de modificación y contexto al generar MDD. |

---

## 5. Semáforo y estimación MXN

- **Semáforo:** Servicio que analiza el MDD de la **etapa activa** (`Stage.mddContent` / API aplanado como `project.mddContent`). ROJO = sin entidades o sin business_core; AMARILLO = entidades pero faltan edge_cases/field_types; VERDE = checklist completo y, si aplica, mapeo UX. Solo en VERDE se permite generar código/entregables completos.
- **Estimación:** Fórmula fija: `H_total = ((Entidades × 12) + (Pantallas × 16)) × 1.25`; coste = horas × tarifas por rol (Architect, Backend, Frontend, UX en MXN). Implementación en `engine/cost-calculator.service.ts`. No usa IA.

---

## 6. Integración AriadneSpecs (proyectos legacy)

- **AriadneSpecs** indexa repos en FalkorDB y expone MCP Streamable HTTP. The Forge llama por **HTTP** (JSON-RPC) desde `TheForgeService`. Contrato: monorepo Ariadne (`MCP_HTTPS.md`, `mcp_server_specs.md`).

### 6.1 Etapa 1 — AS-IS (documentación del sistema actual)

1. Usuario elige workspace/repo → `theforgeProjectId`.
2. **MDD Inicial:** `generate-codebase-doc` → MCP **`generate_legacy_documentation`** → `legacyFlowState.codebaseDoc`.
3. **MDD:** `generate-mdd` → LLM AS-IS + inyección determinista de §3 (entidades), §4 (API), §5 (servicios) desde `codebaseDoc`.
4. Cascada entregables (bulk unificado con regen individual).

Pestaña **MDD → Regenerar** = `generate-mdd` (no Ariadne). Pestaña **MDD Inicial → Regenerar** = `generate-codebase-doc`.

### 6.2 Etapas 2+ — cambio

1. Tab **Modificación:** `legacy/start` → `get_modification_plan` → archivos + preguntas.
2. Usuario responde → `generate-mdd` con BRD, línea base etapa anterior, `validate_before_edit`, etc.
3. Entregables vía `generate-deliverables`.

**Herramientas MCP:** `generate_legacy_documentation`, `list_known_projects`, `get_modification_plan`, `ask_codebase`, `validate_before_edit`, `get_file_content`, `semantic_search`, … Ver [integracion-theforge/HERRAMIENTAS-MCP-THEFORGE.md](./integracion-theforge/HERRAMIENTAS-MCP-THEFORGE.md).

---

## 7. Entregables y cascada SDD

Orden de generación (cuando el proyecto está en VERDE o equivalente para legacy):

1. **MDD** (Constitución) — 7 secciones: Contexto, Arquitectura y Stack, Modelo de Datos, Contratos de API, Lógica y Edge Cases, Seguridad, Infraestructura.
2. **Spec** (Benchmark + clarifiedScope) — paso explícito antes de cerrar MDD.
3. **Blueprint** — plan técnico (estructura, módulos, persistencia).
4. **Casos de Uso** — derivados del MDD/Spec.
5. **Historias de usuario** — derivadas del MDD/Spec/Casos de Uso (sin inventar).
6. **Guía UX/UI**, **Contratos API**, **Flujos de lógica**, **Infraestructura** — documentos dedicados.
7. **Tasks** — tareas de implementación.

Cada entregable se valida (Revisor) y se persiste en el proyecto. La estructura canónica del MDD y el mapeo SDD están en [ENTREGABLES-SDD-VALIDACION.md](./ENTREGABLES-SDD-VALIDACION.md).

---

## 8. Stack y despliegue

- **Backend:** NestJS, Prisma (PostgreSQL), LLM vía OpenRouter. Opcional: Redis/BullMQ.
- **Frontend:** React 18, Vite, Tailwind. Proxy `/api` al backend en dev.
- **Despliegue:** Docker (Dokploy-ready): servicios api, web, db (Postgres), opcional redis. Healthchecks, variables de entorno documentadas. Un solo `docker-compose` en raíz.

---

## 9. Fuentes de verdad en el repo

| Documento | Uso |
|-----------|-----|
| **THEFORGE-INDEX.md** (esta carpeta) | Índice de arquitectura: flujo, IA, semáforo, estimación, Docker. |
| **../../blueprint.md** | Guía de implementación técnica (Constitución → plan). |
| **../../mdd.md** | MDD del producto TheForge (7 secciones). |
| **THEFORGE-DOCUMENTACION-ESTRATEGICA.md** | Valor ejecutivo (tesis, negocio, ROI). |
| **ENTREGABLES-SDD-VALIDACION.md** | Estructura canónica del MDD, mapeo SDD, validación frente a Architecting Agentic Systems. |
| **integracion-theforge/** | Cliente The Forge ↔ MCP AriadneSpecs, herramientas, flujo legacy. Ver [../LEGACY-FLOW-AS-IS-MDD.md](../LEGACY-FLOW-AS-IS-MDD.md). |

---

*Este documento se mantiene alineado con el código y con los demás .md del repo. Actualizar cuando cambien flujos o módulos.*

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
