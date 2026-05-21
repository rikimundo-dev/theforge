import { extractSection3Body } from "../../ai-analysis/utils/mdd-sanitize.js";

// ---------------------------------------------------------------------------
// UI Design System & Component Mapping — Blueprint Section 8
// ---------------------------------------------------------------------------

type EntityType = "WorkflowProcess" | "DataRegistry" | "Configuration";

interface EntityAnalysis {
  name: string;
  type: EntityType;
  component: string;
  description: string;
  lifecycleStates?: string[];
}

const WORKFLOW_PATTERNS = [
  /order/i, /request/i, /task/i, /job/i, /booking/i, /reservation/i,
  /appointment/i, /claim/i, /ticket/i, /shipment/i, /delivery/i,
  /invoice/i, /payment/i, /transaction/i, /application/i,
  /process/i, /campaign/i, /project$/i, /session/i, /review/i,
  /audit/i, /subscription/i, /enrollment/i, /incident/i, /complaint/i,
  /feedback/i, /approval/i, /notification/i, /lead/i,
];

const CONFIG_PATTERNS = [
  /^config/i, /^setting/i, /^param/i, /^price/i, /^rate/i, /^fee/i,
  /^tariff/i, /^policy/i, /^rule/i, /^plan$/i, /^promotion/i,
  /^discount/i, /^tax/i, /^commission/i,
];

function classifyEntity(name: string): EntityType {
  if (CONFIG_PATTERNS.some((p) => p.test(name))) return "Configuration";
  if (WORKFLOW_PATTERNS.some((p) => p.test(name))) return "WorkflowProcess";
  return "DataRegistry";
}

function suggestComponent(type: EntityType, name: string): string {
  switch (type) {
    case "WorkflowProcess":
      if (/order|booking|reservation/i.test(name)) return "KanbanBoard";
      if (/request|application|claim|proposal|incident|ticket/i.test(name)) return "KanbanBoard";
      return "KanbanBoard";
    case "DataRegistry":
      if (/user|customer|client|member|employee|contact|lead/i.test(name)) return "DataTable";
      if (/product|service|item|inventory|property/i.test(name)) return "DataTable";
      if (/category|tag|label|type|status|role/i.test(name)) return "ReferenceTable";
      if (/document|file|content|article|post|log|history/i.test(name)) return "AuditList";
      return "DataTable";
    case "Configuration":
      if (/setting|config|param/i.test(name)) return "PropertyGrid";
      return "PropertyGrid";
  }
}

function suggestDescription(type: EntityType, name: string): string {
  switch (type) {
    case "WorkflowProcess":
      return `Gestión visual de flujo con columnas de estado, arrastre de tarjetas y tracking de transiciones.`;
    case "DataRegistry":
      if (/user|customer|client|member|employee|contact|lead/i.test(name)) {
        return `Tabla con filtros, búsqueda y paginación para gestión de registros maestros. Acciones CRUD en cada fila.`;
      }
      if (/product|service|item|inventory|property/i.test(name)) {
        return `Lista o cuadrícula de catálogo con vista detalle, filtros por atributos y acciones de mantenimiento.`;
      }
      if (/log|history|audit/i.test(name)) {
        return `Línea de tiempo o lista de auditoría con eventos ordenados cronológicamente y filtro por tipo/severidad.`;
      }
      return `Tabla de datos con filtros, ordenamiento y paginación. CRUD estándar.`;
    case "Configuration":
      return `Panel de propiedades con secciones expandibles, validación en línea y persistencia automática.`;
  }
}

function inferLifecycleStates(name: string): string[] {
  const lower = name.toLowerCase();
  const map: Record<string, string[]> = {
    order: ["draft", "confirmed", "processing", "completed", "cancelled"],
    booking: ["pending", "confirmed", "in_progress", "completed", "cancelled"],
    subscription: ["active", "paused", "past_due", "cancelled", "expired"],
    ticket: ["open", "in_progress", "resolved", "closed", "reopened"],
    lead: ["new", "contacted", "qualified", "converted", "lost"],
    task: ["pending", "in_progress", "completed", "blocked"],
    incident: ["reported", "investigating", "resolved", "closed"],
    payment: ["pending", "processing", "completed", "failed", "refunded"],
    request: ["draft", "submitted", "reviewing", "approved", "rejected"],
    notification: ["pending", "sent", "delivered", "failed"],
  };
  for (const [key, states] of Object.entries(map)) {
    if (lower.includes(key)) return states;
  }
  return ["draft", "active", "completed", "archived"];
}

/**
 * Parsea nombres de entidades desde el SQL de §3 del MDD.
 */
