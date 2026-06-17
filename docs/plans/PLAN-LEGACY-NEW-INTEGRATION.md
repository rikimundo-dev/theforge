# Plan: Integración NEW ↔ LEGACY (implementado)

> **Estado:** Implementado junio 2026 (PR cross-project integration).

## Alcance entregado

| Fase | Entregable |
|------|------------|
| **P0** | Schema Prisma + migración `20260616120000_project_integration` |
| **P0** | `PATCH /projects/:id/integration/link`, handoff CRUD, picker |
| **P0** | `POST …/integration/stages/:stageId/import-handoff` |
| **P0** | Prompt injection `generate-mdd` legacy etapa 2+ y `generateUserStories` |
| **P1** | Modelo `IntegrationTrace` + matriz UI en pestaña **Integración** |
| **P1b** | `GET …/integration/context` — pull §1+§4 AS-IS para NEW |
| **P2** | Falkor `INTEGRATES_WITH`, `HandoffItem`/`SATISFIES` en `graph-memory.service` |
| **P3** | Warnings en panel, ChangeLog en handoff send/import, gate opcional `LEGACY_INTEGRATION_HANDOFF_GATE=1` |

## UI

Workshop → pestaña **Integración** (`IntegrationPanel.tsx`).

## Docs operativos

- Ayuda Workshop: `apps/web/src/content/help/legacy-new-integration.md`
- Repo: `docs/notebooklm/LEGACY-NEW-INTEGRATION-GUIDE.md`

## API rápida

```
GET    /projects/:id/integration
PATCH  /projects/:id/integration/link
GET    /projects/:id/integration/picker?targetType=LEGACY|NEW
GET    /projects/:id/integration/context
POST   /projects/:id/integration/handoff/items
PATCH  /projects/:id/integration/handoff/items/:itemId
DELETE /projects/:id/integration/handoff/items/:itemId
POST   /projects/:id/integration/handoff/send
POST   /projects/:id/integration/stages/:stageId/import-handoff
PATCH  /projects/:id/integration/traces/:traceId
```
