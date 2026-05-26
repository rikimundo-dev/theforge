# TheForge Document Consumption Guide

> **Propósito:** Guía para agentes de IA (Claude Code, Cursor, Codex, Copilot, etc.) que reciben documentación generada por **TheForge** y deben implementar el código correspondiente. Copia este archivo a la raíz de tu proyecto (o inclúyelo en el AGENTS.md / CLAUDE.md / .cursorrules) antes de iniciar la implementación.

---

## 📚 Estructura de Documentos TheForge

Cuando TheForge genera la especificación de un proyecto, produce estos documentos en `docs/sdd/<proyecto>/`:

| Archivo | Qué Contiene | Cómo Usarlo |
|---------|-------------|-------------|
| **`mdd.md`** | Master Design Document — la **constitución** del proyecto. Define stack, arquitectura, DB, módulos, reglas de negocio, entidades con sus atributos y relaciones | **Léelo primero.** Es tu fuente de verdad para entidades, relaciones, reglas de negocio, y constraints |
| **`spec.md`** | Especificación funcional — requisitos, user stories, criterios de aceptación | Guía para saber qué features implementar y bajo qué condiciones se consideran completas |
| **`blueprint.md`** | Blueprint de implementación — estructura del monorepo, UI component mapping (§8), pipeline CI/CD, convenciones de código, estrategias de seguridad, pruebas | **Crítico para UI.** El §8 mapea qué componente visual debe usarse para cada tipo de entidad. Léelo antes de escribir cualquier pantalla |
| **`api-contracts.md`** | Contratos REST — endpoints, métodos, DTOs de request/response, códigos de error | Implementa los endpoints **exactamente** como se especifica aquí. Los DTOs deben coincidir |
| **`logic-flows.md`** | Diagramas de flujo de lógica de negocio — auth, pagos, video pipeline, expiración | Guía para implementar servicios complejos con múltiples pasos y condiciones |
| **`infra.md`** | Infraestructura — Docker, Dokploy, dominios, redes, S3, backups | Configura el despliegue y la infraestructura según lo especificado |
| **`tasks.md`** | Lista de tareas priorizadas — desglose de implementación paso a paso | Úsalo como checklist, pero **no** como única fuente — contrasta siempre contra MDD y Blueprint |
| **`design-system.md`** | Guía de diseño — paleta, tipografía, espaciado, componentes UI autorizados | Si el proyecto usa Kreo UI, aquí están los tokens de diseño. Si no, define la guía visual |
| **`aem.md`** | Análisis y Estrategia de Mercado (opcional) — contexto de negocio | Contexto para entender el "por qué" del producto |
| **`phase0-deep-research.md`** | Investigación profunda — benchmark, análisis de competencia | Contexto adicional, no vinculante para implementación |
| **`benchmark.md`** | Benchmark contra competidores | Referencia, no vinculante |

---

## 🧠 Reglas de Consumo de Documentos

### Regla 1: El MDD es la Constitución

Todo lo que implementes debe ser **consistente** con el MDD. Si hay conflicto entre documentos, el **MDD tiene prioridad**.

```
MDD §3 → Modelo de datos (entidades, atributos, relaciones, constraints)
MDD §4 → Reglas de negocio (cálculos, validaciones, límites)
MDD §5 → Stack tecnológico (framework, librerías, versiones)
MDD §6 → Arquitectura (módulos, flujos, integraciones)
```

### Regla 2: El Blueprint §8 Define el Componente UI

**Esta es la regla que más se salta.** El Blueprint §8 especifica qué componente Kreo (o shadcn/ui) usar para cada tipo de entidad:

| Tipo de Entidad | Componente a Usar | Ejemplo |
|-----------------|-------------------|---------|
| **Workflow / State machine** (tiene `status` con transiciones) | `KanbanBoard` o `KanbanTaskBoard` | planner_subscriptions, video_jobs, user_sessions |
| **Catálogo / Registry** (CRUD plano, sin estado transicional) | `DataTable` | packages, ai_providers, photo_styles |
| **User / Persona** (listado con búsqueda y acciones) | `UserTable` | planners, event_admins, attendees |
| **Configuración** (pocos campos, tipo formulario) | `PropertyGrid` | theme settings, custom_texts, provider config |
| **Auditoría / Logs** (solo lectura, paginado) | `AuditList` o `ChatTimeline` | security_events, video_jobs history |
| **Dashboard / KPI** (métricas, resúmenes) | `DashboardKPI` o `StatsCard` | event stats, planner dashboard |

**Si no encuentras el componente Kreo exacto, usa el genérico de `@memoria/ui-components`** (Button, Card, DataTable, EmptyState, LoadingSpinner, PageHeader, Badge, Input, Label, AppShell).

### Regla 3: Mobile Responsive es Obligatorio

- Toda `DataTable` debe transformarse en **`MobileStackView`** por debajo de **768px**
- Toda pantalla debe ser mobile-first. No hay "desktop first" con afterthought mobile
- Los formularios deben ser full-width en mobile (<768px)

### Regla 4: Cada Pantalla CRUD Debe Tener 4 Operaciones

| Operación | Backend | Frontend |
|-----------|---------|----------|
| **Create** | `POST /api/...` | Formulario de creación |
| **Read/List** | `GET /api/...` (+ paginación y filtros) | DataTable + EmptyState cuando no hay datos + LoadingSpinner mientras carga |
| **Update** | `PUT /api/.../:id` | Formulario de edición (precargado) |
| **Delete / Deactivate** | `DELETE /api/.../:id` (soft-delete si aplica) | Botón con confirmación |

