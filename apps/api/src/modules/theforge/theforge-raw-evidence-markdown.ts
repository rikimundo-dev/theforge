/**
 * Convierte el JSON de `ask_codebase` + `responseMode: raw_evidence` (Ariadne ingest)
 * en markdown legible para prompts Nest (evita volcar `gatheredContext` como un solo JSON escapado).
 *
 * Por defecto **no** hay truncado ni troceo: todo el contenido. Solo si defines la variable de entorno
 * con un entero **> 0** se aplica ese tope (capacidad operativa en despliegues muy grandes).
 */
function rawEvidenceLimitFromEnv(envKey: string): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw.trim() === "") return Number.POSITIVE_INFINITY;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return Number.POSITIVE_INFINITY;
  return n;
}

function rawEvidenceGatheredMaxChars(): number {
  return rawEvidenceLimitFromEnv("RAW_EVIDENCE_GATHERED_MAX_CHARS");
}

function rawEvidenceChunkTailMax(): number {
  return rawEvidenceLimitFromEnv("RAW_EVIDENCE_CHUNK_TAIL_MAX");
}

function rawEvidenceMuestrasPerKey(): number {
  return rawEvidenceLimitFromEnv("RAW_EVIDENCE_MUESTRAS_PER_KEY");
}

function rawEvidenceCollectedMaxRows(): number {
  return rawEvidenceLimitFromEnv("RAW_EVIDENCE_COLLECTED_MAX_ROWS");
}

