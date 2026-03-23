# Cómo TheForge invoca el MCP de TheForge

Documento para explicar al equipo/proyecto TheForge cómo TheForge usa su MCP: transporte, autenticación, herramientas llamadas y formato de las peticiones.

---

## 1. Transporte y autenticación

- **No usamos MCP por stdio** desde la API. La API Nest (backend) llama al MCP por **HTTP**.
- **URL:** Variable de entorno `THEFORGE_MCP_URL` (ej. `https://theforge.obp.mx/mcp`). Si está vacía, TheForge se considera no configurado y todas las llamadas devuelven vacío/null sin hacer petición.
- **Auth:** Header `Authorization: Bearer <MCP_AUTH_TOKEN>`. La variable es `MCP_AUTH_TOKEN` (inyectada en Docker). Si falta el token, no se envía header (y el servidor puede rechazar).
- **Content-Type:** `application/json`.
- **Accept:** `application/json, text/event-stream` (por si el MCP devuelve SSE).
- **MCP-Protocol-Version:** `2025-03-26` (obligatorio según spec Streamable HTTP).

Cada petición es un **JSON-RPC 2.0** con `method: "tools/call"` y `params: { name: "<tool_name>", arguments: { ... } }`.

**Timeout y reintentos:** `THEFORGE_MCP_TIMEOUT_MS` limita la duración de cada `POST` (por defecto **60000** ms). El cliente **no** reintenta automáticamente si hay timeout o error HTTP; una nueva acción del usuario o del flujo dispara otra llamada.

**MCP en el IDE vs API:** El servidor MCP que configures en Cursor/IDE (`~/.cursor/mcp.json`, etc.) es **independiente** de `THEFORGE_MCP_URL` de la API: sirve al editor, no sustituye la variable de entorno del backend. Cómo TheForge separa TheForge, Falkor SDD y un MCP propio hipotético: [`docs/MCP-ARQUITECTURA-THEFORGE.md`](../MCP-ARQUITECTURA-THEFORGE.md).

---

## 2. Formato de la petición (JSON-RPC)

Todas las llamadas desde TheForge tienen esta forma:

```json
{
  "jsonrpc": "2.0",
  "id": "<id-unico-por-llamada>",
  "method": "tools/call",
  "params": {
    "name": "<nombre_de_la_herramienta_mcp>",
    "arguments": {
      "<arg1>": "<valor1>",
      "<arg2>": "<valor2>"
    }
  }
}
```

Se envía con `POST` al `THEFORGE_MCP_URL`, body = el JSON de arriba.

---

## 3. Herramientas que invocamos

### 3.1 `list_known_projects`

- **Cuándo:** Al cargar la UI para crear/editar un proyecto legacy (el front llama `GET /theforge/projects` y el backend llama a esta herramienta).
- **Argumentos:** `{}` (ninguno).
- **Uso del resultado:** Lista de proyectos con `id`, `name`, `roots` (multi-root) para que el usuario elija con qué proyecto TheForge vincular el proyecto legacy. El `id` se guarda como `theforgeProjectId`.

**Petición de ejemplo:**

```json
{
  "jsonrpc": "2.0",
  "id": "list-projects-1",
  "method": "tools/call",
  "params": {
    "name": "list_known_projects",
    "arguments": {}
  }
}
```

**Respuesta esperada:** Esperamos en `result.content[]` un elemento con `type: "text"` y `text` conteniendo un **array JSON** de objetos. Formato **multi-root (SPEC-MCP-001):** `[{ id, name, roots: [{ id, name?, branch? }] }]`. También aceptamos formato legacy `{ id, name, rootPath?, branch? }` y lo normalizamos. Si el MCP devuelve el array dentro de un bloque markdown ` ```json ... ``` `, lo extraemos y parseamos. Soportamos tanto JSON directo como SSE con líneas `data: {...}`.

---

### 3.2 `get_modification_plan`

- **Cuándo:** Al iniciar el flujo legacy: el usuario envía una descripción del cambio y hacemos `POST /projects/:projectId/legacy/start` con `{ description }`. El backend llama a esta herramienta con esa descripción y el `theforgeProjectId` del proyecto.
- **Argumentos:**
  - `userDescription` (string): descripción en lenguaje natural del cambio que quiere el usuario.
  - `projectId` (string): el `theforgeProjectId` del proyecto (ID de proyecto o roots[].id).
  - `scope?` (object): opcional, para filtrar por repoIds, includePathPrefixes, excludePathGlobs (SPEC-MCP-001).
  - `currentFilePath?` (string): opcional, para inferir proyecto.

**Petición de ejemplo:**

```json
{
  "jsonrpc": "2.0",
  "id": "get-modification-plan-1",
  "method": "tools/call",
  "params": {
    "name": "get_modification_plan",
    "arguments": {
      "userDescription": "Añadir descuento máximo a nivel campaña en CampDetail...",
      "projectId": "uuid-del-proyecto-o-repo"
    }
  }
}
```

**Respuesta esperada:** En `result.content[].text` esperamos un JSON (directo o dentro de ` ```json ... ``` `) con:

- `filesToModify`: array de **objetos** `{ path: string, repoId: string }` (multi-repo). Cada archivo incluye su `repoId` (root). Aceptamos también formato legacy `string[]` y lo convertimos a `{ path, repoId: "" }`.
- `questionsToRefine`: array de strings (preguntas de negocio/funcionalidad únicamente).

Si esta herramienta no existe o falla, TheForge hace **fallback** con `ask_codebase` (ver abajo) pidiendo el mismo JSON; los paths se guardan con `repoId: projectId`.

---

### 3.3 `ask_codebase`

