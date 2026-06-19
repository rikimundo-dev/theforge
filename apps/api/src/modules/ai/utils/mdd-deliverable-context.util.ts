/**
 * @deprecated Ya no se trunca el MDD por entregable; se conserva por compatibilidad de imports.
 */
export const MDD_DELIVERABLE_BUDGET = 50_000;

export interface MddDeliverableContextOptions {
  legacyBaselineStage?: boolean;
}

/** @deprecated Usar MDD_DELIVERABLE_BUDGET */
export const USER_STORIES_MDD_BUDGET = MDD_DELIVERABLE_BUDGET;

export type MddDeliverableKind =
  | "user-stories"
  | "use-cases"
  | "blueprint"
  | "api-contracts"
  | "logic-flows"
  | "architecture"
  | "tasks"
  | "infra"
  | "spec"
  | "agent-governance";

/** Extrae el cuerpo de la primera sección cuyo título coincide con pattern (hasta el siguiente ##). */
function extractSection(md: string, pattern: RegExp): string {
  const content = (md || "").trim();
  const m = content.match(pattern);
  if (!m) return "";
  const start = m.index ?? 0;
  const afterTitle = start + (m[0]?.length ?? 0);
  const rest = content.slice(afterTitle);
  const nextH2 = rest.match(/\n##\s/m);
  const end = nextH2 ? nextH2.index! + 1 : rest.length;
  return rest.slice(0, end).trim();
}

/**
 * Construye contexto MDD para entregables SDD.
 * Siempre devuelve el MDD íntegro (sin truncar por presupuesto de caracteres).
 */
export function buildMddContextForDeliverable(
  mddContent: string,
  _kind: MddDeliverableKind,
  _options?: MddDeliverableContextOptions,
): string {
  return (mddContent ?? "").trim();
}

/** Hint explícito si §5 menciona flowchart (evita gap de conformidad). */
export function buildLogicFlowsDiagramHint(mddContent: string): string {
  const section5 = extractSection(
    mddContent,
    /^##\s*(?:5\.\s*)?(?:l[oó]gica\s+y\s+edge\s+cases|l[oó]gica\b|edge\s+cases)/im,
  );
  if (!/\bflowchart\b/i.test(section5)) return "";
  return (
    "**OBLIGATORIO (MDD §5):** Incluye al menos un bloque ```mermaid con `flowchart TD` o `flowchart LR` " +
    "(la palabra `flowchart` debe figurar en el diagrama), además de sequenceDiagram si aplica."
  );
}

export function buildMddContextForUserStories(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "user-stories", options);
}

export function buildMddContextForUseCases(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "use-cases", options);
}

export function buildMddContextForBlueprint(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "blueprint", options);
}

export function buildMddContextForApiContracts(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "api-contracts", options);
}

export function buildMddContextForLogicFlows(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "logic-flows", options);
}

export function buildMddContextForArchitecture(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "architecture", options);
}

export function buildMddContextForTasks(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "tasks", options);
}

export function buildMddContextForInfra(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "infra", options);
}

export function buildMddContextForSpec(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "spec", options);
}

export function buildMddContextForAgentGovernance(
  mddContent: string,
  options?: MddDeliverableContextOptions,
): string {
  return buildMddContextForDeliverable(mddContent, "agent-governance", options);
}
