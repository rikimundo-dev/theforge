import { extractSection3Body } from "./mdd-sanitize.js";

// ---------------------------------------------------------------------------
// UI/UX Design Intent Enrichment
// ---------------------------------------------------------------------------

/**
 * Clasificación semántica de una entidad de dominio.
 */
type EntityClassification = "WorkflowProcess" | "DataRegistry" | "Configuration";

/**
 * Análisis semántico de una entidad extraída del modelo de datos.
 */
interface EntitySemanticAnalysis {
  /** Nombre de la entidad (ej. "projects") */
  name: string;
  /** Clasificación semántica */
  classification: EntityClassification;
  /** Estados del lifecycle (solo para WorkflowProcess) */
  lifecycleStates?: string[];
  /** Colores sugeridos (solo para WorkflowProcess) */
  lifecycleColors?: Record<string, string>;
  /** Tipo de componente UI sugerido */
  componentType: string;
  /** Propiedades relevantes del modelo */
  keyFields?: string[];
  /** Nota adicional */
  note?: string;
}

/** Colores pastel para estados de workflow */
const STATE_COLORS: Record<string, string> = {
  draft: "#94A3B8",
  pending: "#FCD34D",
  active: "#60A5FA",
  in_progress: "#60A5FA",
  processing: "#818CF8",
  completed: "#34D399",
  approved: "#22C55E",
  rejected: "#EF4444",
  cancelled: "#A1A1AA",
  archived: "#A1A1AA",
  failed: "#EF4444",
  paused: "#FBBF24",
  published: "#34D399",
  reviewed: "#22C55E",
  submitted: "#60A5FA",
  confirmed: "#22C55E",
  default: "#94A3B8",
};

/**
 * Heurísticas para clasificar una entidad según su nombre y campos.
 * WorkflowProcess: entidades con estados/ciclos de vida (verbs + status/state columns)
 * DataRegistry: entidades CRUD puras (nouns, reference/lookup data)
 * Configuration: entidades de configuración (settings, precios, parámetros)
 */
function classifyEntity(name: string): EntityClassification {
  const lower = name.toLowerCase();

  // Logs / outbox / sesiones — registros append-only o técnicos, no kanban
  if (/^audit_events?$/.test(lower) || /^outbox_events?$/.test(lower) || /^sessions?$/.test(lower)) {
    return "DataRegistry";
  }

  // Configuraciones — entidades de parámetros, precios, settings
  const configPatterns = [
    /^config/, /^setting/, /^param/, /^price/, /^rate/, /^fee/,
    /^tariff/, /^threshold/, /^policy/, /^rule/, /^plan$/,
    /^promotion/, /^discount/, /^tax/, /^commission/,
  ];
  if (configPatterns.some((p) => p.test(lower))) return "Configuration";

  // WorkflowProcess — entidades con lifecycle (verbos, estados)
  const workflowPatterns = [
    /order/, /request/, /task/, /job/, /booking/, /reservation/,
    /appointment/, /claim/, /ticket/, /shipment/, /delivery/,
    /invoice/, /payment/, /transaction/, /application/,
    /process/, /workflow/, /campaign/, /project$/,
    /session/, /review/, /audit/, /subscription/,
    /enrollment/, /registration/, /nomination/, /proposal/,
    /incident/, /complaint/, /feedback/, /evaluation/,
    /approval/, /leave/, /attendance/, /notification/,
  ];
  if (workflowPatterns.some((p) => p.test(lower))) return "WorkflowProcess";

  // DataRegistry — entidades CRUD (sustantivos, referencias, catálogos)
  const registryPatterns = [
    /user/, /customer/, /client/, /member/, /patient/,
    /employee/, /vendor/, /supplier/, /partner/,
    /product/, /service/, /item/, /inventory/,
    /category/, /tag/, /label/, /type$/, /status/,
    /role/, /permission/, /group/, /team/, /department/,
    /location/, /address/, /branch/, /office/, /store/,
    /account/, /profile/, /contact/, /document$/,
    /file/, /image/, /asset/, /resource/,
    /template/, /content/, /article/, /post/,
    /schedule/, /calendar/, /event/,
  ];
  if (registryPatterns.some((p) => p.test(lower))) return "DataRegistry";

  // Por defecto: DataRegistry (seguro)
  return "DataRegistry";
}

/**
 * Infiere estados de lifecycle basados en el nombre de la entidad.
 */
