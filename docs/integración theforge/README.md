# Integración AriadneSpecs (MCP) en The Forge

Documentación para usar el conocimiento indexado por **AriadneSpecs** (grafo de código vía MCP) en la aplicación The Forge: desde **Cursor** y desde la **API Nest** (HTTP JSON-RPC `tools/call`, no stdio en el contenedor de la API).

**Especificación canónica del servidor MCP** (monorepo **Ariadne**): `docs/MCP_AYUDA.md`, `docs/MCP_HTTPS.md`, `docs/mcp_server_specs.md` (SPEC-MCP-001). En algunas ramas las mismas piezas viven también bajo `docs/notebooklm/` — mismo contenido. La tabla siguiente es documentación **cliente** The Forge alineada a esos archivos.

| Documento | Descripción |
|-----------|-------------|
| **Llamadas-HTTPS-MCP-AriadneSpecs.md** | Espejo del contrato HTTP (`MCP_HTTPS.md` + SPEC-MCP-001): endpoint, JSON-RPC 2.0, headers, herramientas, sharding, troubleshooting. |
| **theforge.md** | Qué es TheForge, MCP en Cursor, herramientas (`list_known_projects`, `validate_before_edit`, etc.). |
| **THEFORGE-COMO-INVOCA-THEFORGE-MCP.md** | Cómo la API invoca el MCP (HTTP, JSON-RPC, Bearer/X-M2M-Token, timeout). Para compartir con el equipo TheForge. |
| **HERRAMIENTAS-MCP-THEFORGE.md** | Catálogo de herramientas AriadneSpecs usadas o disponibles. |
| **SPEC-MCP-001-THEFORGE.md** | Contrato recomendado TheForge ↔ MCP (`get_modification_plan`, `validate_before_edit`, etc.). |
| **PLAN-IMPLEMENTACION-THEFORGE-WEB.md** | Plan original por capas (DB, módulo `theforge`, flujo LEGACY). **Estado:** la integración base está en `apps/api` + `apps/web`; usar el código como fuente de verdad y este doc como contexto histórico. |

Flujo legacy detallado (histórico): [../archive/PLAN-FLUJO-LEGACY-V2.md](../archive/PLAN-FLUJO-LEGACY-V2.md).

## Uso en Cursor

Configurar AriadneSpecs en `~/.cursor/mcp.json` (ver `theforge.md`). La regla `.cursor/rules/ariadne-mcp.mdc` enlaza contrato HTTP, variables y resolución `projectId` frente al monorepo Ariadne.

## Uso en la aplicación web

En la entrada se distingue **proyecto nuevo** vs **legacy (TheForge)**; los proyectos legacy guardan `theforgeProjectId` y el orquestador usa el módulo **theforge** (`ask_codebase`, planes de modificación, etc.) según la ruta resuelta por `AgentSupervisor`. Detalle arquitectónico: [../MCP-ARQUITECTURA-THEFORGE.md](../MCP-ARQUITECTURA-THEFORGE.md) (MCP IDE ≠ `THEFORGE_MCP_URL` de la API).
