/**
 * Reparaciones heurísticas para markdown pegado desde Word/Excel/chat (sin LLM).
 */

const SQL_GLUE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/DEFAULT_NOW\(\)/gi, "DEFAULT NOW()"],
  [/DEFAULT_gen_random_uuid\(\)/gi, "DEFAULT gen_random_uuid()"],
  [/([a-z])_(VARCHAR|TEXT|JSONB|BOOLEAN|INTEGER|BIGINT|DECIMAL|TIMESTAMPTZ|INET)\b/gi, "$1 $2"],
  [/(?<![a-z])_(UUID)\b/g, " UUID"],
  [/_(NOT\s+NULL)\b/gi, " $1"],
  [/_(ON\s+DELETE)\b/gi, " $1"],
  [/_(PRIMARY\s+KEY)\b/gi, " $1"],
  [/_(REFERENCES)([a-z_])/gi, " REFERENCES$2"],
  [/_(REFERENCES)\b/gi, " REFERENCES"],
  [/([a-z_])_(ON|DEFAULT)\b/gi, "$1 $2"],
  [/^_(CREATE|INDEX)\b/gim, "$1"],
];

/** Cierra bloques ```sql abiertos antes del siguiente encabezado ##. */
export function repairUnclosedCodeFences(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let fenceLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const openMatch = trimmed.match(/^```(\w*)\s*$/);
    if (openMatch) {
      if (inFence) {
        out.push("```");
      }
      inFence = true;
      fenceLang = openMatch[1] ?? "";
      out.push(line);
      continue;
    }
    if (inFence && trimmed === "```") {
      inFence = false;
      fenceLang = "";
      out.push(line);
      continue;
    }
    if (inFence && /^#{1,3}\s+\S/.test(trimmed)) {
      out.push("```");
      inFence = false;
      fenceLang = "";
    }
    out.push(line);
  }
  if (inFence) out.push("```");
  return out.join("\n");
}

/** Bloques de líneas separadas por tab → tabla GFM. */
export function repairTabSeparatedTables(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const tabCount = (line.match(/\t/g) ?? []).length;

    if (
      tabCount >= 1 &&
      !trimmed.startsWith("|") &&
      !trimmed.startsWith("```") &&
      !/^#{1,6}\s/.test(trimmed)
    ) {
      const block: string[][] = [];
      let j = i;
      while (j < lines.length) {
        const raw = lines[j]!;
        const t = raw.trim();
        if (!t) break;
        if (t.startsWith("|") || t.startsWith("```") || /^#{1,6}\s/.test(t)) break;
        if (!raw.includes("\t")) break;
        const cells = raw.split("\t").map((c) => c.trim().replace(/\|/g, "\\|"));
        if (cells.length < 2) break;
        block.push(cells);
        j++;
      }
      if (block.length >= 2) {
        const colCount = Math.max(...block.map((r) => r.length));
        const pad = (row: string[]) => {
          const cells = [...row];
          while (cells.length < colCount) cells.push("");
          return cells;
        };
        const header = pad(block[0]!);
        out.push(`| ${header.join(" | ")} |`);
        out.push(`| ${header.map(() => "---").join(" | ")} |`);
        for (let r = 1; r < block.length; r++) {
          const row = pad(block[r]!);
          out.push(`| ${row.join(" | ")} |`);
        }
        out.push("");
        i = j;
        continue;
      }
    }

    out.push(line);
    i++;
  }
  return out.join("\n");
}

/** Indentación tipo lista (4 espacios tras párrafo con ':') → bullets markdown. */
export function repairIndentedLists(text: string): string {
  return text.replace(
    /(\n(?:\d+\.\s+[^\n]+:))\n((?: {4,}[^\n]+\n?)+)/g,
    (_, intro: string, body: string) => {
      const items = body
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => `- ${l.replace(/^ {4,}/, "")}`);
      return `${intro}\n${items.join("\n")}\n`;
    },
  );
}

export function repairGluedSqlTokens(text: string): string {
  let out = text;
  for (const [re, rep] of SQL_GLUE_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  return out;
}

/** Tabla metadata rota `| | |` + filas en líneas sueltas. */
export function repairSparseMetadataTable(text: string): string {
  return text.replace(
    /^\|\s*\|\s*\|\s*\n\|[-:\s|]+\|\s*\n((?:\|[^\n]+\|\s*\n?)+)/gm,
    (block) => block,
  );
}

export function repairPastedMarkdown(text: string): string {
  if (!text?.trim()) return text ?? "";
  let out = text.replace(/\r\n/g, "\n");
  out = repairGluedSqlTokens(out);
  out = repairUnclosedCodeFences(out);
  out = repairTabSeparatedTables(out);
  out = repairIndentedLists(out);
  return out;
}
