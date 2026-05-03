import { PlanningDocumentFields, CrossDocumentGap } from "./estimation.types";

/**
 * Extrae nombres de módulos/entidades de un texto markdown.
 * Busca ## Títulos H2, **negritas**, listas con conceptos clave.
 */
export function extractConcepts(text: string): Set<string> {
  const s = new Set<string>();
  const lower = text.toLowerCase();

  // H2 titles (## Section Name)
  const h2 = lower.matchAll(/^##\s+(.+)$/gm);
  for (const m of h2) {
    const t = m[1].trim();
    if (t.length > 3 && t.length <= 100 && !/^(objetivos?|alcance|criterios?\s+de\s+éxito|para\s+quién|fuera\s+del\s+alcance|dentro\s+del\s+(mvp|alcance)|dependencias\s+conocidas|supuestos|riesgos|métricas\s+de\s+éxito|público\s+objetivo|descripción|justificación|contexto|introducción|definiciones|siglas|referencias|anexos|glosario|conclusiones|próximos\s+pasos|roadmap|plan\s+de\s+trabajo|entregables|cronograma|diagramas|vista\s+general|arquitectura\s+general)$/i.test(t)) s.add(t);
  }

  // Bold phrases (3-60 chars)
  const bold = lower.matchAll(/\*\*(.{3,60}?)\*\*/g);
  for (const m of bold) {
    const t = m[1].trim();
    if (t.length > 3) s.add(t);
  }

  // Bullet items starting with capitalized word (likely a concept)
  const bullets = lower.matchAll(/^[-*]\s+([a-záéíóúñ][a-záéíóúñ\s]{3,80})$/gim);
  for (const m of bullets) {
    const t = m[1].trim();
    if (t.length > 3 && t.length <= 100) s.add(t);
  }

  return s;
}

/**
 * Verifica si un concepto (set de palabras clave) aparece en un texto destino.
 * Retorna ratio 0-1 de palabras significativas que coinciden.
 */
function conceptCoverage(concept: string, targetText: string): number {
  const words = concept
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-záéíóúñ]+|[^a-záéíóúñ]+$/g, ""))
    .filter((w) => w.length > 3 && !["para", "como", "más", "que", "con", "por", "del", "las", "los"].includes(w));

  if (words.length === 0) return 0;
  const tgt = targetText.toLowerCase();
  const matches = words.filter((w) => tgt.includes(w)).length;
  return matches / words.length;
}

/**
 * Evalúa cobertura transversal: conceptos de documentos fuente (BRD, To-Be, SPEC, Casos de Uso)
 * que aparecen en documentos técnicos (MDD, Arquitectura, API Contratos, Flujos, Infra).
 *
 * Retorna score 0-100 y gaps detectados.
 */
export function computeCrossDocumentConsistency(
  docs: PlanningDocumentFields,
): { score: number; gaps: CrossDocumentGap[] } {
  const gaps: CrossDocumentGap[] = [];

  // Documentos fuente (especificación)
  const sources: Array<{ name: string; content: string }> = [];
  if (docs.brdContent?.trim()) sources.push({ name: "BRD", content: docs.brdContent });
  if (docs.toBeManualContent?.trim()) sources.push({ name: "To-Be", content: docs.toBeManualContent });
  if (docs.specContent?.trim()) sources.push({ name: "SPEC", content: docs.specContent });
  if (docs.useCasesContent?.trim()) sources.push({ name: "CasosDeUso", content: docs.useCasesContent });

  // Documentos destino (implementación técnica)
  const targets: Array<{ name: string; content: string }> = [];
  if (docs.architectureContent?.trim()) targets.push({ name: "Arquitectura", content: docs.architectureContent });
  if (docs.apiContractsContent?.trim()) targets.push({ name: "API", content: docs.apiContractsContent });
  if (docs.logicFlowsContent?.trim()) targets.push({ name: "Flujos", content: docs.logicFlowsContent });
  if (docs.infraContent?.trim()) targets.push({ name: "Infra", content: docs.infraContent });

  // Si no hay fuentes ni destinos, score neutral
  if (sources.length === 0 || targets.length === 0) {
    return { score: 50, gaps: [] };
  }

  let totalChecks = 0;
  let coveredChecks = 0;

  for (const src of sources) {
    const concepts = extractConcepts(src.content);
    if (concepts.size === 0) continue;

    // Unir texto de todos los targets para búsqueda
    const mergedTargetText = targets.map((t) => t.content).join("\n");

    for (const concept of concepts) {
      totalChecks++;
      const ratio = conceptCoverage(concept, mergedTargetText);

      if (ratio < 0.33) {
        // Encontrar qué target tiene mejor cobertura (o ninguno)
        let bestTarget = "ninguno";
        let bestRatio = 0;
        for (const tgt of targets) {
          const r = conceptCoverage(concept, tgt.content);
          if (r > bestRatio) {
            bestRatio = r;
            bestTarget = r >= 0.33 ? tgt.name : tgt.name;
          }
        }
        if (bestRatio < 0.33) {
          gaps.push({
            from: src.name,
            to: bestTarget,
            concept: concept.slice(0, 80),
            severity: bestRatio === 0 ? "missing" : "partial",
          });
        } else {
          coveredChecks++;
        }
      } else {
        coveredChecks++;
      }
    }
  }

  const score = totalChecks > 0 ? Math.round((coveredChecks / totalChecks) * 100) : 50;

  // Deducir gaps duplicados (mismo concepto, misma fuente, mismo destino)
  const seen = new Set<string>();
  const deduped: CrossDocumentGap[] = [];
  for (const g of gaps) {
    const key = `${g.from}|${g.to}|${g.concept}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(g);
    }
  }

  return { score, gaps: deduped.slice(0, 20) };
}
