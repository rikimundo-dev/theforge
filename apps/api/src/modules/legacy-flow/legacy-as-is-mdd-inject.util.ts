/**
 * Inyecta evidencia estructurada del `codebaseDoc` (Ariadne) en §3–§4 del MDD AS-IS (etapa 1).
 * Evita que el LLM resuma entidades/API en listas tipo «Otras entidades (60+ adicionales)».
 */

const REPO_HEADER_RE = /^##\s+Repositorio:\s*(.+?)(?:\s*\(|$)/gim;

const ENTITY_SUMMARY_PATTERNS = [
  /Otras entidades significativas[^\n]*/gi,
  /\(\d+\+\s*adicionales?\)/gi,
  /y\s+\d+\+\s*entidades?\s+m[aá]s[^\n]*/gi,
  /(?:^|\n)(?:[-*]\s*)?(?:Entidades?\s+)?(?:adicionales?|restantes?)\s*:\s*[^\n]+\n(?:[-*]\s*[^\n]+\n)*/gi,
];

function extractSubsectionBody(chunk: string, heading: string): string {
  const re = new RegExp(`###\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n###\\s+|\\n##\\s+|$)`, "i");
  const m = chunk.match(re);
  if (!m?.[1]) return "";
  return m[1].trim();
}

function splitCodebaseDocByRepo(codebaseDoc: string): Array<{ label: string; body: string }> {
  const doc = codebaseDoc.trim();
  if (!doc) return [];

  const headers: Array<{ label: string; start: number }> = [];
  let m: RegExpExecArray | null;
  REPO_HEADER_RE.lastIndex = 0;
  while ((m = REPO_HEADER_RE.exec(doc)) !== null) {
    headers.push({ label: m[1].trim(), start: m.index });
  }

  if (headers.length === 0) {
    return [{ label: "", body: doc }];
  }

  const chunks: Array<{ label: string; body: string }> = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]!;
    const end = headers[i + 1]?.start ?? doc.length;
    chunks.push({ label: h.label, body: doc.slice(h.start, end).trim() });
  }
  return chunks;
}

function buildRepoScopedBlock(
  chunks: Array<{ label: string; body: string }>,
  subsectionHeading: string,
  emptyFallback: string,
): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    const table = extractSubsectionBody(chunk.body, subsectionHeading);
    if (!table) continue;
    if (chunk.label) {
      parts.push(`### ${chunk.label}`, "", table);
    } else {
      parts.push(`### ${subsectionHeading}`, "", table);
    }
  }
  if (parts.length === 0) return emptyFallback;
  return parts.join("\n\n");
}

/** Markdown de inventario de entidades listo para §3 (desde codebaseDoc). */
export function buildAsIsSection3BodyFromCodebaseDoc(codebaseDoc: string): string | null {
  const chunks = splitCodebaseDocByRepo(codebaseDoc);
  const block = buildRepoScopedBlock(
    chunks,
    "Entidades y modelo de datos",
    "",
  );
  if (!block.trim()) {
    const single = extractSubsectionBody(codebaseDoc, "Entidades y modelo de datos");
    if (!single.trim()) return null;
    return `### Entidades y modelo de datos\n\n${single}`;
  }
  return (
    "_Inventario indexado (Ariadne). **Prohibido** resumir entidades en listas separadas por comas o bloques «N adicionales»; " +
    "cada entidad debe aparecer en la tabla con origen y atributos de muestra._\n\n" +
    block
  );
}

/** Markdown de contratos API listo para §4 (desde codebaseDoc). */
export function buildAsIsSection4BodyFromCodebaseDoc(codebaseDoc: string): string | null {
  const chunks = splitCodebaseDocByRepo(codebaseDoc);
  const block = buildRepoScopedBlock(chunks, "Contratos API", "");
  if (!block.trim()) {
    const single = extractSubsectionBody(codebaseDoc, "Contratos API");
    if (!single.trim()) return null;
    return `### Contratos API\n\n${single}`;
  }
  return (
    "_Contratos REST/indexados por repo. No omitir rutas por resumen; usar tablas completas de la doc. de partida._\n\n" +
    block
  );
}

function findMddSectionBounds(mdd: string, sectionNum: number): { start: number; bodyStart: number; end: number } | null {
  const headerRe = new RegExp(`^##\\s*${sectionNum}\\.\\s*[^\\n]*`, "gim");
  const headerMatch = headerRe.exec(mdd);
  if (!headerMatch) return null;

  const start = headerMatch.index;
  const bodyStart = start + headerMatch[0].length;
  const nextRe = new RegExp(`^##\\s*${sectionNum + 1}\\.\\s*`, "gim");
  nextRe.lastIndex = bodyStart;
  const nextMatch = nextRe.exec(mdd);
  const end = nextMatch ? nextMatch.index : mdd.length;
  return { start, bodyStart, end };
}

function replaceMddSectionBody(mdd: string, sectionNum: number, newBody: string): string {
  const bounds = findMddSectionBounds(mdd, sectionNum);
  if (!bounds) return mdd;
  const before = mdd.slice(0, bounds.bodyStart);
  const after = mdd.slice(bounds.end);
  const body = newBody.trim() ? `\n\n${newBody.trim()}\n\n` : "\n\n";
  return before + body + after;
}

/** Elimina patrones típicos de resumen de entidades que el LLM añade pese a tener tablas. */
export function stripEntitySummaryPlaceholders(section3: string): string {
  let out = section3;
  for (const re of ENTITY_SUMMARY_PATTERNS) {
    out = out.replace(re, "");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sustituye §3 y §4 del MDD AS-IS con tablas completas del `codebaseDoc` cuando existen.
 * Idempotente: re-ejecutar mantiene el mismo inventario (no duplica bloques).
 */
export function injectAsIsCodebaseEvidenceIntoMdd(mddContent: string, codebaseDoc: string): string {
  const mdd = mddContent.trim();
  const doc = codebaseDoc.trim();
  if (!mdd || !doc) return mddContent;

  let out = mdd;
  const section3 = buildAsIsSection3BodyFromCodebaseDoc(doc);
  if (section3) {
    out = replaceMddSectionBody(out, 3, section3);
  } else {
    const bounds = findMddSectionBounds(out, 3);
    if (bounds) {
      const currentBody = out.slice(bounds.bodyStart, bounds.end);
      const cleaned = stripEntitySummaryPlaceholders(currentBody);
      if (cleaned !== currentBody.trim()) {
        out = out.slice(0, bounds.bodyStart) + `\n\n${cleaned}\n\n` + out.slice(bounds.end);
      }
    }
  }

  const section4 = buildAsIsSection4BodyFromCodebaseDoc(doc);
  if (section4) {
    out = replaceMddSectionBody(out, 4, section4);
  }

  return out;
}

export function isLegacyAsIsMddEvidenceInjectEnabled(): boolean {
  const v = process.env.LEGACY_AS_IS_MDD_EVIDENCE_INJECT?.trim().toLowerCase();
  if (v === undefined || v === "") return true;
  return !["0", "false", "off", "no"].includes(v);
}
