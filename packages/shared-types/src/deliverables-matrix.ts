import type { ComplexityLevel } from "./project.js";

/** Claves de entregables para despacho dinámico (backend). */
export type DeliverableKind =
  | "mdd_canonical"
  | "spec"
  | "architecture"
  | "use_cases"
  | "blueprint"
  | "api_contracts"
  | "logic_flows"
  | "ux_ui_guide"
  | "user_stories"
  | "tasks"
  | "infra";

/**
 * Matriz por complejidad: orden de ejecución. `mdd_canonical` no invoca LLM (el MDD vive en Stage/chat).
 */
export const DELIVERABLES_BY_COMPLEXITY: Record<ComplexityLevel, DeliverableKind[]> = {
  LOW: ["user_stories", "tasks"],
  MEDIUM: ["spec", "api_contracts", "ux_ui_guide", "tasks"],
  HIGH: [
    "mdd_canonical",
    "blueprint",
    "spec",
    "architecture",
    "use_cases",
    "user_stories",
    "ux_ui_guide",
    "api_contracts",
    "logic_flows",
    "tasks",
    "infra",
  ],
};
