/**
 * SQL pegado en una sola línea (chat/Word) → bloque ```sql multilínea.
 */

const SQL_GLUE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/DEFAULT_NOW\(\)/gi, "DEFAULT NOW()"],
  [/DEFAULT_gen_random_uuid\(\)/gi, "DEFAULT gen_random_uuid()"],
  [/NOT_NULL_REFERENCES/gi, "NOT NULL REFERENCES"],
  [/UUID\s+NOT\s+NULL_REFERENCES/gi, "UUID NOT NULL REFERENCES"],
  [/UUID_REFERENCES/gi, "UUID REFERENCES"],
  [/REFERENCES_([a-z_]+)/gi, "REFERENCES $1"],
  [/([a-z])_(VARCHAR|TEXT|JSONB|BOOLEAN|INTEGER|BIGINT|DECIMAL|TIMESTAMPTZ|INET)\b/gi, "$1 $2"],
  [/(?<![a-z])_(UUID)\b/g, " UUID"],
  [/_(NOT\s+NULL)\b/gi, " $1"],
  [/_(ON\s+DELETE)\b/gi, " $1"],
  [/_(PRIMARY\s+KEY)\b/gi, " $1"],
  [/_(REFERENCES)([a-z_])/gi, " REFERENCES$2"],
  [/_(REFERENCES)\b/gi, " REFERENCES"],
  [/([a-z_])_(ON|DEFAULT)\b/gi, "$1 $2"],
  [/\bON_(DELETE|UPDATE|CASCADE|RESTRICT|SET|NO\s+ACTION)\b/gi, "ON $1"],
  [/regiON\s+estado\s*\(/gi, "region_estado("],
  [/^_(CREATE|INDEX)\b/gim, "$1"],
];

function normalizeGluedSqlTokens(sql: string): string {
  let out = sql;
  for (const [re, rep] of SQL_GLUE_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  return out.replace(/idx_[a-z0-9_]+_ON_/gi, (m) => m.replace(/_ON_/, "_ON "));
}

export interface SqlCreateStatement {
  comment?: string;
  name: string;
  body: string;
}

const NEXT_COL_RE =
  /^[a-z_][\w]*\s+(?:UUID|VARCHAR|TEXT|INTEGER|BOOLEAN|BIGINT|JSONB|TIMESTAMPTZ|DECIMAL|CHECK|REFERENCES|UNIQUE|PRIMARY|FOREIGN|CONSTRAINT)/i;

function skipInlineSqlComment(inner: string, start: number, depth: number): number {
  let i = start + 2;
  while (i < inner.length) {
    const ch = inner[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0) {
      const rest = inner.slice(i + (ch === "," ? 1 : 0)).trimStart();
      if (NEXT_COL_RE.test(rest)) {
        return ch === "," ? i + 1 : i;
      }
    }
    if (ch === "," && depth === 0) {
      const rest = inner.slice(i + 1).trimStart();
      if (NEXT_COL_RE.test(rest)) return i + 1;
    }
    i++;
  }
  return i;
}

/** Quita comentarios `--` inline antes de la siguiente columna. */
export function stripInlineSqlComments(body: string): string {
  let out = "";
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    if (body.slice(i, i + 2) === "--" && depth === 0) {
      i = skipInlineSqlComment(body, i, depth);
      continue;
    }
    const ch = body[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    out += ch;
    i++;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Parte el interior de CREATE TABLE (…) respetando paréntesis y comentarios `--` inline. */
export function splitSqlColumnDefs(inner: string): string[] {
  const normalized = stripInlineSqlComments(inner);
  const cols: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < normalized.length) {
    const ch = normalized[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      const part = normalized.slice(start, i).trim();
      if (part) cols.push(part);
      start = i + 1;
    }
    i++;
  }
  const last = normalized.slice(start).trim();
  if (last) cols.push(last);
  return cols;
}

function readTableCommentBeforeCreate(before: string): string | undefined {
  let lastIdx = -1;
  for (const re of [/--\s*Tabla espejo/gi, /--\s*Índices/gi]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(before)) !== null) {
      lastIdx = m.index;
    }
  }
  if (lastIdx < 0) return undefined;
  let comment = before.slice(lastIdx + 2).trim();
  const cut = comment.search(/\sCREATE (?:TABLE|INDEX)\s/i);
  if (cut > 0) comment = comment.slice(0, cut).trim();
  return comment || undefined;
}

