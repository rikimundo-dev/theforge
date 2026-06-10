/**
 * Unión de claves de `arguments` que `TheForgeService` puede enviar por herramienta MCP.
 * Debe cubrir `inputSchema.required` devuelto por `tools/list` del despliegue AriadneSpecs.
 * Mantener alineado con Ariadne `docs/MCP_HTTPS.md` y `docs/mcp_server_specs.md`.
 *
 * `THEFORGE_MCP_TOOLS_WE_CALL`: solo herramientas que esta API invoca (humo `test:mcp-alignment`).
 * Claves extra en `THEFORGE_MCP_CLIENT_ARG_KEYS` sirven para validar herramientas opcionales que
 * el servidor liste en `tools/list`.
 */
export const THEFORGE_MCP_CLIENT_ARG_KEYS: Readonly<Record<string, ReadonlySet<string>>> = {
  list_known_projects: new Set<string>(),
  generate_legacy_documentation: new Set(["projectId", "currentFilePath", "scope"]),
  ask_codebase: new Set([
    "question",
    "projectId",
    "twoPhase",
    "currentFilePath",
    "scope",
    "responseMode",
    "deterministicRetriever",
  ]),
  get_modification_plan: new Set([
    "userDescription",
    "projectId",
    "currentFilePath",
    "scope",
  ]),
  get_file_content: new Set(["path", "projectId", "ref", "currentFilePath"]),
  get_legacy_impact: new Set(["nodeName", "projectId", "currentFilePath"]),
  validate_before_edit: new Set(["nodeName", "projectId", "currentFilePath"]),
  get_contract_specs: new Set(["componentName", "projectId", "currentFilePath"]),
  get_component_graph: new Set([
    "componentName",
    "projectId",
    "depth",
    "currentFilePath",
  ]),
  semantic_search: new Set(["query", "projectId", "limit"]),
  get_functions_in_file: new Set(["path", "projectId", "currentFilePath"]),
  get_definitions: new Set(["symbolName", "projectId", "currentFilePath"]),
  get_references: new Set(["symbolName", "projectId", "currentFilePath"]),
  get_implementation_details: new Set(["symbolName", "projectId", "currentFilePath"]),
  get_import_graph: new Set(["filePath", "projectId", "currentFilePath"]),
  trace_reachability: new Set(["projectId", "currentFilePath"]),
  check_export_usage: new Set(["projectId", "currentFilePath", "filePath"]),
  get_affected_scopes: new Set(["nodeName", "projectId", "currentFilePath", "includeTestFiles"]),
  check_breaking_changes: new Set(["nodeName", "projectId", "currentFilePath", "removedParams"]),
  find_similar_implementations: new Set(["query", "projectId", "currentFilePath", "limit"]),
  get_project_standards: new Set(["projectId", "currentFilePath"]),
  get_file_context: new Set(["filePath", "projectId", "currentFilePath", "ref"]),
  get_project_analysis: new Set(["projectId", "currentFilePath", "mode"]),
  /** Paridad explorador; solo si el despliegue MCP tiene JWT Nest (`ARIADNE_API_*`). */
  get_c4_model: new Set(["projectId"]),
  analyze_local_changes: new Set(["projectId", "currentFilePath", "workspaceRoot", "stagedDiff"]),
};

/** Herramientas que el cliente espera que existan en el MCP (falla el humo si faltan). */
export const THEFORGE_MCP_TOOLS_WE_CALL = new Set<string>([
  "list_known_projects",
  "generate_legacy_documentation",
  "ask_codebase",
  "get_modification_plan",
  "get_file_content",
  "get_legacy_impact",
  "validate_before_edit",
  "get_contract_specs",
  "get_component_graph",
  "semantic_search",
  "get_functions_in_file",
  "get_definitions",
  "get_references",
]);
