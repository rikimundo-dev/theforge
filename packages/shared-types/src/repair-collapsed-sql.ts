/**
 * SQL pegado en una sola línea (chat/Word) → bloque ```sql multilínea.
 */

export interface SqlCreateStatement {
  comment?: string;
  name: string;
  body: string;
}

/** Parte el interior de CREATE TABLE (…) respetando paréntesis en CHECK, etc. */
export function splitSqlColumnDefs(inner: string): string[] {
  const cols: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < inner.length) {
    if (inner.slice(i, i + 2) === "--") {
      i += 2;
      while (i < inner.length) {
        if (inner[i] === "," && depth === 0) {
          i++;
          break;
        }
        if (inner[i] === "(") depth++;
        else if (inner[i] === ")") depth--;
        i++;
      }
      continue;
    }
    const ch = inner[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      const part = inner.slice(start, i).trim();
      if (part) cols.push(part);
      start = i + 1;
    }
    i++;
  }
  const last = inner.slice(start).trim();
  if (last) cols.push(last);
  return cols;
}

/** Extrae CREATE TABLE … ); de texto colapsado (espacios/newlines arbitrarios). */
export function extractCreateStatements(sql: string): SqlCreateStatement[] {
  const s = sql.replace(/\s+/g, " ").trim();
  const results: SqlCreateStatement[] = [];
  const re = /(?:--\s*(.*?)\s*)?CREATE TABLE\s+(\w+)\s*\(/gi;
  const hits: { comment?: string; name: string; open: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    hits.push({
      comment: m[1]?.trim() || undefined,
      name: m[2]!,
      open: m.index + m[0].length,
    });
  }
  for (let h = 0; h < hits.length; h++) {
    const { comment, name, open } = hits[h]!;
    let depth = 1;
    let i = open;
    while (i < s.length && depth > 0) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") depth--;
      i++;
    }
    const body = s.slice(open, i - 1).trim();
    results.push({ comment, name, body });
  }
  return results;
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
  const stmts = extractCreateStatements(raw);
  if (stmts.length === 0) return null;
  return stmts.map(formatCreateStatement).join("\n\n");
}

function lineLooksCollapsedSql(t: string): boolean {
  if (!/CREATE TABLE/i.test(t)) return false;
  return (
    t.length > 100 ||
    /--\s*[^\n]*CREATE TABLE/i.test(t) ||
    (t.match(/CREATE TABLE/gi)?.length ?? 0) > 1 ||
    /\)\s*;\s*--/.test(t) ||
    /nombre_VARCHAR|NOT NULL_REFERENCES|REFERENCES_\w|DEFAULT_NOW/i.test(t)
  );
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

    const isEsquemaHeading = /^(#{1,4}\s+)?Esquema SQL\b/i.test(t);
    if (isEsquemaHeading || lineLooksCollapsedSql(t)) {
      if (isEsquemaHeading) {
        out.push(/^#{1,4}\s/.test(t) ? line : `### ${t}`);
        i++;
      }

      const chunk: string[] = [];
      while (i < lines.length) {
        const lt = lines[i]!.trim();
        if (!lt) {
          i++;
          continue;
        }
        if (/^```/.test(lt)) break;
        if (/^#{1,6}\s/.test(lt) && !/^Esquema SQL/i.test(lt)) break;
        if (lineLooksCollapsedSql(lt) || /^--\s*Tabla espejo/i.test(lt) || /^CREATE TABLE/i.test(lt)) {
          chunk.push(lt);
          i++;
        } else if (chunk.length > 0) break;
        else i++;
      }

      const expanded = expandCollapsedSqlText(chunk.join(" "));
      if (expanded) {
        out.push("");
        out.push("```sql");
        out.push(expanded);
        out.push("```");
        out.push("");
      } else if (chunk.length > 0) {
        out.push(...chunk);
      }
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}