function splitEmbeddedEsquemaSections(chunk: string): string[] {
  const parts = chunk
    .split(/\s+(?=Esquema SQL para tablas espejo)/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [chunk.trim()];
}

/** Extrae CREATE TABLE … ); de texto colapsado (espacios/newlines arbitrarios). */
export function extractCreateStatements(sql: string): SqlCreateStatement[] {
  const s = sql.replace(/\s+/g, " ").trim();
  const results: SqlCreateStatement[] = [];
  const createRe = /CREATE TABLE\s+(\w+)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(s)) !== null) {
    const name = m[1]!;
    const open = m.index + m[0].length;
    let depth = 1;
    let i = open;
    while (i < s.length && depth > 0) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      i++;
    }
    const body = s.slice(open, i - 1).trim();
    const before = s.slice(0, m.index).trimEnd();
    const comment = readTableCommentBeforeCreate(before);
    results.push({ comment, name, body });
  }
  return results;
}

export function extractCreateIndexStatements(sql: string): string[] {
  const s = sql.replace(/\s+/g, " ").trim();
  const re = /CREATE INDEX\s+(\S+)\s+ON\s+(\S+)\s*\([^)]+\)\s*;?/gi;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const stmt = m[0].trim();
    lines.push(stmt.endsWith(";") ? stmt : `${stmt};`);
  }
  return lines;
}

export function formatCreateStatement(stmt: SqlCreateStatement): string {
  const cols = splitSqlColumnDefs(stmt.body);
  const lines: string[] = [];
  if (stmt.comment) lines.push(`-- ${stmt.comment}`);
  lines.push(`CREATE TABLE ${stmt.name} (`);
  cols.forEach((col, idx) => {
    lines.push(`  ${col}${idx < cols.length - 1 ? "," : ""}`);
  });
  lines.push(");");
  return lines.join("\n");
}

export function expandCollapsedSqlText(raw: string): string | null {
  if (!/CREATE TABLE/i.test(raw)) return null;
  const normalized = normalizeGluedSqlTokens(raw.replace(/\s+/g, " ").trim());
  const stmts = extractCreateStatements(normalized);
  if (stmts.length === 0) return null;
  const blocks = stmts.map(formatCreateStatement);
  const indexes = extractCreateIndexStatements(normalized);
  if (indexes.length > 0) {
    blocks.push(indexes.join("\n"));
  }
  return blocks.join("\n\n");
}

export function lineLooksCollapsedSql(t: string): boolean {
  if (!/CREATE TABLE/i.test(t)) return false;
  return (
    t.length > 100 ||
    /--\s*[^\n]*CREATE TABLE/i.test(t) ||
    (t.match(/CREATE TABLE/gi)?.length ?? 0) > 1 ||
    /\)\s*;\s*--/.test(t) ||
    /CREATE INDEX\s+\S+\s+ON\s+\S+\([^)]+\)/i.test(t) ||
    /nombre_VARCHAR|NOT NULL_REFERENCES|REFERENCES_\w|DEFAULT_NOW/i.test(t)
  );
}