function parseEntitiesFromSection3(section3: string): string[] {
  const entities: string[] = [];
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`|"|')?(\w+)(?:`|"|')?/gi;
  let match;
  while ((match = regex.exec(section3)) !== null) {
    const name = match[1];
    if (name && !entities.includes(name)) entities.push(name);
  }
  return entities;
}

/**
 * Enriquecimiento del Blueprint: analiza las entidades del MDD §3 y genera
 * la sección "## 8. UI Design System & Component Mapping" para anexar al
 * final del Blueprint.
 *
 * NO altera las secciones anteriores del Blueprint.
 * Simplemente entrega el bloque de texto Markdown listo para concatenar.
 */
export function enrichBlueprintWithUiDesignSystem(
  mddContent: string,
  existingBlueprint: string,
): string {
  // Si ya tiene la sección, no duplicar
  if (/^##\s*[89]\.?\s*UI\s+Design\s+System/im.test(existingBlueprint)) return existingBlueprint;

  const section3 = extractSection3Body(mddContent);
  if (!section3) return existingBlueprint;

  const entityNames = parseEntitiesFromSection3(section3);
  if (entityNames.length === 0) return existingBlueprint;

  const analyses: EntityAnalysis[] = entityNames.map((name) => {
    const type = classifyEntity(name);
    const component = suggestComponent(type, name);
    const description = suggestDescription(type, name);
    const a: EntityAnalysis = { name, type, component, description };
    if (type === "WorkflowProcess") {
      a.lifecycleStates = inferLifecycleStates(name);
    }
    return a;
  });

  // Ordenar: WorkflowProcess primero, luego DataRegistry, luego Configuration
  analyses.sort((a, b) => {
    const order: Record<EntityType, number> = { WorkflowProcess: 0, DataRegistry: 1, Configuration: 2 };
    return order[a.type] - order[b.type];
  });

  const lines: string[] = [];
  lines.push("");
  lines.push("## 8. UI Design System & Component Mapping");
  lines.push("");
  lines.push(
    "> Esta sección es generada automáticamente mediante enriquecimiento semántico del modelo de datos. " +
      "Proporciona directrices para la instanciación de componentes UI basándose en la naturaleza de cada entidad del dominio.",
  );
  lines.push("");

  // Tabla de mapeo
  lines.push("### Entity-to-Component Mapping");
  lines.push("");
  lines.push("| Entidad (MDD) | Semántica de UI | Componente Recomendado | Contrato de Datos (Props) |");
  lines.push("|---|---|---|---|");
  for (const entity of analyses) {
    const lifecycle =
      entity.type === "WorkflowProcess" && entity.lifecycleStates
        ? entity.lifecycleStates.join(" → ")
        : "—";
    const props =
      entity.type === "WorkflowProcess"
        ? `columns=${entity.lifecycleStates?.length ?? 3} estados, rows=entity[]`
        : entity.type === "DataRegistry"
          ? `dataSource=GET /api/v1/${entity.name}, columns=fields[]`
          : `sections=configGroups[], fields=entity.attributes`;
    const semantic = entity.type === "WorkflowProcess" ? `Proceso (${lifecycle})` : entity.type === "DataRegistry" ? "Registro CRUD" : "Configuración";
    lines.push(`| \`${entity.name}\` | ${semantic} | \`${entity.component}\` | ${props} |`);
  }
  lines.push("");

  // Reglas de Renderizado
  lines.push("### Reglas de Renderizado (UI Constraints)");
  lines.push("");
  lines.push("1. **Prioridad de componente:**");
  lines.push("   - Entidades `WorkflowProcess` → **KanbanBoard** (prohibido renderizar como tabla plana).");
  lines.push("   - Entidades `DataRegistry` → **DataTable** con filtros y paginación.");
  lines.push("   - Entidades `Configuration` → **PropertyGrid** con secciones colapsables.");
  lines.push("   - Historiales / logs de eventos → **AuditList** o **ChatTimeline**.");
  lines.push("1. **Estándar de formularios:**");
  lines.push("   - Todos los formularios deben usar **React Hook Form** + **Zod** para validación.");
  lines.push("   - Schemas derivados directamente del contrato de datos de la entidad.");
  lines.push("1. **Responsive design para tablas:**");
  lines.push("   - En viewports menores a 768px, las `DataTable` deben transformarse a **MobileStackView**");
  lines.push("     (cada fila → tarjeta apilable con campos etiquetados).");
  lines.push("1. **Validación de contrato previo a la generación:**");
  lines.push("   - Antes de instanciar un componente, verificar que el endpoint REST expone");
  lines.push("     todos los campos definidos en el contrato de datos (`props` de la tabla superior).");
  lines.push("   - Si faltan campos, abortar la renderización y registrar advertencia.");
  lines.push("");

  return existingBlueprint.trimEnd() + "\n" + lines.join("\n") + "\n";
}