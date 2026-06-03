import { PlanningDocumentFields, CrossDocumentGap } from "./estimation.types";

/** @deprecated Usar {@link extractBrdBusinessConcepts} para trazabilidad BRD→MDD. */
export function extractConcepts(text: string): Set<string> {
  return new Set(extractBrdBusinessConcepts(text));
}

const NOISE_WORDS = new Set([
  "necesidad",
  "necesidades",
  "objetivo",
  "objetivos",
  "alcance",
  "contexto",
  "resumen",
  "descripción",
  "descripcion",
  "introducción",
  "introduccion",
  "supuestos",
  "riesgos",
  "métricas",
  "metricas",
  "validación",
  "validacion",
  "demanda",
  "problema",
  "solución",
  "solucion",
  "usuario",
  "usuarios",
  "rol",
  "roles",
  "notas",
  "anexo",
  "anexos",
  "versión",
  "version",
  "fecha",
  "tabla",
  "sección",
  "seccion",
]);

const SKIP_H2 =
  /^(?:\d+\.\s*)?(?:contexto|pain points|problema y objetivos|usuarios y casos|l[ií]mites del alcance|fuera de alcance|supuestos|riesgos|m[eé]tricas|pendientes de validaci|registro de cambios|decision log|validaci[oó]n de demanda|impacto financiero|dentro del alcance)/i;

const RELEVANT_H2 =
  /^(?:\d+\.\s*)?(?:capacidades funcional|reglas de negocio|requisitos funcionales|flujos de negocio|definici[oó]n de entidades|criterios de aceptaci|matriz de permisos|requisitos de experiencia|pol[ií]ticas)/i;

function normalizeConcept(raw: string): string {
  return raw
    .replace(/\*\*/g, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isNoiseConcept(concept: string): boolean {
  const t = concept.trim().toLowerCase();
  if (t.length < 8) return true;
  if (NOISE_WORDS.has(t)) return true;
  if (/^(?:dado|cuando|entonces)\s*$/i.test(t)) return true;
  if (/^\[object object\]$/i.test(t)) return true;
  const words = t.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return true;
  if (words.length === 1 && words[0]!.length < 10) return true;
  return false;
}

/**
 * Extrae capacidades, reglas, UAT y entidades de negocio del BRD (sin ruido estructural).
 */
export function extractBrdBusinessConcepts(brdText: string): string[] {
  const concepts: string[] = [];
  const lines = (brdText ?? "").split("\n");
  let inRelevant = false;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      const title = h2[1] ?? "";
      if (SKIP_H2.test(title)) {
        inRelevant = false;
        continue;
      }
      inRelevant = RELEVANT_H2.test(title);
      continue;
    }

    if (!inRelevant) continue;

    const h3 = line.match(/^###\s+(.+)/);
    if (h3) {
      const c = normalizeConcept(h3[1] ?? "");
      if (!isNoiseConcept(c)) concepts.push(c);
      continue;
    }

    if (/^(?:-\s*)?(?:dado|cuando|entonces)\s+/i.test(line)) {
      const c = normalizeConcept(line);
      if (!isNoiseConcept(c) && c.length >= 20) concepts.push(c.slice(0, 120));
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      const c = normalizeConcept(bullet[1] ?? "");
      if (!isNoiseConcept(c)) concepts.push(c.slice(0, 100));
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of concepts) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.slice(0, 35);
}

function extractMddSection(md: string, headingRe: RegExp): string {
  const m = headingRe.exec(md);
  if (m?.index == null) return "";
  const start = m.index;
  const rest = md.slice(start + 1);
  const next = rest.search(/^##\s+/m);
  const body = next >= 0 ? md.slice(start, start + 1 + next) : md.slice(start);
  return body.trim();
}

/** Corpus MDD donde debe reflejarse el negocio: §1 Contexto, §4 API, §5 Lógica. */
export function extractMddTraceabilityCorpus(mddText: string): string {
  const md = (mddText ?? "").trim();
  if (!md) return "";
  const parts = [
    extractMddSection(md, /^##\s*(?:1\.\s*)?(?:contexto\s+y\s+alcance|contexto\b)/im),
    extractMddSection(md, /^##\s*(?:4\.\s*)?(?:contratos\s+de\s+api|contratos\s+api|api\b)/im),
    extractMddSection(md, /^##\s*(?:5\.\s*)?(?:l[oó]gica|logic)/im),
  ].filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : md;
}

function conceptCoverage(concept: string, targetText: string): number {
  const words = concept
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-záéíóúñ0-9]+|[^a-záéíóúñ0-9]+$/gi, ""))
    .filter((w) => w.length > 3 && !NOISE_WORDS.has(w));

  if (words.length === 0) return 0;
  const tgt = targetText.toLowerCase();
  const matches = words.filter((w) => tgt.includes(w)).length;
  return matches / words.length;
}

/**
 * Trazabilidad BRD (negocio) → MDD / Spec (técnico).
 * Ya no compara BRD con Arquitectura/API por keywords sueltos.
 */
export function computeCrossDocumentConsistency(
  docs: PlanningDocumentFields,
): { score: number; gaps: CrossDocumentGap[] } {
  const brd = docs.brdContent?.trim() ?? "";
  const mdd = docs.mddContent?.trim() ?? "";
  const spec = docs.specContent?.trim() ?? "";

  if (!brd) {
    return { score: 50, gaps: [] };
  }

  const concepts = extractBrdBusinessConcepts(brd);
  if (concepts.length === 0) {
    return { score: 50, gaps: [] };
  }

  const targets: Array<{ name: string; content: string }> = [];
  if (mdd) {
    targets.push({ name: "MDD", content: extractMddTraceabilityCorpus(mdd) });
  }
  if (spec) {
    targets.push({ name: "Spec", content: spec });
  }

  if (targets.length === 0) {
    return { score: 50, gaps: [] };
  }

  const gaps: CrossDocumentGap[] = [];
  let totalChecks = 0;
  let coveredChecks = 0;

  for (const concept of concepts) {
    totalChecks++;
    let bestTarget = targets[0]!.name;
    let bestRatio = 0;

    for (const tgt of targets) {
      const r = conceptCoverage(concept, tgt.content);
      if (r > bestRatio) {
        bestRatio = r;
        bestTarget = tgt.name;
      }
    }

    if (bestRatio >= 0.4) {
      coveredChecks++;
    } else if (bestRatio >= 0.2) {
      gaps.push({
        from: "BRD",
        to: bestTarget,
        concept: concept.slice(0, 80),
        severity: "partial",
      });
    } else {
      gaps.push({
        from: "BRD",
        to: bestRatio > 0 ? bestTarget : "MDD",
        concept: concept.slice(0, 80),
        severity: "missing",
      });
    }
  }

  const score = totalChecks > 0 ? Math.round((coveredChecks / totalChecks) * 100) : 50;

  const seen = new Set<string>();
  const deduped: CrossDocumentGap[] = [];
  for (const g of gaps) {
    const key = `${g.from}|${g.to}|${g.concept}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(g);
    }
  }

  return { score, gaps: deduped.slice(0, 15) };
}
