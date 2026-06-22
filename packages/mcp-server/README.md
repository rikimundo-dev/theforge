# @theforge/mcp-server

Servidor MCP que expone la API REST de The Forge como herramientas (`stdio` o HTTP streamable con `--http`).

## JSDoc de herramientas

- **`src/mcp-tools.doc.ts`** — catálogo documentado: cada `name` MCP, verbo HTTP y agrupación (proyectos, entregables, análisis, orquestador, sesiones, legacy, integración Ariadne). Constante **`MCP_THEFORGE_TOOLS_DOC_REVISION`**: incrementar al añadir o quitar tools en `index.ts`.
- **`src/index.ts`** — definición runtime (`TOOLS` con JSON Schema) y despacho (`handlers`).

Variables típicas: `THEFORGE_API_URL`, `MCP_M2M_SECRET` (header del cliente en HTTP), `PORT` (modo HTTP, default **3000**).

**HTTP:** escucha en `0.0.0.0:$PORT`. `GET /health` → `{"ok":true}` sin auth.

**Healthcheck (Docker / compose):** `http://theforge-mcp:3000/health` por DNS del servicio — **no** `127.0.0.1` (en Dokploy el loopback del panel es el host físico).

**Dokploy Advanced → Swarm health:** `curl -f http://localhost:3000/health` (corre **dentro** del task). No pongas `http://127.0.0.1:3000` como URL de monitor externo.

MCP JSON-RPC: `POST /` con header `MCP_M2M_SECRET`. Traefik: path `/mcp` → raíz del contenedor.

**Fusión:** tool `merge_projects` → `POST /projects/merge` (2+ `sourceProjectIds`, preview, suite, benchmark, archivado).

**Gobernanza IA:** `generate_agent_governance` (persiste `agentGovernanceContent` o preview), `get_agent_governance_export` (scaffold reconciliado para ZIP). También expuesto en `get_project_deliverables` / `get_project_stages` → `agentGovernanceContent`.

**Spec-kit / implement:** `get_next_implementation_task(projectId)` → `GET /projects/:id/next-task` (siguiente tarea abierta, layout spec-kit, paths canónicos y `[P]`). Respuesta incluye `agentWorkflow`: IMPLEMENT.md → `.specify/memory/constitution.md` → `specs/NNN-slug/tasks.md`.

Ejemplo de sesión implement coherente:

```json
{
  "documentLayout": "spec-kit-primary",
  "constitutionPath": ".specify/memory/constitution.md",
  "tasksPath": "specs/001-my-app/tasks.md",
  "governancePresent": true,
  "agentWorkflow": [
    "1. Read IMPLEMENT.md",
    "2. Read .specify/memory/constitution.md (MDD)",
    "3. Open specs/001-my-app/tasks.md for checklist"
  ]
}
```

Repo handoff reconciliado: `GET /projects/:id/export/repo-handoff` o CLI `scripts/theforge-export.mjs`.

**Legacy MDD:** `legacy_generate_mdd` devuelve respuesta ligera; usar `get_project` para el markdown. `?includeContent=true` vía arg MCP `includeContent`.
