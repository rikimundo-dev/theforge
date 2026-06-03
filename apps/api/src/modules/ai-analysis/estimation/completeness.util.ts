import { PlanningDocumentFields, DocumentCompleteness, DOC_COMPLETE_MIN_LENGTH, DOC_PARTIAL_MIN_LENGTH } from "./estimation.types";
const DOC_WEIGHTS: Record<keyof PlanningDocumentFields, number> = {
  mddContent: 0,
  brdContent: 0.22,
  specContent: 0.14,
  architectureContent: 0.14,
  blueprintContent: 0.12,
  useCasesContent: 0.10,
  userStoriesContent: 0.05,
  apiContractsContent: 0.08,
  logicFlowsContent: 0.05,
  infraContent: 0.05,
  tasksContent: 0.05,
};

/**
 * Calcula la completitud de cada documento del proyecto.
 * 100 = completo (≥300 chars), 50 = parcial (≥80 chars), 10 = mínimo (algún contenido), 0 = vacío.
 * El `overall` es el promedio ponderado por `DOC_WEIGHTS`.
 */
export function computeDocumentCompleteness(docs: PlanningDocumentFields): DocumentCompleteness {
  let weightedSum = 0;
  const result: Record<string, number> = { overall: 0 };

  for (const [key, weight] of Object.entries(DOC_WEIGHTS)) {
    const content = (docs as Record<string, unknown>)[key] ?? "";
    const trimmed = String(content).trim();
    let score: number;
    if (trimmed.length >= DOC_COMPLETE_MIN_LENGTH) {
      score = 100;
    } else if (trimmed.length >= DOC_PARTIAL_MIN_LENGTH) {
      score = 50;
    } else if (trimmed.length > 0) {
      score = 10;
    } else {
      score = 0;
    }
    result[key] = score;
    weightedSum += (score / 100) * weight;
  }

  result.overall = Math.round(weightedSum * 100);
  return result as DocumentCompleteness;
}