function inferLifecycle(name: string): string[] {
  const lower = name.toLowerCase();

  if (/^export_requests?$/.test(lower)) {
    return ["pending", "first_approved", "approved", "completed", "rejected", "expired"];
  }

  const lifecycleMap: Record<string, string[]> = {
    // Órdenes / transacciones
    order: ["draft", "confirmed", "processing", "completed", "cancelled"],
    transaction: ["pending", "processing", "completed", "failed", "reversed"],
    payment: ["pending", "processing", "completed", "failed", "refunded"],
    invoice: ["draft", "sent", "overdue", "paid", "cancelled"],
    booking: ["pending", "confirmed", "in_progress", "completed", "cancelled"],
    reservation: ["pending", "confirmed", "checked_in", "checked_out", "cancelled"],
    // Solicitudes / peticiones
    request: ["draft", "submitted", "reviewing", "approved", "rejected"],
    application: ["draft", "submitted", "reviewing", "approved", "rejected"],
    claim: ["draft", "submitted", "verifying", "approved", "rejected"],
    proposal: ["draft", "submitted", "reviewing", "accepted", "rejected"],
    // Tareas / jobs
    task: ["pending", "in_progress", "completed", "blocked", "cancelled"],
    job: ["pending", "running", "completed", "failed", "cancelled"],
    project: ["draft", "active", "in_progress", "completed", "archived"],
    campaign: ["draft", "scheduled", "active", "paused", "completed"],
    // Envíos / logística
    shipment: ["preparing", "in_transit", "delivered", "failed", "returned"],
    delivery: ["pending", "assigned", "in_transit", "delivered", "failed"],
    // Suscripciones
    subscription: ["active", "paused", "past_due", "cancelled", "expired"],
    enrollment: ["pending", "active", "completed", "dropped", "cancelled"],
    // Notificaciones / auditoría
    notification: ["pending", "sent", "delivered", "failed", "read"],
    audit: ["pending", "in_progress", "completed", "resolved"],
    review: ["pending", "in_progress", "completed", "appealed"],
    approval: ["pending", "approved", "rejected", "escalated"],
    export: ["pending", "first_approved", "approved", "completed", "rejected", "expired"],
    session: ["pending", "active", "completed", "expired", "cancelled"],
    feedback: ["draft", "submitted", "reviewed", "acknowledged"],
    incident: ["reported", "investigating", "resolved", "closed"],
    ticket: ["open", "in_progress", "resolved", "closed", "reopened"],
  };

  // Check exact match first
  if (lifecycleMap[lower]) return [...lifecycleMap[lower]];

  // Check substring match
  for (const [key, states] of Object.entries(lifecycleMap)) {
    if (lower.includes(key) || key.includes(lower)) return [...states];
  }

  // Default lifecycle
  return ["draft", "active", "completed", "archived"];
}

/**
 * Asigna colores a estados de lifecycle.
 */
function assignColors(states: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const state of states) {
    colors[state] = STATE_COLORS[state] ?? STATE_COLORS.default;
  }
  return colors;
}

/**
 * Determina el tipo de componente UI recomendado según la clasificación.
 */
function suggestComponentType(
  classification: EntityClassification,
  name: string,
): string {
  const lower = name.toLowerCase();
  switch (classification) {
    case "WorkflowProcess":
      if (/order|booking|reservation/.test(lower)) return "KanbanOrderBoard";
      if (/request|application|claim|proposal/.test(lower)) return "KanbanRequestBoard";
      if (/task|job|project/.test(lower)) return "KanbanTaskBoard";
      return "KanbanBoard";
    case "DataRegistry":
      if (/user|customer|client|member|employee/.test(lower)) return "UserTable";
      if (/product|service|item|inventory/.test(lower)) return "CatalogGrid";
      if (/document|file|content|article/.test(lower)) return "DocumentList";
      if (/category|tag|label|type|status|role/.test(lower)) return "ReferenceTable";
      return "DataTable";
    case "Configuration":
      if (/^plan$|price|rate|fee/.test(lower)) return "PropertyGrid";
      if (/setting|config|param/.test(lower)) return "SettingsPanel";
      return "PropertyGrid";
  }
}

