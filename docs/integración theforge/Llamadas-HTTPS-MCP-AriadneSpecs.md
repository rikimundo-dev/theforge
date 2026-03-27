# Llamadas HTTPS al MCP AriadneSpecs Oracle

Guía para **implementar llamadas HTTP/HTTPS** desde una aplicación al servidor MCP AriadneSpecs. El MCP usa el protocolo **Streamable HTTP** (JSON-RPC 2.0 sobre POST). Esta documentación describe el contrato que debe implementar el cliente.

---

## 1. Endpoint y método

| Propiedad    | Valor                                                       |
| ------------ | ----------------------------------------------------------- |
| Método       | `POST`                                                      |
| URL          | `https://<host>/mcp` (ej. `https://ariadne.kreoint.mx/mcp`) |
| Content-Type | `application/json`                                          |
| Accept       | `application/json`, `text/event-stream`                     |

---

## 2. Formato de mensajes (JSON-RPC 2.0)

Todas las peticiones son mensajes JSON-RPC 2.0 en el body del POST:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "<método>",
  "params": { ... }
}
```

- `jsonrpc`: siempre `"2.0"`
- `id`: número o string único por petición (para correlacionar respuestas)
- `method`: nombre del método MCP
- `params`: parámetros según el método

---

## 3. Headers obligatorios

```
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-03-26
```

Si el servidor tiene `MCP_AUTH_TOKEN` configurado:

```
Authorization: Bearer <token>
```

Alternativa de auth: `X-M2M-Token: <token>`

---

## 4. Flujo de inicialización (opcional)

Algunos clientes envían `initialize` antes de usar herramientas. El servidor AriadneSpecs es **stateless**: cada petición es independiente. Si tu aplicación solo llama `tools/list` y `tools/call`, puedes omitir la inicialización.

---

## 5. Listar herramientas (`tools/list`)

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### Response (ejemplo)

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "list_known_projects",
        "description": "Lista los proyectos indexados...",
        "inputSchema": { ... }
      }
    ]
  }
}
```

---

## 6. Invocar herramienta (`tools/call`)

### Request

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "<nombre_herramienta>",
    "arguments": {
      "<param1>": "<valor1>",
      "<param2>": "<valor2>"
    }
  }
}
```

### Response (ejemplo)

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Contenido en texto plano o Markdown devuelto por la herramienta."
      }
    ],
    "isError": false
  }
}
```

Si hay error en la ejecución de la herramienta:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[NOT_FOUND_IN_GRAPH] Nodo X no encontrado."
      }
    ],
    "isError": true
  }
}
```

---

## 7. Herramientas principales y argumentos

| Herramienta             | Argumentos requeridos | Argumentos opcionales                                         |
| ----------------------- | --------------------- | ------------------------------------------------------------- |
| `list_known_projects`   | —                     | —                                                             |
| `get_legacy_impact`     | `nodeName`            | `projectId`, `currentFilePath`                                |
| `get_contract_specs`    | `componentName`       | `projectId`, `currentFilePath`                                |
| `get_component_graph`   | `componentName`       | `depth`, `projectId`, `currentFilePath`                       |
| `get_file_content`      | `path`                | `projectId`, `currentFilePath`, `ref`                         |
| `semantic_search`       | `query`               | `projectId`, `limit`                                          |
| `validate_before_edit` | `nodeName`            | `projectId`, `currentFilePath`                                |
| `get_project_analysis`  | `projectId`           | `mode` (diagnostico, duplicados, reingenieria, codigo_muerto) |
| `ask_codebase`          | `question`            | `projectId`, `currentFilePath`, `scope`, `twoPhase`           |
| `get_modification_plan` | `userDescription`     | `projectId`, `currentFilePath`, `scope`                       |
| `get_definitions`       | `symbolName`          | `projectId`, `currentFilePath`                                |
| `get_references`        | `symbolName`          | `projectId`, `currentFilePath`                                |
| `get_functions_in_file` | `path`                | `projectId`, `currentFilePath`                                |
| `get_import_graph`      | `filePath`            | `projectId`, `currentFilePath`                                |

> **projectId:** ID de proyecto o de repo. Obtener con `list_known_projects`; el campo `id` del proyecto o `roots[].id` de cada repo.

---

## 8. Implementación en TheForge

El servicio `TheForgeService` (`apps/api/src/modules/theforge/theforge.service.ts`) implementa este contrato:

- `isConfigured()`: true si `THEFORGE_MCP_URL` está definido (token opcional)
- Headers: solo envía `Authorization: Bearer` o `X-M2M-Token` cuando el token está configurado
- Variables: `THEFORGE_MCP_URL`, `MCP_AUTH_TOKEN` (Bearer), `MCP_X_M2M_TOKEN` (alternativa)

---

## 9. Códigos HTTP

| Código | Significado                                                               |
| ------ | ------------------------------------------------------------------------- |
| 200    | OK — Respuesta JSON-RPC en body                                           |
| 202    | Accepted — Notificación aceptada (sin body)                               |
| 400    | Bad Request — JSON malformado o método inválido                           |
| 401    | Unauthorized — Falta o token incorrecto (si MCP_AUTH_TOKEN está definido) |
| 404    | Not Found — Ruta incorrecta (verificar que sea `/mcp`)                   |
| 500    | Internal Server Error — Error del servidor                                |
