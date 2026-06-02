# @theforge/shared-types

DTOs e interfaces compartidas (Zod).

- Status, ChecklistResult, **MddJson** (`mddConstitutionSchema`, `constitution` opcional; `.passthrough()` para campos extra).
- **`mdd-pipeline-limits.ts`:** constantes de tamaño (brief, plan, goals, aviso de pegado largo en Workshop).
- **`markdown-repair.ts`:** export también vía subpath `@theforge/shared-types/markdown-repair` (MddViewer / limpieza de fences).
- **`format-document-markdown.ts`:** `/formatear` en Workshop (Fase 0 DBGA, BRD, etc.) — `repairPastedMarkdown` + tablas + Mermaid. `repairApiContractJsonFences` cierra JSON de Request/Response, quita ` ``` `+` ```json ` apilados, une JWT partido y no recorta el doc ante `###` (solo preámbulo antes de H1/H2).
- createProjectSchema, updateProjectSchema, sessionResponseSchema, etc.
- `ComplexityLevelEnum` (`LOW` | `MEDIUM` | `HIGH`): política de adopción SDD y semáforo (campo `complexity` en proyecto).
- `orchestrator.ts`: `chatOrchestratorResponseSchema` (respuesta stream/orquestador; incluye `evaluatorCritique` opcional).
- **`legacy-codebase-doc.ts`:** `codebaseDocResponseModeSchema`, `generateCodebaseDocRequestSchema` (body `POST …/legacy/generate-codebase-doc`).

Usado por API y (opcional) por web.
