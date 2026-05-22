# MCP servidor The Forge (`@theforge/mcp-server`)

Paquete **`packages/mcp-server`** del monorepo The Forge: servidor **MCP propio** que expone la **API REST Nest** (`apps/api`) como herramientas MCP. **No es** el MCP **AriadneSpecs** (código indexado del cliente); ese sigue siendo externo (`THEFORGE_MCP_URL` → oráculo Ariadne). Este servidor es **The Forge sobre The Forge**: IDE u orquestador llama al MCP → JWT M2M → mismo backend que la web.

**Última revisión:** 2026-05-22 (despliegue vía pnpm en monorepo).

---

## 1. Propósito y transporte

| Aspecto | Detalle |
|--------|---------|
| **Paquete** | `@theforge/mcp-server` (`pnpm --filter @theforge/mcp-server build`) |
| **Binario** | `theforge-mcp` → `dist/index.js` |
| **Modo stdio** | Por defecto (sin args): Cursor / Claude Desktop ejecutan el binario. |
| **Modo HTTP** | `node dist/index.js --http` o `pnpm --filter @theforge/mcp-server start` — **Streamable HTTP**, puerto `PORT` (default **3100**; en algunos despliegues se mapea a **3000**). |
| **Backend** | `THEFORGE_API_URL` (default `http://localhost:3000`) — misma API que el front. |

---

## 2. Autenticación

- **`MCP_M2M_SECRET`** (obligatoria): mismo valor que en la API Nest (`POST /auth/mcp-login` con `{ "secret": "..." }`).
- El servidor obtiene **JWT**, lo guarda en memoria y reintenta **una vez** en **401** tras re-login.
- Timeout por petición a la API: **`THEFORGE_MCP_TIMEOUT`** (ms), default **120000**.

Sin `MCP_M2M_SECRET`, `login()` lanza error al primer uso autenticado.

### 2.1 `fetch failed` en login (producción)

El arranque hace `POST ${THEFORGE_API_URL}/auth/mcp-login`. **`fetch failed`** (Node) casi siempre es **red / URL**, no credenciales.

| Causa | Qué hacer |
|--------|-----------|
| **`THEFORGE_API_URL` por defecto** (`http://localhost:3000`) dentro de un contenedor MCP | `localhost` es el propio contenedor. Usa el **hostname del servicio API** en la misma red Docker (ej. `http://theforge-api:3000` como en `docker-compose.yml`). En Dokploy, define el env apuntando al servicio interno que exponga Nest. |
| API aún no levantada | Orden de arranque / `depends_on` con healthcheck; el MCP reintenta login en cada herramienta, pero conviene que la API responda antes. |
| TLS / HTTPS mal configurado | Si la API solo escucha HTTP interno, no mezcles `https://` sin certificado válido para ese host. |

El binario **ya no** usa `node --experimental-network-imports` (era ruido en logs y no hace falta para el SDK empaquetado en `node_modules`).

---

## 3. Inventario de herramientas (alto nivel)

Definidas en `packages/mcp-server/src/index.ts` (array `TOOLS` + mapa `handlers`). Incluyen, entre otras:

- **Proyectos:** `list_projects`, `get_project`, `create_project`, `delete_project`, `get_project_stages`, `get_conformance`, `patch_project`, `generate_benchmark`, `phase0_deep_research`, `suggest_brd_tobe_from_dbga`, `set_aem_content`.
- **Entregables SDD:** `generate_deliverables`, `generate_spec`, `generate_blueprint`, `generate_architecture`, `generate_api_contracts`, `generate_use_cases`, `generate_user_stories`, `generate_logic_flows`, `generate_infra`, `confirm_complexity`, `reassess_complexity`.
- **IA / análisis:** `start_analysis`, `get_estimation`, `get_mdd_thread`, `get_adrs`, `review_mdd`.
- **Orquestador:** `orchestrator_chat`, `orchestrator_welcome`, `orchestrator_clear_chat`.
- **Sesiones:** `create_session`, `get_project_sessions`, `get_session`, `chat_in_session`.
- **Legacy (prefijo implícito en rutas API):** `legacy_start`, `legacy_answer`, `legacy_generate_mdd`, `legacy_generate_codebase_doc`, `legacy_generate_deliverables`, `legacy_update_codebase_doc`, `legacy_generate_as_is_manual`, `legacy_suggest_brd_tobe`, `legacy_resolve_index_sdd_conflict`.
- **Integración Ariadne listado:** `list_theforge_projects` — delega en el endpoint que lista proyectos indexados (multi-root) para enlazar con `theforgeProjectId`.
- **Integración externa:** `set_aem_content` — establece contenido AEM desde apps externas de análisis de mercado.

Los nombres exactos y `inputSchema` están en el código fuente; la lista puede crecer con el API.

---

## 4. Despliegue rápido

```bash
# En la raíz del monorepo
corepack enable
pnpm install
pnpm exec turbo run build --filter=@theforge/mcp-server
export MCP_M2M_SECRET=...   # mismo que apps/api
export THEFORGE_API_URL=http://localhost:3000
node packages/mcp-server/dist/index.js --http   # PORT / 3100
```

**Cursor (`mcp.json`):** servidor con `url` apuntando a `http://localhost:3100/mcp` (o la ruta que exponga el transport HTTP del SDK) **solo** si el binario publica ese endpoint; ver implementación actual de `StreamableHTTPServerTransport` en `index.ts`.

**Stdio:** comando `node /ruta/al/theforge/packages/mcp-server/dist/index.js` sin `--http`.

---

## 5. Relación con otros MCP

| MCP | Rol |
|-----|-----|
| **AriadneSpecs** (`THEFORGE_MCP_URL` en la API) | Grafo de **código** del cliente (Falkor + ingest). Usado por `TheForgeService` en legacy, Blueprint, etc. |
| **`@theforge/mcp-server` (este doc)** | Herramientas sobre **proyectos The Forge**, MDD, entregables, orquestador, flujo legacy. |

No mezclar URLs ni secretos: M2M de The Forge ≠ `MCP_AUTH_TOKEN` de Ariadne.

---

## 6. Mantenimiento

- Cada nuevo endpoint expuesto al producto que deba ser invocable desde agentes debería añadirse como **tool** + **handler** en `mcp-server`.
- Tests de contrato: en la API existen pruebas de alineación MCP cliente (Ariadne); para este servidor, validar manualmente `tools/list` contra la versión desplegada de la API.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-05-22 (pnpm). Rutas relativas al monorepo `theforge`.*
