# Project integration (NEW ↔ LEGACY)

Cross-project handoff, trace matrix, and stage promotion for brownfield SDD.

## Endpoints (`ProjectIntegrationController`)

| Method | Path | Role |
|--------|------|------|
| `GET` | `/projects/:projectId/integration` | Status, warnings, traces, `promotableItemIds` (LEGACY) |
| `PATCH` | `/projects/:projectId/integration/link` | Bidirectional NEW ↔ LEGACY link |
| `POST` | `/projects/:projectId/integration/handoff/send` | NEW: draft → sent |
| `POST` | `/projects/:projectId/integration/stages/:stageId/import-handoff` | LEGACY: import into existing stage 2+ |
| `POST` | `/projects/:projectId/integration/promote-to-stage` | **P1:** create stage from SENT handoff batch |

## Promote to stage (hybrid C+B)

Body (`promoteHandoffToStageBodySchema` in `@theforge/shared-types`):

```json
{ "itemIds": ["NEW-LEG-01"], "stageName": "Integración — Microservicio X", "activate": true }
```

- LEGACY only; requires `linkedNewProjectId`
- Default items: SENT traces without `legacyStageId`, else all SENT
- Creates stage via `ProjectsService.createStage`, applies `handoffSnapshot` + `legacyChangeState.description` (`buildHandoffImportDescription`)
- Updates `IntegrationTrace.legacyStageId` and NEW handoff JSON item `legacyStageId`

## Helpers

- `integration-context.util.ts` — prompt blocks, `parseSatisfiesLinksFromUserStories`
- `promote-handoff.util.ts` — item selection for promote (unit-tested)

See `docs/plans/PLAN-INTEGRATION-AS-STAGE.md`.