/** Cierra el objeto JSON que empieza en `openBraceIndex` (primer carácter `{`). */
export function indexOfMatchingJsonObjectEnd(s: string, openBraceIndex: number): number {
  if (s[openBraceIndex] !== "{") return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openBraceIndex; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tryParseFlatConteosObject(s: string): Record<string, number> | null {
  const m = /Conteos:\s*(\{[^}]+\})/.exec(s);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function tryParseMuestrasObject(s: string): Record<string, unknown[]> | null {
  const idx = s.search(/\bMuestras:\s*\{/);
  if (idx < 0) return null;
  const braceStart = s.indexOf("{", idx);
  if (braceStart < 0) return null;
  const end = indexOfMatchingJsonObjectEnd(s, braceStart);
  if (end < braceStart) return null;
  try {
    const parsed = JSON.parse(s.slice(braceStart, end + 1)) as Record<string, unknown>;
    const out: Record<string, unknown[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function formatMuestrasMarkdown(muestras: Record<string, unknown[]>): string {
  const perKey = rawEvidenceMuestrasPerKey();
  const lines: string[] = [];
  for (const [label, arr] of Object.entries(muestras)) {
    const take = Number.isFinite(perKey) && perKey > 0 ? Math.min(arr.length, perKey) : arr.length;
    lines.push(`##### ${label} (${take} de ${arr.length})`);
    lines.push("");
    for (let i = 0; i < take; i++) {
      const row = arr[i];
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const o = row as Record<string, unknown>;
        const p = o.path != null ? String(o.path) : "";
        const n = o.name != null ? String(o.name) : "";
        const method = o.method != null ? String(o.method) : "";
        const pathTemplate = o.pathTemplate != null ? String(o.pathTemplate) : "";
        if (p && n) lines.push(`- \`${p}\` — ${n}`);
        else if (pathTemplate && method) lines.push(`- \`${method} ${pathTemplate}\``);
        else if (p) lines.push(`- \`${p}\``);
        else if (n) lines.push(`- ${n}`);
        else lines.push(`- ${JSON.stringify(row)}`);
      } else {
        lines.push(`- ${String(row)}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatGatheredChunk(chunk: string): string {
  const trimmed = chunk.trim();
  if (!trimmed) return "";
  const det = /^\[deterministic:[^\]]+\]/.exec(trimmed);
  const heading = det ? `#### ${det[0]}` : "#### Bloque";
  const inner = det ? trimmed.slice(det[0].length).trim() : trimmed;

  const parts: string[] = [heading, ""];

  const conteos = tryParseFlatConteosObject(inner);
  if (conteos) {
    parts.push("**Conteos (nodos por etiqueta)**");
    parts.push("");
    parts.push("| Etiqueta | Cantidad |");
    parts.push("| --- | ---: |");
    for (const [k, v] of Object.entries(conteos)) {
      parts.push(`| ${k} | ${v} |`);
    }
    parts.push("");
  }

  const muestras = tryParseMuestrasObject(inner);
  if (muestras) {
    parts.push("**Muestras**");
    parts.push("");
    parts.push(formatMuestrasMarkdown(muestras));
    parts.push("");
  }

  if (!conteos && !muestras) {
    const max = rawEvidenceChunkTailMax();
    if (Number.isFinite(max) && max > 0 && inner.length > max) {
      parts.push(
        `${inner.slice(0, max)}\n\n_… recorte local (${inner.length} caracteres); RAW_EVIDENCE_CHUNK_TAIL_MAX._`,
      );
    } else {
      parts.push(inner);
    }
  } else {
    const tailMax = rawEvidenceChunkTailMax();
    const muestrasIdx = inner.search(/\bMuestras:\s*\{/);
    if (muestrasIdx >= 0) {
      const braceStart = inner.indexOf("{", muestrasIdx);
      if (braceStart >= 0) {
        const end = indexOfMatchingJsonObjectEnd(inner, braceStart);
        if (end > braceStart) {
          const after = inner.slice(end + 1).trim();
          if (after.length > 0) {
            parts.push("**Resto del bloque**");
            parts.push("");
            if (Number.isFinite(tailMax) && tailMax > 0 && after.length > tailMax) {
              parts.push(`${after.slice(0, tailMax)}\n\n_… RAW_EVIDENCE_CHUNK_TAIL_MAX._`);
            } else {
              parts.push(after);
            }
          }
        }
      }
    }
  }

  return parts.join("\n").trim();
}

/**
 * `gatheredContext` de Ariadne: mezcla de bloques `[deterministic:…]`, conteos planos y JSON "Muestras".
 */
export function formatGatheredContextForMarkdown(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const chunks = t.split(/\n---\s*\n/).map((c) => c.trim()).filter(Boolean);
  const body = chunks.map(formatGatheredChunk).filter(Boolean).join("\n\n---\n\n");
  const max = rawEvidenceGatheredMaxChars();
  if (!Number.isFinite(max) || max <= 0 || body.length <= max) return body;
  return `${body.slice(0, max)}\n\n_… recorte global gatheredContext (${body.length} caracteres); RAW_EVIDENCE_GATHERED_MAX_CHARS._`;
}

/**
 * `collectedResults`: lista compacta en tabla markdown.
 */
export function formatCollectedResultsForMarkdown(v: unknown): string {
  if (!Array.isArray(v)) {
    return "```json\n" + JSON.stringify(v, null, 2) + "\n```";
  }
  const maxRows = rawEvidenceCollectedMaxRows();
  const rows =
    Number.isFinite(maxRows) && maxRows > 0 ? (v.slice(0, maxRows) as Record<string, unknown>[]) : (v as Record<string, unknown>[]);
  const lines = [
    "| tipo | path | name | repoId |",
    "| --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    const tipo = String(r.tipo ?? r.type ?? "");
    const path = String(r.path ?? "");
    const name = String(r.name ?? "");
    const repo = String(r.repoId ?? "");
    lines.push(`| ${tipo.replace(/\|/g, "\\|")} | \`${path.replace(/`/g, "'")}\` | ${name.replace(/\|/g, "\\|")} | \`${repo}\` |`);
  }
  if (Number.isFinite(maxRows) && maxRows > 0 && v.length > maxRows) {
    lines.push("");
    lines.push(`_… +${v.length - maxRows} filas (RAW_EVIDENCE_COLLECTED_MAX_ROWS)._`);
  }
  return lines.join("\n");
}

/** Claves del bundle `raw_evidence` que se expanden a secciones markdown (alineado con `ask_codebase` / Ariadne). */
const RAW_EVIDENCE_MARKDOWN_KEYS = [
  "gatheredContext",
  "collectedResults",
  "cypher",
  "deterministicRetriever",
  "answer",
] as const;

/**
 * Formatea un objeto ya parseado `mode: raw_evidence` (misma salida que tras `askCodebase` + normalización).
 */
export function formatRawEvidenceObjectToMarkdown(parsed: Record<string, unknown>): string {
  const parts: string[] = [
    "## Evidencia (raw_evidence — Ariadne ingest)\n",
    "> Para **JSON MDD ya troceado** (7 claves), usa `responseMode: evidence_first` en `ask_codebase` / UI doc. partida. `raw_evidence` es el bundle determinista del ingest; aquí se **reestructura** en tablas/listas (sin truncar salvo `RAW_EVIDENCE_*` > 0).\n",
  ];
  let any = false;
  for (const k of RAW_EVIDENCE_MARKDOWN_KEYS) {
    if (!(k in parsed)) continue;
    any = true;
    const v = parsed[k];
    let section: string;
    if (k === "gatheredContext" && typeof v === "string") {
      section = formatGatheredContextForMarkdown(v);
    } else if (k === "collectedResults") {
      section = formatCollectedResultsForMarkdown(v);
    } else {
      const body = typeof v === "string" ? v : JSON.stringify(v, null, 2);
      section = `\`\`\`\n${body}\n\`\`\``;
    }
    parts.push(`### ${k}\n\n${section}`);
  }
  if (!any) {
    parts.push("### JSON\n\n```json\n" + JSON.stringify(parsed, null, 2) + "\n```");
  }
  return parts.join("\n\n").trim();
}

const RAW_EVIDENCE_EMBED_HEAD_RE = /\{\s*"mode"\s*:\s*"raw_evidence"/g;

/**
 * Reemplaza en markdown cualquier objeto JSON embebido `{ "mode": "raw_evidence", ... }` (p. ej. pegado por un LLM en el MDD)
 * por el markdown de `formatRawEvidenceObjectToMarkdown`. Idempotente si ya está formateado (no hay ese patrón).
 */
export function normalizeRawEvidenceJsonBlocksInMarkdown(md: string): string {
  if (!md.includes("raw_evidence")) return md;
  const re = new RegExp(RAW_EVIDENCE_EMBED_HEAD_RE.source, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const start = m.index;
    const end = indexOfMatchingJsonObjectEnd(md, start);
    if (end < 0) {
      out += md.slice(last);
      last = md.length;
      break;
    }
    out += md.slice(last, start);
    const slice = md.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.mode === "raw_evidence") {
        out += formatRawEvidenceObjectToMarkdown(parsed);
      } else {
        out += slice;
      }
    } catch {
      out += slice;
    }
    last = end + 1;
    re.lastIndex = last;
  }
  out += md.slice(last);
  return out;
}