/** Extrae nombres de columna del bloque CREATE TABLE de una entidad en §3. */
function extractColumnsFromCreateTable(section3: string, tableName: string): string[] {
  const tableRe = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tableName}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i",
  );
  const match = section3.match(tableRe);
  if (!match?.[1]) return [];
  const cols: string[] = [];
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    const col = trimmed.match(/^(\w+)\s+/);
    if (!col?.[1]) continue;
    const name = col[1];
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|REFERENCES)$/i.test(name)) continue;
    if (!cols.includes(name)) cols.push(name);
  }
  return cols;
}

/** Elige columnas de UI a partir del DDL real (fallback a heurística por nombre). */
function pickDisplayColumns(tableName: string, allCols: string[]): string[] {
  if (allCols.length === 0) return suggestKeyFields(tableName);
  const picked: string[] = [];
  if (allCols.includes("id")) picked.push("id");
  for (const candidate of ["name", "title", "label", "username", "email", "display_name"]) {
    if (allCols.includes(candidate) && !picked.includes(candidate)) {
      picked.push(candidate);
      break;
    }
  }
  for (const candidate of ["state", "status", "is_active"]) {
    if (allCols.includes(candidate) && !picked.includes(candidate)) {
      picked.push(candidate);
      break;
    }
  }
  for (const candidate of ["key_type", "algorithm", "created_at", "updated_at", "expires_at"]) {
    if (allCols.includes(candidate) && picked.length < 5 && !picked.includes(candidate)) {
      picked.push(candidate);
    }
  }
  for (const col of allCols) {
    if (picked.length >= 5) break;
    if (picked.includes(col)) continue;
    if (/_hash$|_encrypted$|password_hash/i.test(col)) continue;
    if (/_id$/.test(col) && col !== "id") continue;
    picked.push(col);
  }
  return picked.length > 0 ? picked : suggestKeyFields(tableName);
}

/**
 * Sugiere fields clave del modelo para mapear a props del componente.
 */
function suggestKeyFields(name: string): string[] {
  const lower = name.toLowerCase();

  if (lower.includes("user") || lower.includes("customer") || lower.includes("member")) {
    return ["id", "name", "email", "status"];
  }
  if (lower.includes("order") || lower.includes("booking") || lower.includes("reservation")) {
    return ["id", "status", "created_at", "updated_at"];
  }
  if (lower.includes("product") || lower.includes("service") || lower.includes("item")) {
    return ["id", "name", "price", "status"];
  }

  return ["id", "name", "status"];
}

/**
 * Sugiere nota semántica adicional.
 */
function suggestNote(name: string, classification: EntityClassification): string | undefined {
  const lower = name.toLowerCase();
  if (classification === "WorkflowProcess") {
    return `Requiere tracking de cambios de estado y auditoría de transiciones.`;
  }
  if (classification === "DataRegistry") {
    if (/user|customer|client|member/.test(lower)) {
      return `Requiere búsqueda y filtrado avanzado.`;
    }
    if (/category|tag|label|type|role/.test(lower)) {
      return `Catálogo referencial de valores predefinidos.`;
    }
  }
  if (classification === "Configuration") {
    return `Valores editables por administrador con validación de reglas de negocio.`;
  }
  return undefined;
}

/**
 * Parsea los nombres de entidades (CREATE TABLE) de la sección §3 del MDD.
 */
function parseEntitiesFromSection3(section3: string): string[] {
  const entities: string[] = [];
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`|"|'|)(\w+)(?:`|"|'|)/gi;
  let match;
  while ((match = regex.exec(section3)) !== null) {
    const name = match[1];
    if (name && !entities.includes(name)) {
      entities.push(name);
    }
  }
  return entities;
}

/**
 * Analiza semánticamente una entidad del modelo de datos.
 */
function analyzeEntity(name: string, section3?: string): EntitySemanticAnalysis {
  const classification = classifyEntity(name);
  const ddlCols = section3 ? extractColumnsFromCreateTable(section3, name) : [];
  const keyFields = pickDisplayColumns(name, ddlCols);
  const componentType = suggestComponentType(classification, name);
  const note = suggestNote(name, classification);

  const analysis: EntitySemanticAnalysis = {
    name,
    classification,
    componentType,
    keyFields,
  };

  if (classification === "WorkflowProcess") {
    const lifecycleStates = inferLifecycle(name);
    const lifecycleColors = assignColors(lifecycleStates);
    analysis.lifecycleStates = lifecycleStates;
    analysis.lifecycleColors = lifecycleColors;
  }

  if (note) analysis.note = note;

  return analysis;
}