**Excepción:** Entidades de solo lectura (logs, auditoría) pueden omitir Create/Update/Delete.

### Regla 5: Los API Contracts Son Vinculantes

- Los endpoints deben implementarse **exactamente** con los métodos, paths y códigos HTTP especificados
- Los DTOs de request/response deben coincidir con el esquema Zod/class-validator del documento
- Si el API contract dice `POST /api/super-admin/planners`, no implementes `POST /api/planners`

### Regla 6: Seguridad MVP

- **Authentication:** Usa JWT + guards. Implementa login, refresh, logout exactamente como se especifica
- **Authorization:** Usa role-based guards (`@Roles('super_admin')`). Cada endpoint debe validar que el usuario tiene el rol correcto
- **Rate limiting:** Implementa `@nestjs/throttler` (o similar) en endpoints de login, attendee, video generation
- **Input validation:** Todos los DTOs deben usar class-validator o Zod. Rechazar datos inválidos con 400
- **CORS:** Restringir a los orígenes configurados en .env
- **CSRF:** SameSite=Strict en cookies de sesión
- Si el documento especifica **CSP headers**, `X-Content-Type-Options`, o `X-Frame-Options`, impleméntalos como middleware global

### Regla 7: Estados de UI Obligatorios

Toda pantalla que cargue datos debe manejar estos 3 estados:

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Loading  │ →  │  Data    │ →  │  Empty   │
│ (spinner)│    │ (table)  │    │ (state)  │
└──────────┘    └──────────┘    └──────────┘
                     ↓
               ┌──────────┐
               │  Error   │
               │ (message)│
               └──────────┘
```

### Regla 8: Retry & Backoff para Operaciones Asíncronas

Si el documento especifica retry/backoff (AI calls, FFmpeg, uploads), implementa **exactamente** esos valores:

| Operación | Retries | Backoff | Timeout |
|-----------|---------|---------|---------|
| Según documento | Según documento | Según documento | Según documento |

No uses defaults — respeta lo que dice el documento.

### Regla 9: No Inventes Lo Que No Está en los Docs

- No agregues campos extra a las entidades
- No crees endpoints adicionales no especificados
- No uses librerías que no estén en el stack definido en el MDD §5 o §2.1
- Si algo no está claro, **pregunta antes de suponer**

### Regla 10: Valida Contra el Blueprint al Terminar

Antes de dar por terminada una pantalla o módulo, verifica:

```
☐ ¿Las entidades de catálogo usan DataTable?
☐ ¿Las entidades de workflow usan KanbanBoard?
☐ ¿Las tablas tienen MobileStackView <768px?
☐ ¿Los settings usan PropertyGrid o formulario inline?
☐ ¿Cada CRUD tiene Create/Read/Update/Delete?
☐ ¿Hay LoadingSpinner mientras carga?
☐ ¿Hay EmptyState cuando no hay datos?
☐ ¿Hay mensaje de error cuando falla la API?
☐ ¿Los endpoints coinciden con api-contracts.md?
☐ ¿Los DTOs coinciden con el MDD §3?
```

---

## 🔄 Flujo de Trabajo Recomendado

```
1. Lee mdd.md completo → entiende entidades y reglas de negocio
2. Lee blueprint.md → especialmente el §8 para UI component mapping
3. Lee api-contracts.md → planifica los endpoints
4. Lee logic-flows.md → entiende los flujos complejos
5. Implementa backend primero: entities → services → controllers
6. Implementa frontend: routes → pages → components
7. Valida contra el blueprint §8 y las reglas de este documento
```

---

## 💡 Ejemplo de Implementación Correcta

**Documento dice:**
- Entidad `planner_subscriptions` tiene `status` (active, expired, cancelled) — es workflow
- El Blueprint §8 mapea workflow → `KanbanBoard`
- API contracts: `GET /api/super-admin/planner-subscriptions`

**Implementación correcta:**
```tsx
// NO hacer: <DataTable columns={['Status', ...]} rows={[...]} />
// SÍ hacer:
import { KanbanBoard } from '@empresa/ui-components';

<KanbanBoard
  columns={[
    { id: 'active', title: 'Activas' },
    { id: 'expired', title: 'Expiradas' },
    { id: 'cancelled', title: 'Canceladas' },
  ]}
  cards={subscriptions.map(s => ({
    id: s.id,
    title: s.planner_name,
    status: s.status,
  }))}
/>
```

---

## 📦 Contenido del Repositorio

```
docs/sdd/<proyecto>/
├── aem.md                    # Análisis de Mercado (opcional)
├── api-contracts.md          # ← Contratos REST vinculantes
├── benchmark.md              # Benchmark (opcional)
├── blueprint.md              # ← §8 UI Mapping (CRÍTICO)
├── design-system.md          # Guía de diseño visual
├── infra.md                  # Infraestructura y despliegue
├── logic-flows.md            # Flujos de negocio complejos
├── mdd.md                    # ← CONSTITUCIÓN (léelo primero)
├── phase0-deep-research.md   # Investigación profunda (opcional)
├── tasks.md                  # Checklist de tareas
└── spec.md                   # Requisitos funcionales
```

---

> **Versión:** 1.0 — Para uso con proyectos generados por TheForge (theforge.kreoint.mx)
> **Actualizado:** Mayo 2026