- **Cuándo:**
  1. **Flujo legacy – inicio:** Si `get_modification_plan` no está disponible o falla, se usa para obtener un JSON con `filesToModify` y `questions`.
  2. **Flujo legacy – respuestas sugeridas:** Tras tener `questions`, hacemos una sola llamada a `ask_codebase` pidiendo que responda cada pregunta según el codebase; el resultado se parsea como JSON `{ "0": "...", "1": "...", ... }` y se muestran como sugerencias al usuario.
  3. **Flujo legacy – generar MDD:** Antes de generar el MDD de cambio, hacemos **varias** llamadas a `ask_codebase` con preguntas concretas (qué existe en el codebase respecto a modelos/entidades, endpoints, pantallas; arquitectura y dependencias; reglas de negocio y edge cases). Ese texto se concatena y se inyecta en el prompt del LLM que genera el MDD.
  4. **Chat del Workshop (proyecto legacy):** Si el proyecto es de tipo LEGACY y tiene `theforgeProjectId`, cada mensaje del usuario en el chat se complementa con `ask_codebase(message, theforgeProjectId)` y la respuesta se añade al system prompt del LLM (contexto TheForge).

- **Argumentos:**
  - `question` (string): pregunta en lenguaje natural sobre el codebase.
  - `projectId` (string): `theforgeProjectId`.
  - `scope?`, `twoPhase?`, `currentFilePath?` (SPEC-MCP-001): opcionales.

**Petición de ejemplo:**

```json
{
  "jsonrpc": "2.0",
  "id": "ask-codebase-1",
  "method": "tools/call",
  "params": {
    "name": "ask_codebase",
    "arguments": {
      "question": "For this change: \"...\". List what ALREADY EXISTS in the codebase: data models/entities...",
      "projectId": "uuid-del-proyecto-o-repo"
    }
  }
}
```

**Respuesta esperada:** En `result.content[].text` esperamos texto libre (o JSON si el prompt lo pide). No asumimos estructura fija; según el flujo parseamos JSON o usamos el texto tal cual.

---

### 3.4 Validación antes de editar y refactor seguro

TheForge invoca estas herramientas cuando aplica; `projectId` puede ser ID de proyecto o de repo.

| Herramienta | Argumentos | Uso en TheForge |
|-------------|------------|-----------------|
| **validate_before_edit** | `nodeName`, `projectId`, `currentFilePath?` | **Obligatorio antes de editar (MCP):** impacto + contrato en un solo llamado. Al generar el MDD se llama para los 3 primeros archivos a modificar; si no está disponible o devuelve vacío, se usa get_legacy_impact. |
| **get_file_content** | `path`, `projectId`, `ref?`, `currentFilePath?` | Al generar el MDD: contenido de los 2 primeros archivos a modificar. |
| **get_legacy_impact** | `nodeName`, `projectId`, `currentFilePath?` | Fallback cuando validate_before_edit no existe o devuelve vacío. |
| **get_contract_specs** | `componentName`, `projectId?` | Disponible en TheForgeService; no usado en flujo automático. |
| **get_component_graph** | `componentName`, `projectId`, `depth?` (default 2) | Disponible en TheForgeService; no usado en flujo automático. |

Todas usan el mismo transporte JSON-RPC y el mismo parseo de `result.content[].text`. Catálogo completo de herramientas MCP (incluidas las que TheForge aún no invoca): **HERRAMIENTAS-MCP-THEFORGE.md**.

---

## 4. Cómo parseamos la respuesta del MCP

- Si el body de la respuesta HTTP empieza por `{`, lo tratamos como JSON directo y lo parseamos.
- Si no, buscamos líneas que empiecen por `data:` y cuyo contenido empiece por `{`; parseamos ese JSON (soporte SSE).
- Del objeto parseado usamos:
  - `result.content`: array de objetos con `type` y `text`. Buscamos el elemento con `type === "text"` y usamos su `text`.
  - Si hay `error`, no usamos `result`; registramos el error y devolvemos null/array vacío/string vacío según el caso.
- Si el `text` contiene un bloque markdown ` ```json ... ``` `, extraemos el contenido del bloque y lo parseamos como JSON. Si el `text` ya es un JSON (empieza por `[` o `{`), lo parseamos directamente.

---

## 5. Resumen para TheForge

| Qué necesita TheForge | Detalle |
|-------------------|--------|
| **Endpoint** | Un único URL (ej. `https://theforge.obp.mx/mcp`) que acepte POST con JSON-RPC 2.0, `method: "tools/call"`. |
| **Auth** | Bearer token en header; TheForge lo envía desde `MCP_AUTH_TOKEN`. |
| **Herramientas usadas** | `list_known_projects`, `get_modification_plan`, `ask_codebase`, **`validate_before_edit`** (antes de editar), `get_file_content`, `get_legacy_impact` (fallback); opcionales `get_contract_specs`, `get_component_graph`. Ver catálogo en HERRAMIENTAS-MCP-THEFORGE.md. |
| **Contrato de `get_modification_plan`** | SPEC-MCP-001: `filesToModify`: array de `{ path, repoId }`; `questionsToRefine`: solo preguntas de negocio. Aceptamos también `filesToModify: string[]` legacy. |
| **Idempotencia / estado** | TheForge no asume estado en el MCP; cada petición es independiente. |
| **Respuesta** | JSON-RPC `result.content[]` con al menos un item `type: "text"` y `text` con el payload (array de proyectos, JSON con filesToModify/questionsToRefine, o texto libre). |

Referencia en código: `apps/api/src/modules/theforge/theforge.service.ts`. Catálogo completo de herramientas MCP y uso en TheForge: **HERRAMIENTAS-MCP-THEFORGE.md**.