/**
 * Genera la tabla markdown de análisis de entidades.
 */
function generateEntitiesTable(entities: EntitySemanticAnalysis[]): string {
  const rows = entities.map((e) => {
    const lifecycle =
      e.classification === "WorkflowProcess" && e.lifecycleStates
        ? e.lifecycleStates.join(" → ")
        : "—";
    const cols = [
      `\`${e.name}\``,
      e.classification,
      lifecycle,
      `\`${e.componentType}\``,
      e.keyFields?.join(", ") ?? "—",
      e.note ?? "—",
    ];
    return `| ${cols.join(" | ")} |`;
  });

  return `| Entidad | Clasificación | Lifecycle | Componente UI | Props clave | Notas |
|---|---|---|---|---|---|
${rows.join("\n")}`;
}

/**
 * Genera el bloque de mapeo de contrato para una entidad.
 */
function generateContractMapping(entity: EntitySemanticAnalysis): string {
  const { name, classification, componentType, keyFields } = entity;

  const propMappings: string[] = [];
  if (classification === "WorkflowProcess") {
    const stateCol = keyFields?.includes("state") ? "state" : "status";
    propMappings.push(`'columns' mapeadas a estados de \`${name}.${stateCol}\``);
    propMappings.push(`'rows' mapeadas a registros de \`${name}\``);
    if (keyFields) {
      propMappings.push(`'title' mapeado a \`${name}.${keyFields[1] ?? "name"}\``);
    }
  } else if (classification === "DataRegistry") {
    propMappings.push(`'dataSource' mapeado a GET /api/v1/${name}`);
    if (keyFields) {
      propMappings.push(`'columns' mapeadas a \`${keyFields.join(", ")}\``);
    }
  } else if (classification === "Configuration") {
    propMappings.push(`'sections' mapeadas a grupos de configuración de \`${name}\``);
    propMappings.push(`'fields' mapeadas a atributos de la entidad`);
  }

  return `#### ${name}
- **Componente:** \`${componentType}\`
- **Clasificación:** ${classification}
- **Mapeo de props:**
  ${propMappings.map((m) => `- ${m}`).join("\n  ")}`;
}

/**
 * Enriquecimiento semántico: analiza el MDD y añade la sección
 * "## UI/UX Design Intent" con clasificación de entidades y sugerencias de UI.
 *
 * NO altera el contenido existente del MDD. Simplemente anexa la sección al final.
 */
