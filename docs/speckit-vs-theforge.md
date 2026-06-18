# Comparativa spec-kit vs The Forge

Comparativa técnica entre [github/spec-kit](https://github.com/github/spec-kit) y The Forge: fortalezas, gaps y alineación SDD.

**Fecha:** 2026-06-18 (actualizado con implementación de recomendaciones)  
**Fuentes:** spec-kit README y `spec-driven.md`; `docs/notebooklm/ENTREGABLES-SDD-VALIDACION.md`; código del monorepo.

## Implementación de recomendaciones (2026-06)

| Recomendación | Estado | Superficie |
|---------------|--------|------------|
| Export spec-kit bundle | ✅ | Workshop botón «Exportar SDD local»; `GET /projects/:id/export/sdd-bundle`; `packages/shared-types/src/spec-kit-bundle.ts` |
| Converge brownfield | ✅ | `POST /projects/:id/converge`; toolbar Tasks en Workshop |
| Tasks → GitHub Issues | ✅ | `POST /projects/:id/tasks-to-issues`; env `GITHUB_TOKEN` |
| `[NEEDS CLARIFICATION]` en Spec/Clarifier | ✅ | `spec-prompt.md`, `clarifier-prompt.md` |
| Hermes + handoff implement | ✅ | `launch-hermes` incluye `sddBundle`; ZIP gobernanza + bundle spec-kit |

---

## TL;DR

| | **spec-kit** | **The Forge** |
|---|-------------|---------------|
| **Qué es** | Toolkit repo-local para SDD con slash commands en el IDE | Plataforma SDD con agentes, semáforo, costos y legacy |
| **Alineación metodológica** | — | ~85–90% |
| **Alineación de producto** | — | ~40% (form factor distinto) |

The Forge ya documenta el mapeo SDD en `ENTREGABLES-SDD-VALIDACION.md`. No compiten en el mismo layer: spec-kit bootstrappea el repo destino; The Forge gobierna la especificación antes de tocar código.

---

## Qué es spec-kit

CLI Python (`specify init`) que instala en el repo destino:

```text
.specify/
  memory/constitution.md
  templates/
specs/001-feature-name/
  spec.md, plan.md, tasks.md, research.md, data-model.md, contracts/, quickstart.md
```

Flujo vía slash commands en 30+ agentes (Cursor, Copilot, Codex, etc.):

| Comando | Rol |
|---------|-----|
| `/speckit.constitution` | Principios gobernantes |
| `/speckit.specify` | Qué/por qué (sin stack) |
| `/speckit.clarify` | Aclarar ambigüedades pre-plan |
| `/speckit.plan` | Cómo (stack, arquitectura) |
| `/speckit.tasks` | Tareas paralelizables `[P]` |
| `/speckit.analyze` | Consistencia cross-artifact |
| `/speckit.checklist` | "Unit tests for English" |
| `/speckit.implement` | **Ejecuta tareas en el repo** |
| `/speckit.converge` | Drift código vs spec → nuevas tasks |
| `/speckit.taskstoissues` | Tasks → GitHub Issues |

**Filosofía:** specs como fuente de verdad, código como output regenerable. Templates con `[NEEDS CLARIFICATION]`, auto-branch, feature numbering. Extensions y presets para personalizar workflows.

---

## Mapeo SDD (The Forge)

| spec-kit | The Forge | Estado |
|----------|-----------|--------|
| `constitution.md` | **MDD** (7 secciones) | ✅ Más rico |
| `spec.md` | `specContent` (Benchmark + clarifiedScope) | ✅ |
| `plan.md` | `blueprintContent` | ✅ |
| `tasks.md` | `tasksContent` | ✅ |
| `contracts/` | `apiContractsContent` | ✅ (markdown, no OpenAPI YAML) |
| `data-model.md` | MDD §3 | ✅ integrado |
| `research.md` | DBGA / Phase 0 / `phase0-deep-research` | ✅ |
| `quickstart.md` | — | ❌ no existe |
| `/speckit.implement` | `launch-hermes` (webhook externo) | ⚠️ delegado |
| `/speckit.converge` | — | ❌ |
| `/speckit.taskstoissues` | — | ❌ |
| `/speckit.analyze` | `ConformanceService` + `verify-deliverable` | ✅ más fuerte |
| `/speckit.checklist` | Semáforo + Auditor MDD | ✅ más fuerte |

Jerarquía SDD: **Constitution → Spec → Plan → Tasks → Implementation**. The Forge la cumple; el plan 10/10 está marcado ✅ en `ENTREGABLES-SDD-VALIDACION.md` §7.

---

## Dónde The Forge gana

### 1. Orquestación multi-agente real

spec-kit = prompts + templates. The Forge = LangGraph con Manager, Clarifier, Software Architect, Architect Critic, Security, Integration, Auditor, DBGA (Scout/Auditor/Critic/Synthesis). Loops de reflexión en MDD que spec-kit no tiene.

**Referencias:** `apps/api/src/modules/ai-analysis/graph/mdd-graph.ts`, `dbga-graph.ts`, `docs/notebooklm/MDD-PATRONES-FLUJO.md`

### 2. Quality gates automatizados

- **Semáforo** ROJO/AMARILLO/VERDE por complejidad (`SemaphoreService`)
- **ConformanceService** Blueprint/API/Flujos/Infra vs MDD
- **verify-deliverable** con LLM (`POST /projects/:id/verify-deliverable`)
- **HITL** preview antes de persistir (modal Confirmar/Descartar)
- **Auditor** con umbral 95% → vuelta al Clarifier

spec-kit delega calidad a `/speckit.analyze` y `/speckit.checklist` manuales.

### 3. Estimación de costos MXN

Motor determinístico en `packages/business-rules`. spec-kit: nada.

### 4. Brownfield / legacy

- Flujo LEGACY con **AriadneSpecs MCP** (AS-IS, plan de cambio, BRD/To-Be)
- **Stages** como unidad SDD por fase (`docs/notebooklm/STAGE-SDD.md`)
- spec-kit solo menciona brownfield en docs, sin grafo de código

### 5. Grafo SDD (FalkorDB)

`query_sdd_graph`, `patch_mdd_section`, `propose_mdd_amendment`. spec-kit: sin memoria estructurada.

### 6. Plataforma vs toolkit

- Workshop 3 columnas (chat | MDD | semáforo+costos)
- Multi-usuario OTP, BYOK, tenants
- MCP server propio (`@theforge/mcp-server`)
- Matriz de entregables por complejidad (`packages/shared-types/src/deliverables-matrix.ts`)
- Agent Governance → ZIP con `AGENTS.md`, `.cursor/rules`, skills

### 7. Constitución más densa

MDD 7 secciones con matriz de trazabilidad, contratos estrictos §3↔§4, pre-render Mermaid/tables, puertas Constitución Cursor. spec-kit `constitution.md` es más liviano.

**Referencias:** `apps/api/src/modules/ai-analysis/prompts/mdd/mdd-constitution-skeleton.md`, `docs/notebooklm/ENTREGABLES-SDD-VALIDACION.md` §0

---

## Qué puede hacer The Forge que NO hace ahora (inspirado en spec-kit)

### Alta — cierra el gap de "última milla"

| Gap | spec-kit | Qué haría The Forge |
|-----|----------|---------------------|
| **Implement in-repo** | `/speckit.implement` escribe código en el repo | Solo `launch-hermes` vía webhook (`POST /projects/:id/launch-hermes`). Falta: exportar bundle SDD + invocar agente en repo destino, o comando MCP `implement_tasks` |
| **Converge / drift** | Compara codebase vs spec → nuevas tasks | No existe. Con Ariadne + conformance podría ser killer feature brownfield |
| **Tasks → GitHub Issues** | `/speckit.taskstoissues` | No existe. Trivial con `gh` desde `tasksContent` |
| **Export estructura spec-kit** | `specs/001-feature/` en el repo | Solo download individual (`apps/web/src/utils/workshopActiveDocumentDownload.ts`). Falta ZIP con `spec.md`, `plan.md`, `tasks.md`, `contracts/`, `.specify/memory/constitution.md` |

### Media — mejora UX SDD

| Gap | spec-kit | The Forge |
|-----|----------|-----------|
| **`[NEEDS CLARIFICATION]`** | Marcadores explícitos en spec | Clarifier integrado pero sin convención visible en Spec exportado |
| **`quickstart.md`** | Escenarios de validación post-plan | No como artefacto; podría derivarse de Spec + acceptance criteria |
| **Feature numbering + branch** | `001-chat-system` auto | Proyectos en DB sin convención git |
| **Parallel tasks `[P]`** | En `tasks.md` | `tasksContent` sin marcado de paralelización |
| **`/speckit.clarify` dedicado** | Pre-plan explícito | Clarifier solo dentro del pipeline MDD |

### Baja — ecosistema

| Gap | spec-kit | The Forge |
|-----|----------|-----------|
| **Extensions/Presets** | Comunidad, overrides `.specify/` | Prompts hardcoded; sin sistema de presets por org |
| **30+ integraciones IDE** | `specify init --integration cursor` | MCP + Workshop; sin `specify init` equivalente |
| **CI bootstrap** | `specify init --force` non-interactive | Requiere plataforma hosteada |

---

## Alineación cuantificada

```text
Metodología SDD (jerarquía de artefactos):     █████████░  ~90%
Calidad/verificación (gates, conformance):     ██████████  The Forge > spec-kit
Implementación (última milla en repo):         ████░░░░░░  spec-kit > The Forge
Developer experience (fricción cero local):    ███░░░░░░░  spec-kit > The Forge
Enterprise (legacy, costos, multi-user):       ██████████  The Forge >> spec-kit
Ecosistema/comunidad:                          ██░░░░░░░░  spec-kit >> The Forge
```

**Interpretación:** The Forge es una **specification factory** con gobernanza enterprise. spec-kit es un **bootstrapper SDD** para que el dev implemente en su repo con su agente favorito.

---

## Recomendaciones (sin perder identidad)

1. **Export spec-kit bundle** — botón "Exportar para SDD local" que genere `specs/{slug}/` + `.specify/memory/constitution.md` desde DB. Bajo esfuerzo, alto valor.

2. **`converge` brownfield** — endpoint que use Ariadne + conformance + diff de `tasksContent` vs código real → gaps como nuevas tasks. Diferenciador que spec-kit no tiene con legacy.

3. **`tasks → issues`** — `POST /projects/:id/tasks-to-issues` con labels/milestone.

4. **Marcadores `[NEEDS CLARIFICATION]`** en generación de Spec — convención en prompt del Clarifier/Spec generator.

5. **No replicar `/implement` a ciegas** — mejorar `launch-hermes` + Agent Governance ZIP para que el agente destino tenga el equivalente a spec-kit implement. Ya existe `docs/THEFORGE-DOC-CONSUMPTION-GUIDE.md` para consumo por agentes.

---

## Veredicto

The Forge **ya es SDD-compliant** y en varias dimensiones (gates, agentes, legacy, costos) **supera** spec-kit. Lo que le falta es el **repo-native last mile**: escribir en filesystem del proyecto, implementar in-situ, detectar drift, y el ecosistema de extensiones.

La alineación filosófica es alta; la alineación de producto es baja porque resuelven capas distintas del mismo problema.

---

## Referencias cruzadas

| Documento | Contenido |
|-----------|-----------|
| [ENTREGABLES-SDD-VALIDACION.md](notebooklm/ENTREGABLES-SDD-VALIDACION.md) | Mapeo SDD oficial, plan 10/10, estado de implementación |
| [THEFORGE-INDEX.md](notebooklm/THEFORGE-INDEX.md) | Arquitectura, semáforo, estimación |
| [THEFORGE-DOC-CONSUMPTION-GUIDE.md](THEFORGE-DOC-CONSUMPTION-GUIDE.md) | Guía para agentes que implementan desde docs The Forge |
| [github/spec-kit](https://github.com/github/spec-kit) | Toolkit SDD de GitHub |
| [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md) | Metodología SDD completa |
