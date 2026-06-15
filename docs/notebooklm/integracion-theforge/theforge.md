# Resumen: TheForge / AriadneSpecs — Para usar su conocimiento en otro proyecto

Documento para dar contexto a Cursor (u otro agente) en **un proyecto distinto a TheForge** que quiera aprovechar el conocimiento indexado por TheForge.

---

## 1. Qué es TheForge

**TheForge (AriadneSpecs)** es una plataforma que:

- **Indexa repositorios** (Bitbucket/GitHub) con análisis estático (Tree-sitter): extrae componentes, hooks, funciones, imports, props, llamadas entre funciones.
- **Guarda todo en un grafo** (FalkorDB): nodos `Project`, `File`, `Component`, `Hook`, `Function`, relaciones `IMPORTS`, `RENDERS`, `CALLS`, `HAS_PROP`, etc.
- **Expone ese conocimiento vía MCP** (Model Context Protocol): un servidor MCP ("AriadneSpecs Oracle") que la IA (Cursor, etc.) puede llamar para consultar el grafo **antes** de tocar código, evitando alucinaciones y rupturas en refactors.

En resumen: **TheForge = ingest de repos + grafo FalkorDB + servidor MCP con herramientas de contexto**. No es "el código de tu app": es la **memoria estructural** del código ya indexado.

---

## 2. Cómo usar el conocimiento de TheForge desde otro proyecto

Para que Cursor use ese conocimiento **desde un workspace que no es el repo TheForge** (por ejemplo, un repo "Legacy" o "Moderno" que ya está indexado en TheForge):

### 2.1 Conectar el MCP de AriadneSpecs

Cursor debe tener configurado el servidor MCP de AriadneSpecs. Opciones típicas:

- **Producción (URL):** En `~/.cursor/mcp.json` (o Cursor Settings → MCP):
  ```json
  {
    "mcpServers": {
      "ariadnespecs": {
        "url": "https://theforge.obp.mx/mcp"
      }
    }
  }
  ```
- **Local / túnel:** Si TheForge corre en tu máquina o usas túnel SSH a FalkorDB, arrancar el MCP (`node services/mcp-ariadnespecs/dist/index.js` con `FALKORDB_HOST`, `INGEST_URL`, `PORT=8080`) y poner `"url": "http://localhost:8080/mcp"`.

Sin esta conexión, las herramientas no están disponibles.

**Uso desde la API:** La conectividad con TheForge desde el backend requiere un **token de autenticación**. Se configura con la variable de entorno `MCP_AUTH_TOKEN` (inyectada en Docker); el cliente debe enviarlo en cada petición al MCP (header `Authorization: Bearer <token>`). No commitear el token; solo en `.env` o secrets del despliegue. Ver código en `apps/api/src/modules/theforge/` y [THEFORGE-COMO-INVOCA-THEFORGE-MCP.md](./THEFORGE-COMO-INVOCA-THEFORGE-MCP.md).

### 2.2 Decirle a Cursor qué proyecto (grafo) usar: `projectId`

El grafo puede tener **varios proyectos** indexados. Cada uno tiene un `projectId` (UUID). Para que la IA no mezcle "Legacy" con "Moderno":

- **Recomendado:** En la **raíz del repo del otro proyecto** (el que quieres mantener con ayuda de TheForge), crear un archivo **`.theforge-project`**:
  ```json
  { "projectId": "uuid-del-proyecto-indexado-en-theforge" }
  ```
  El agente debe leer este archivo y usar siempre ese `projectId` en las llamadas al MCP.

- **Alternativa:** Pasar `projectId` (o `currentFilePath` para inferir proyecto) en cada llamada. Para saber el `projectId`, la IA debe llamar primero a **`list_known_projects`**: devuelve `[{ id, name, rootPath }]` y así se mapea nombre → id.

### 2.3 Flujos que debe seguir la IA cuando use TheForge

- **Al iniciar sesión en ese repo:** Ejecutar **`list_known_projects`** (si no hay `.theforge-project`) para tener el mapa de proyectos; si hay `.theforge-project`, leer `projectId` y usarlo en todo.
- **Antes de editar** un componente o función legacy: Llamar **`validate_before_edit(nodeName, projectId?)`** (o al menos `get_legacy_impact` + `get_contract_specs`). Usar las props/firmas que devuelve el grafo; **no inventar**.
- **Diagnóstico de archivo/componente/hook:** Usar **`get_component_graph`**, **`get_legacy_impact`**, **`get_definitions`**, **`get_references`** (no limitarse a Read/Grep).
- **Diagnóstico de proyecto** (deuda técnica, duplicados, reingeniería, código muerto): **`get_project_analysis(projectId, mode)`**.
- **Preguntas en lenguaje natural** ("¿cómo funciona X?"): **`ask_codebase(question, projectId?)`** (requiere que el Ingest esté accesible y configurado en el MCP).
- **Búsqueda:** **`semantic_search`**, **`find_similar_implementations`**.
- Si una herramienta devuelve **`[NOT_FOUND_IN_GRAPH]`**: no inventar; sugerir reindexar el repo en TheForge o revisar el nombre del nodo.

---

## 3. Herramientas MCP principales (recordatorio para el agente)

| Herramienta | Uso |
|-------------|-----|
| `list_known_projects` | Mapear nombres de repos → `projectId`. Ejecutar al inicio si no hay `.theforge-project`. |
| `validate_before_edit` | Obligatorio antes de editar: impacto + contrato (props/firma). |
| `get_legacy_impact` | Qué se rompe si modificas un nodo. |
| `get_contract_specs` | Props reales de un componente. |
| `get_component_graph` | Dependencias de un componente. |
| `get_definitions` / `get_references` | Dónde está definido un símbolo y dónde se usa. |
| `get_file_content` | Contenido de un archivo del repo indexado (requiere INGEST_URL en el MCP). |
| `semantic_search` / `find_similar_implementations` | Búsqueda en el grafo. |
| `get_project_analysis` | Diagnóstico, duplicados, reingeniería, código muerto (por proyecto). |
| `ask_codebase` | Preguntas en NL sobre el código (delega al Ingest). |

---

## 4. Qué necesitas en el otro proyecto

- **Cursor** (o IDE con MCP) con el servidor **AriadneSpecs** configurado y accesible (URL o local + túnel).
- **`.theforge-project`** en la raíz del repo con el `projectId` del proyecto ya indexado en TheForge (recomendado).
- **Reglas o prompt** que indiquen al agente: (1) usar siempre `projectId` en las llamadas MCP, (2) ejecutar `validate_before_edit` antes de editar componente/función, (3) no inventar props ni firmas y usar lo que devuelve el grafo.

Con esto, Cursor en "otro proyecto" puede usar el conocimiento de TheForge (grafo + ingest) para refactors seguros, diagnósticos y preguntas sobre el código indexado.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
