/** Etiquetas legibles por nodo del plan MDD (chat + tarjeta de aprobación). */
export const PLAN_NODE_LABELS: Record<string, string> = {
  clarifier: "Clarificador (alcance)",
  merge_section1_only: "Fusionar §1",
  software_architect: "Arquitecto de Software",
  format_after_architect: "Formatear documento",
  security: "Seguridad",
  integration: "Integración",
  format_after_redactor: "Formatear final",
  diagram_injector: "Diagramas Mermaid",
  auditor: "Auditor",
};

export type PlanApprovalStep = {
  step_id: string;
  task_description: string;
  node: string;
  goal?: string;
};

/** Mensaje corto que confirma ejecutar el plan (botón Ejecutar o texto en chat). */
export function isPlanApprovalResumeMessage(message: string): boolean {
  const t = message.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!t) return false;
  return /^(si|sí|yes|ok|vale|adelante|ejecutar|ejecuta|confirmo|de acuerdo|correcto|aprobado|aprueba|continua|continuar|procede|proceder)(\b|[.!?,]|$)/u.test(
    t,
  );
}

function formatPlanTasksMarkdown(plan: PlanApprovalStep[]): string {
  if (!plan.length) return "";
  const lines = [
    "**Tareas y responsables**",
    "",
    "| # | Tarea | Responsable |",
    "| --- | --- | --- |",
  ];
  for (const step of plan) {
    const who = PLAN_NODE_LABELS[step.node] ?? step.node;
    const task = step.task_description.replace(/\|/g, "\\|");
    const goal = step.goal?.trim();
    const taskCell = goal ? `${task} — _${goal.replace(/\|/g, "\\|")}_` : task;
    lines.push(`| ${step.step_id} | ${taskCell} | ${who} |`);
  }
  return lines.join("\n");
}

/**
 * Contenidos para el historial tras aceptar el plan: resumen de impacto + tabla de tareas.
 * Excluye el pie de la tarjeta («Revisa la lista…» / «¿Ejecutar?»).
 */
export function buildPlanApprovalChatContents(
  planMessage: string,
  plan: PlanApprovalStep[],
): string[] {
  const raw = planMessage.trim();
  const sep = "\n\n---\n";
  const sepIdx = raw.indexOf(sep);
  const summary = (sepIdx >= 0 ? raw.slice(0, sepIdx) : raw).trim();
  const tasks = formatPlanTasksMarkdown(plan);
  const out: string[] = [];
  if (summary.length > 0) out.push(summary);
  if (tasks.length > 0) out.push(tasks);
  return out.length > 0 ? out : tasks ? [tasks] : [];
}
