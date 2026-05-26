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
