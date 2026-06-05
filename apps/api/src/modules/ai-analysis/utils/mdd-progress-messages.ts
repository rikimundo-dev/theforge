/**
 * Mensajes de progreso MDD en tiempo pasado: se emiten cuando el nodo LangGraph ya terminó.
 */
export const MDD_NODE_PROGRESS_MESSAGE: Record<string, string> = {
  manager: "Entrevista con el usuario completada",
  ask_initial_topic: "Tema o problema del MDD recopilado",
  plan_approval: "Plan presentado para aprobación",
  executor: "Plan ejecutado paso a paso",
  clarifier: "Alcance y requisitos clarificados",
  software_architect: "Schema SQL y contratos de API definidos",
  architect_critic: "§3 y §4 verificados frente a la directiva",
  format_after_architect: "Documento formateado (post-arquitectura)",
  security: "Arquitectura de seguridad definida",
  integration: "Integraciones definidas",
  format_after_redactor: "Documento formateado (post-redacción)",
  diagram_injector: "Diagramas Mermaid añadidos",
  auditor: "Calidad del MDD evaluada",
};

export function getMddNodeProgressMessage(nodeName: string): string {
  return MDD_NODE_PROGRESS_MESSAGE[nodeName] ?? `Paso «${nodeName}» completado`;
}
