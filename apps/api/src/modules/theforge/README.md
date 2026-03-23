# Módulo TheForge

Integración con el MCP de TheForge (AriadneSpecs) para listar proyectos indexados y enriquecer el chat en proyectos legacy.

- **TheForgeService:** `listKnownProjects()`, `getModificationPlan()`, `askCodebase()`, `getFileContent`, `validateBeforeEdit`, `getLegacyImpact`, `getContractSpecs`, `getComponentGraph`, `semanticSearch()`, `getFunctionsInFile()`, `getDefinitions()`, `getReferences()` — llamadas al MCP AriadneSpecs. Cumple spec: `MCP-Protocol-Version: 2025-03-26`, manejo de `result.isError`. Herramientas de documentación legacy: semantic_search, get_functions_in_file, get_definitions usadas en generateCodebaseDoc, getContextForDeliverables y generateMdd.
- **TheForgeController:** `GET /theforge/projects` → `{ projects, theforgeAvailable }`.

Env: `THEFORGE_MCP_URL`, `MCP_AUTH_TOKEN`, `THEFORGE_MCP_TIMEOUT_MS` (opcional).

Ver `docs/integración theforge/PLAN-IMPLEMENTACION-THEFORGE-WEB.md` y `docs/integración theforge/theforge.md`.