function buildUiUxDesignIntentSection(section3: string): string | null {
  const entityNames = parseEntitiesFromSection3(section3);
  if (entityNames.length === 0) return null;

  const analyses = entityNames.map((n) => analyzeEntity(n, section3));

  // Clasificar por tipo
  const workflowEntities = analyses.filter((e) => e.classification === "WorkflowProcess");
  const registryEntities = analyses.filter((e) => e.classification === "DataRegistry");
  const configEntities = analyses.filter((e) => e.classification === "Configuration");

  // --- Generar sección ---

  const lines: string[] = [];
  lines.push("## UI/UX Design Intent");
  lines.push("");
  lines.push(
    "> Esta sección es generada automáticamente mediante enriquecimiento semántico del modelo de datos. " +
      "Proporciona directrices para que un MCP de componentes UI pueda instanciar la interfaz " +
      "basándose en la semántica de las entidades del dominio.",
  );
  lines.push("");

  // Resumen de clasificación
  lines.push("### Entity Classification");
  lines.push("");
  lines.push(generateEntitiesTable(analyses));
  lines.push("");

  // Workflow Processes (con lifecycle)
  if (workflowEntities.length > 0) {
    lines.push("### Workflow Processes");
    lines.push("");
    lines.push(
      "Las siguientes entidades representan procesos con estados y ciclos de vida. " +
        "Se recomienda instanciar componentes KanbanBoard con columnas de estado y tracking de transiciones.",
    );
    lines.push("");

    for (const entity of workflowEntities) {
      lines.push(`#### ${entity.name}`);
      lines.push("");
      lines.push(`- **Componente UI:** \`${entity.componentType}\``);
      lines.push("- **Lifecycle:**");
      if (entity.lifecycleStates) {
        lines.push("");
        for (const state of entity.lifecycleStates) {
          const color = entity.lifecycleColors?.[state] ?? STATE_COLORS.default;
          lines.push(`  - \`${state}\` → \`${color}\``);
        }
      }
      lines.push("");
      lines.push("- **Mapeo de props:**");
      const stateCol = entity.keyFields?.includes("state") ? "state" : "status";
      lines.push(`  - \`columns\` mapeadas a estados de \`${entity.name}.${stateCol}\``);
      lines.push(`  - \`rows\` mapeadas a registros de \`${entity.name}\``);
      if (entity.keyFields?.[1]) {
        lines.push(`  - \`title\` mapeado a \`${entity.name}.${entity.keyFields[1]}\``);
      }
      if (entity.note) {
        lines.push(`- **Nota:** ${entity.note}`);
      }
      lines.push("");
    }
  }

  // Data Registries (CRUD)
  if (registryEntities.length > 0) {
    lines.push("### Data Registries");
    lines.push("");
    lines.push(
      "Las siguientes entidades son registros de datos CRUD. " +
        "Se recomienda instanciar componentes DataTable con filtros y paginación.",
    );
    lines.push("");

    for (const entity of registryEntities) {
      lines.push(`#### ${entity.name}`);
      lines.push("");
      lines.push(`- **Componente UI:** \`${entity.componentType}\``);
      lines.push(`- **API endpoint:** \`GET /api/v1/${entity.name}\``);
      lines.push("- **Mapeo de props:**");
      lines.push(`  - \`dataSource\` mapeado al endpoint REST`);
      if (entity.keyFields) {
        lines.push(`  - \`columns\` mapeadas a \`${entity.keyFields.join(", ")}\``);
      }
      if (entity.note) {
        lines.push(`- **Nota:** ${entity.note}`);
      }
      lines.push("");
    }
  }

  // Configurations
  if (configEntities.length > 0) {
    lines.push("### Configuration Entities");
    lines.push("");
    lines.push(
      "Las siguientes entidades representan configuración del sistema. " +
        "Se recomienda instanciar componentes PropertyGrid o SettingsPanel.",
    );
    lines.push("");

    for (const entity of configEntities) {
      lines.push(`#### ${entity.name}`);
      lines.push("");
      lines.push(`- **Componente UI:** \`${entity.componentType}\``);
      lines.push("- **Mapeo de props:**");
      lines.push(`  - \`sections\` mapeadas a grupos de configuración`);
      lines.push(`  - \`fields\` mapeadas a atributos de \`${entity.name}\``);
      if (entity.note) {
        lines.push(`- **Nota:** ${entity.note}`);
      }
      lines.push("");
    }
  }

  // Resumen de mapeo de contratos
  lines.push("### Contract-to-Component Mapping");
  lines.push("");
  lines.push(
    "Mapeo detallado de cada entidad a las props del componente UI sugerido:",
  );
  lines.push("");

  for (const entity of analyses) {
    lines.push(generateContractMapping(entity));
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

/**
 * Enriquecimiento semántico: analiza el MDD y añade la sección
 * "## UI/UX Design Intent" con clasificación de entidades y sugerencias de UI.
 */
export function enrichMddWithUiUxDesignIntent(markdown: string): string {
  const trimmed = (markdown ?? "").trim();
  if (!trimmed) return markdown;
  if (/^##\s*UI\/UX\s+Design\s+Intent/im.test(trimmed)) return markdown;

  const section3 = extractSection3Body(trimmed);
  if (!section3) return markdown;

  const section = buildUiUxDesignIntentSection(section3);
  if (!section) return markdown;
  return `${trimmed}\n\n${section}`;
}

/** Regenera UI/UX cuando la sección existente usa columnas genéricas repetidas. */
export function reconcileUiUxDesignIntent(markdown: string): string {
  const trimmed = (markdown ?? "").trim();
  if (!trimmed) return markdown;

  const section3 = extractSection3Body(trimmed);
  if (!section3) return markdown;

  const hasUi = /##\s*UI\/UX\s+Design\s+Intent/i.test(trimmed);
  const genericHits = (trimmed.match(/\bid,\s*name,\s*status\b/g) ?? []).length;
  if (hasUi && genericHits < 4) return markdown;

  const core = hasUi
    ? trimmed.replace(/\n##\s*UI\/UX\s+Design\s+Intent[\s\S]*$/i, "").trim()
    : trimmed;

  const section = buildUiUxDesignIntentSection(section3);
  if (!section) return markdown;
  return `${core}\n\n${section}`;
}