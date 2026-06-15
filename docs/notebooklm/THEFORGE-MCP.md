# TheForge (AriadneSpecs) — Documentación de cambios y mejoras

Uso del **oráculo TheForge** (grafo de código vía MCP) para documentar cambios, mejoras y refactors con datos reales del código indexado.

**API vs IDE:** La aplicación llama a TheForge por HTTP (`THEFORGE_MCP_URL`) desde Nest; el MCP que configures en Cursor es independiente. Ver [MCP-ARQUITECTURA-THEFORGE.md](MCP-ARQUITECTURA-THEFORGE.md).

---

## 1. Qué aporta TheForge aquí

- **Grafo indexado:** Componentes, hooks, funciones, imports, props, llamadas (FalkorDB en TheForge).
- **MCP AriadneSpecs:** Herramientas que Cursor puede llamar para consultar ese grafo **antes** de escribir doc o código.
- **Beneficio:** Changelogs, ADRs y docs de mejoras basados en impacto real (`get_legacy_impact`), contratos reales (`get_contract_specs`) y análisis de proyecto (`get_project_analysis`), sin inventar dependencias ni props.

---

## 2. Configuración mínima

### 2.1 MCP en Cursor

En `~/.cursor/mcp.json` (o Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "ariadnespecs": {
      "url": "https://theforge.obp.mx/mcp"
    }
  }
}
```

Si TheForge corre en local o por túnel: `"url": "http://localhost:8080/mcp"` (y arrancar el MCP con `FALKORDB_HOST`, `INGEST_URL`, `PORT=8080`).

### 2.2 Selección de proyecto (dinámica, sin tocar código)

**No hace falta `.theforge-project`** ni modificar el repo. El agente resuelve el proyecto en cada petición:

1. **Por nombre en el chat:** Di por ejemplo *"documenta los cambios basándote en el proyecto Legacy"*. El agente llama **`list_known_projects`** y elige el proyecto por `name` o `rootPath`.
2. **"Este repo" / "el actual":** Si pides doc del repo donde estás trabajando, se hace match del workspace con la lista de proyectos indexados.
3. **Default opcional (local):** Si quieres un default sin decirlo cada vez, puedes crear **`.theforge-project`** en la raíz con `{"projectId": "uuid"}`. Ese archivo está en **`.gitignore`** (no se commitea): cada dev o sesión puede tener su propio default sin tocar código compartido.

Así puedes **cambiar de proyecto según la petición**: mismo workspace, distintas docs basadas en distintos grafos.

### 2.3 Proyecto nuevo (no indexado en TheForge)

Si el repo en el que trabajas **aún no está indexado en TheForge** (proyecto nuevo, repo recién clonado, etc.):

1. **No bloquear:** El agente debe seguir trabajando con las herramientas habituales del workspace (Read, Grep, búsqueda en código) para documentar cambios y mejoras. TheForge es **opcional** cuando no hay grafo.
2. **Comprobar una vez:** Llamar **`list_known_projects`**. Si el proyecto que elegiste (por nombre o "este repo") no está en la lista → tratar como "proyecto no indexado".
3. **Documentar sin grafo:** Generar changelog, doc de refactor o mejoras basándose solo en el código del repo. No inventar datos de grafo; si se infieren dependencias o impacto, indicar en la doc que vienen del código local.
4. **Sugerencia para más adelante:** Incluir en la doc una línea tipo: *"Para doc futura basada en grafo, indexar este repo en TheForge; luego podrás elegirlo por nombre en la siguiente petición."*

En resumen: **proyecto no en TheForge = trabajar normal, sin TheForge; sugerir indexar para el futuro.**

---

## 3. Flujo para documentación de cambios y mejoras

| Objetivo | Herramientas MCP recomendadas |
|----------|-------------------------------|
| Changelog / release notes (qué se tocó, qué impacta) | `get_project_analysis(projectId, mode)`, `get_definitions` / `get_references` |
| Doc de refactor (componentes afectados, props que no deben cambiar) | `validate_before_edit`, `get_legacy_impact`, `get_contract_specs`, `get_component_graph` |
| Deuda técnica / duplicados / código muerto | `get_project_analysis(projectId, mode)` con el modo adecuado |
| **Flujo legacy (archivos + preguntas)** | **`get_modification_plan(userDescription, projectId)`** — garantiza paths reales del grafo y preguntas solo de negocio. |
| "Cómo funciona X" para la doc | `ask_codebase(question, projectId)` |
| Mejoras sugeridas con evidencia | `find_similar_implementations`, `semantic_search` |

La **regla de Cursor** `theforge-documentation.mdc` aplica a `docs/**` (incl. `docs/notebooklm/`), `CHANGELOG*` y `docs/notebooklm/APRENDIZAJES.md`: el agente resuelve `projectId` por indicación del usuario (nombre de proyecto), por `.theforge-project` opcional o por match con el workspace; no inventa datos si el grafo devuelve `[NOT_FOUND_IN_GRAPH]`.

---

## 4. Referencia rápida de herramientas

- **`list_known_projects`** — Listar proyectos indexados (id, name, rootPath, branch); elegir `projectId` por nombre o `rootPath`.
- **`get_modification_plan(userDescription, projectId?)`** — **(Flujo legacy)** Plan de modificación: `filesToModify` (solo rutas de nodos File del grafo, verificadas) y `questionsToRefine` (solo preguntas de negocio). No inventa paths ni extensiones. Especificación: SPEC-MCP-001.
- **`validate_before_edit(nodeName, projectId?)`** — Impacto + contrato antes de editar/documentar.
- **`get_legacy_impact`** — Qué se rompe si se modifica un nodo.
- **`get_contract_specs`** — Props reales de un componente.
- **`get_component_graph`** — Dependencias de un componente.
- **`get_definitions`** / **`get_references`** — Dónde está definido un símbolo y dónde se usa.
- **`get_project_analysis(projectId, mode)`** — Diagnóstico (deuda, duplicados, código muerto).
- **`ask_codebase(question, projectId?)`** — Preguntas en lenguaje natural sobre el código indexado.
- **`semantic_search`** / **`find_similar_implementations`** — Búsqueda en el grafo.

---

## 5. Relación con el FalkorDB interno

El proyecto usa **FalkorDB** internamente (p. ej. `graph-memory`, `ai-analysis`) para memoria semántica y grafo de MDD. **TheForge MCP es un sistema aparte:** indexa repos en su propio FalkorDB y expone ese conocimiento vía MCP. Para doc de cambios/mejoras desde Cursor se usa el **MCP AriadneSpecs** (TheForge), no el grafo interno de la API.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-06-10 (pnpm). Rutas relativas al monorepo `theforge`.*