/** Separa título "Esquema SQL …" del SQL pegado en la misma línea. */
export function splitEsquemaSqlHeadingFromPayload(line: string): {
  heading: string;
  rest: string;
} | null {
  const t = line.trim();
  if (!/\bEsquema SQL\b/i.test(t)) return null;
  const payloadIdx = t.search(
    /\s+(?=(?:--\s*(?:Tabla espejo|Índices\b)|CREATE\s+(?:TABLE|INDEX)\b))/i,
  );
  if (payloadIdx <= 0) return null;
  const heading = t.slice(0, payloadIdx).trim();
  const rest = t.slice(payloadIdx).trim();
  if (!/^Esquema SQL/i.test(heading.replace(/^#{1,4}\s+/, ""))) return null;
  if (!rest || !/CREATE\s+(TABLE|INDEX)|--\s*Tabla/i.test(rest)) return null;
  return { heading, rest };
}

function formatEsquemaHeading(heading: string): string {
  const h = heading.trim();
  return /^#{1,4}\s/.test(h) ? h : `### ${h}`;
}

function emitSqlChunk(out: string[], chunkParts: string[]): boolean {
  if (chunkParts.length === 0) return false;
  const joined = chunkParts.join(" ");
  const sections = splitEmbeddedEsquemaSections(joined);
  const expandedBlocks: string[] = [];
  for (const section of sections) {
    const expanded = expandCollapsedSqlText(section);
    if (expanded) expandedBlocks.push(expanded);
  }
  if (expandedBlocks.length === 0) return false;
  out.push("");
  out.push("```sql");
  out.push(expandedBlocks.join("\n\n"));
  out.push("```");
  out.push("");
  return true;
}

function collectCollapsedSqlChunk(
  lines: string[],
  startIdx: number,
): { chunk: string[]; nextIdx: number; nestedHeading?: string } {
  const chunk: string[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const lt = lines[i]!.trim();
    if (!lt) {
      i++;
      continue;
    }
    if (/^```/.test(lt)) break;

    const innerSplit = splitEsquemaSqlHeadingFromPayload(lt);
    if (innerSplit) {
      if (chunk.length > 0) {
        return { chunk, nextIdx: i, nestedHeading: innerSplit.heading };
      }
      return {
        chunk: [innerSplit.rest],
        nextIdx: i + 1,
        nestedHeading: innerSplit.heading,
      };
    }

    if (/^#{1,6}\s/.test(lt) && !/^Esquema SQL/i.test(lt)) break;
    if (
      lineLooksCollapsedSql(lt) ||
      /^--\s*(?:Tabla espejo|Índices\b)/i.test(lt) ||
      /^CREATE (TABLE|INDEX)\b/i.test(lt)
    ) {
      chunk.push(lt);
      i++;
    } else if (chunk.length > 0) {
      break;
    } else {
      i++;
    }
  }
  return { chunk, nextIdx: i };
}

/**
 * Secciones "Esquema SQL …" y párrafos con CREATE colapsado → ```sql.
 */
export function repairCollapsedSqlParagraphs(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();

    if (/^```/.test(t)) {
      inFence = t !== "```";
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    const headingSplit = splitEsquemaSqlHeadingFromPayload(t);
    const isEsquemaHeading = /^(#{1,4}\s+)?Esquema SQL\b/i.test(t);
    const isCollapsed = lineLooksCollapsedSql(t);

    if (!headingSplit && !isEsquemaHeading && !isCollapsed) {
      out.push(line);
      continue;
    }

    if (headingSplit) {
      out.push(formatEsquemaHeading(headingSplit.heading));
      let collected = collectCollapsedSqlChunk(lines, i + 1);
      const chunk = [headingSplit.rest, ...collected.chunk];
      if (!emitSqlChunk(out, chunk)) out.push(headingSplit.rest);
      i = collected.nextIdx - 1;
      while (collected.nestedHeading) {
        out.push(formatEsquemaHeading(collected.nestedHeading));
        collected = collectCollapsedSqlChunk(lines, i + 1);
        if (!emitSqlChunk(out, collected.chunk) && collected.chunk.length > 0) {
          out.push(...collected.chunk);
        }
        i = collected.nextIdx - 1;
      }
      continue;
    }

    if (isEsquemaHeading) {
      out.push(formatEsquemaHeading(t));
      i++;
      let collected = collectCollapsedSqlChunk(lines, i);
      if (!emitSqlChunk(out, collected.chunk) && collected.chunk.length > 0) {
        out.push(...collected.chunk);
      }
      i = collected.nextIdx - 1;
      while (collected.nestedHeading) {
        out.push(formatEsquemaHeading(collected.nestedHeading));
        collected = collectCollapsedSqlChunk(lines, i + 1);
        if (!emitSqlChunk(out, collected.chunk) && collected.chunk.length > 0) {
          out.push(...collected.chunk);
        }
        i = collected.nextIdx - 1;
      }
      continue;
    }

    let collected = collectCollapsedSqlChunk(lines, i);
    if (!emitSqlChunk(out, collected.chunk) && collected.chunk.length > 0) {
      out.push(...collected.chunk);
    }
    i = collected.nextIdx - 1;
  }

  return out.join("\n");
}

/** Expande SQL colapsado dentro de bloques ```sql existentes. */
export function repairCollapsedSqlInsideFences(text: string): string {
  return text.replace(/```sql\n([\s\S]*?)```/gi, (match, body: string) => {
    const collapsed = body.replace(/\s+/g, " ").trim();
    if (!lineLooksCollapsedSql(collapsed)) return match;
    const expanded = expandCollapsedSqlText(collapsed);
    if (!expanded) return match;
    return `\`\`\`sql\n${expanded}\n\`\`\``;
  });
}
