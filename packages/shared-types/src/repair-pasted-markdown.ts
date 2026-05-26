/**
 * Reparaciones heurísticas para markdown pegado desde Word/Excel/chat (sin LLM).
 */

import { repairCollapsedSqlParagraphs, repairCollapsedSqlInsideFences } from "./repair-collapsed-sql.js";
import { repairFlowSectionsToMermaid } from "./repair-flow-sections.js";

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
  [/ON_([a-z_]+)\(/gi, "ON $1("],
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
    if (inFence && /^#{1,6}\s+\S/.test(trimmed)) {
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

const INDENTED_CODE_HINT =
  /^(CREATE|ALTER|SELECT|INSERT|DELETE|DROP|DECLARE|BEGIN|END\b|```|\{|\}|--\s*Tabla|--\s*Índice)/i;

/** Bloques con 4+ espacios (Word/chat) → bullets; evita que GFM los muestre como ``` code ```. */
export function repairIndentedProseBlocks(text: string): string {
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
    if (/^(\s{4,}|\t+)\S/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^(\s{4,}|\t+)/.test(lines[i]!) && !/^```/.test(lines[i]!.trim())) {
        block.push(lines[i]!.trim());
        i++;
      }
      i--;
      if (block.some((l) => INDENTED_CODE_HINT.test(l))) {
        for (const l of block) out.push(`    ${l}`);
      } else {
        for (const l of block) {
          const item = l.replace(/^ {4,}/, "");
          out.push(item.startsWith("- ") ? item : `- ${item}`);
        }
        out.push("");
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** `**Flujo de X** **Odoo genera**` → heading + bullet */
export function repairGluedBoldFlowTitles(text: string): string {
  return text
    .replace(
      /^\*\*Flujo de procesamiento\*\*\s*\*\*Odoo genera\*\*\s*(.+)$/gim,
      "### Flujo de procesamiento\n\n- Odoo genera $1",
    )
    .replace(/^\*\*Seguridad\*\*\s*\*\*API Key\*\*\s*(.+)$/gim, "### Seguridad\n\n- API Key $1")
    .replace(/^\*\*Beneficios de las\*\*\s*tablas espejo\s*$/gim, "### Beneficios de las tablas espejo");
}

/** Cierra JSON / elimina fences vacíos antes de Response o **Beneficios** */
export function repairJsonFenceIntegrity(text: string): string {
  let out = text.replace(
    /\*\*Response (\d+)[^*]*\*\*\s*:?\s*\n+```\s*\n+```json/gi,
    "**Response $1:**\n\n```json",
  );
  out = out.replace(/\n```\s*\n```json/g, "\n\n```json");
  out = out.replace(/```json\n([\s\S]*?)(\n\*\*[^\n]+\*\*)/g, (full, body: string, after: string) => {
    const trimmed = body.trimEnd();
    if (trimmed.endsWith("```")) return full;
    let fixed = trimmed;
    if (!fixed.endsWith("}")) fixed += "\n}";
    return `\`\`\`json\n${fixed}\n\`\`\`\n${after}`;
  });
  out = out.replace(/(\n```json\n[\s\S]*?\n)(\n\*\*Beneficios)/g, (m, block: string, rest: string) => {
    if (block.trimEnd().endsWith("```")) return m;
    const inner = block.replace(/^```json\n/, "").trimEnd();
    const closed = inner.endsWith("}") ? inner : `${inner}\n}`;
    return `\n\`\`\`json\n${closed}\n\`\`\`\n${rest}`;
  });
  out = out.replace(/(\n```json\n[\s\S]*?)(\n```\s*\n```json)/g, "$1\n```\n");
  return out;
}

/** `**Donde:** - item` en una línea → párrafo + bullets */
export function repairDondeGluedBullets(text: string): string {
  return text.replace(
    /^\*\*Donde:\*\*\s*-\s*(.+)$/gim,
    "**Donde:**\n\n- $1",
  ).replace(
    /(\*\*Donde:\*\*[^\n]*)\n-\s*De \*\*/g,
    "$1\n\n- De **",
  );
}

export function repairGluedSqlTokens(text: string): string {
  let out = text;
  for (const [re, rep] of SQL_GLUE_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  out = out.replace(/idx_[a-z0-9_]+_ON_/gi, (m) => m.replace(/_ON_/, "_ON "));
  return out;
}

/** Tabla portada rota: `| | |` + filas de metadatos. */
export function repairMetadataCoverTable(text: string): string {
  return text.replace(
    /^(\s*#\s+[^\n]+\n)\s*\|\s*\|\s*\|\s*\n\s*\|[-:\s|]+\|\s*\n((?:\|[^\n]+\|\s*\n?)+)/m,
    (_m, title: string, rows: string) => {
      const rowLines = rows.trim().split("\n").filter((l) => /^\|/.test(l.trim()));
      return `${title}| Campo | Valor |\n| --- | --- |\n${rowLines.join("\n")}\n\n`;
    },
  );
}

const DO_NOT_PROMOTE_TITLE =
  /^(Headers?:|Request body|Response \d+|Recibe eventos|Content-Type|X-Odoo|Beneficios de las|Flujo de procesamiento|Seguridad|Donde:|OBP4MO \(normalizado\):|OBP \(desnormalizado\):|Este microservicio tiene|Odoo genera|Endpoint receptor de webhooks$)/i;

/** Encabezados sueltos (sin #) que deberían ser sección. */
export function repairPromoteBareSectionHeadings(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  const isBareTitle = (t: string, prev: string, next: string): boolean => {
    if (t.length < 4 || t.length > 100) return false;
    if (DO_NOT_PROMOTE_TITLE.test(t)) return false;
    if (/^#{1,6}\s/.test(t)) return false;
    if (t.startsWith("|") || t.startsWith("```")) return false;
    if (/^[-*]\s/.test(t)) return false;
    if (/^🔴|^🟡|^🟢/.test(t)) return false;
    if (/^[-*_]{3,}$/.test(t)) return false;
    if (/^(GET|POST|PUT|PATCH|DELETE)\s+\//.test(t)) return false;
    if (/^Módulo \d+ —/.test(t)) return false;
    if (/^contexto:/i.test(t)) return false;
    if (/:$/.test(t) && t.length < 60) return false;
    if (!/^[A-ZÁÉÍÓÚÑ0-9]/.test(t)) return false;
    if (/^[{\[]/.test(next)) return true;
    if (prev === "" && (next === "" || next.startsWith("-") || next.startsWith("|"))) return true;
    if (prev === "" && /^[A-Za-z].{0,80}$/.test(t) && !t.includes(". ")) return true;
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    const prev = i > 0 ? (lines[i - 1] ?? "").trim() : "";
    const next = i + 1 < lines.length ? (lines[i + 1] ?? "").trim() : "";
    if (/^Módulo \d+ —/.test(t)) {
      out.push(`### ${t}`);
      continue;
    }
    if (/^Feature candidates/i.test(t)) {
      out.push(`## ${t}`);
      continue;
    }
    if (/^Riesgos y mitigaciones/i.test(t)) {
      out.push(`## ${t}`);
      continue;
    }
    if (/^Esquema SQL/i.test(t)) {
      out.push(/^#{1,4}\s/.test(t) ? line : `### ${t}`);
      continue;
    }
    if (/^Flujo de sincronización/i.test(t)) {
      out.push(`### ${t}`);
      continue;
    }
    if (/^Endpoint de recepción/i.test(t)) {
      out.push(`### ${t}`);
      continue;
    }
    if (isBareTitle(t, prev, next)) {
      out.push(`### ${t}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Abre ```sql antes de bloques CREATE sueltos (sin fence). */
export function repairOrphanSqlBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inSqlFence = false;
  let inAnyFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    if (/^```/.test(t)) {
      if (inSqlFence) {
        out.push("```");
        inSqlFence = false;
      }
      inAnyFence = t !== "```";
      out.push(line);
      if (t === "```") inAnyFence = false;
      continue;
    }
    if (inAnyFence) {
      out.push(line);
      continue;
    }
    const sqlStart =
      /^Esquema SQL\b/i.test(t) ||
      /^CREATE TABLE\b/i.test(t) ||
      /^CREATE INDEX\b/i.test(t) ||
      /^-- Tabla espejo/i.test(t);
    if (!inSqlFence && sqlStart) {
      out.push("```sql");
      inSqlFence = true;
    }
    if (inSqlFence && /^#{1,6}\s/.test(t)) {
      out.push("```");
      inSqlFence = false;
    }
    if (
      inSqlFence &&
      t === "" &&
      i + 1 < lines.length &&
      /^#{1,6}\s/.test((lines[i + 1] ?? "").trim())
    ) {
      out.push("```");
      inSqlFence = false;
    }
    out.push(line);
  }
  if (inSqlFence) out.push("```");
  return out.join("\n");
}

/** Líneas ``` huérfanas o duplicadas tras fences bien formados. */
export function repairStrayCodeFences(text: string): string {
  let out = text.replace(/\n```[a-z]*\s*\n```\s*\n/gi, "\n\n");
  out = out.replace(/(\n```\s*\n){2,}/g, "\n\n");
  const lines = out.split("\n");
  const cleaned: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t === "```") {
      const prev = cleaned[cleaned.length - 1]?.trim() ?? "";
      const next = lines[i + 1]?.trim() ?? "";
      if (prev === "```" || next === "```") continue;
    }
    cleaned.push(lines[i]!);
  }
  return cleaned.join("\n");
}

/** Línea en blanco entre headings / párrafos y tablas GFM. */
export function repairTableBoundaries(text: string): string {
  let out = text.replace(/^(#{1,6}\s+[^\n]+)\n(\|)/gm, "$1\n\n$2");
  out = out.replace(/(\n\|[^\n]+\|)\n(#{1,6}\s+)/g, "$1\n\n$2");
  out = out.replace(/^(contexto:[^\n]+)\n(\|)/gim, "$1\n\n$2");
  return out;
}

/** Diagramas ASCII de relaciones en una sola línea → bloque text. */
export function repairAsciiDiagramBlocks(text: string): string {
  let out = text.replace(
    /^\*\*(OBP4MO|OBP) \([^)]+\):\*\*\s*(.+)$/gim,
    (_m, label: string, diagram: string) =>
      `**${label}:**\n\n\`\`\`text\n${diagram.trim()}\n\`\`\``,
  );
  out = out.replace(/^((?:pais|ubicacion|País).{10,200}(?:──|└|┬|┘).*)$/gim, (line) => {
    const t = line.trim();
    if (t.startsWith("```")) return line;
    return `\`\`\`text\n${t}\n\`\`\``;
  });
  return out;
}

/** Quita ### erróneos en subtítulos de contrato API / Odoo. */
export function repairDemoteFalseApiHeadings(text: string): string {
  let out = text.replace(
    /^### (Headers?:|Request body \(ejemplo|Response \d+|Recibe eventos|Content-Type:|API Key|Odoo genera|Beneficios de las|Donde:|OBP4MO \(normalizado\):|OBP \(desnormalizado\):)\s*/gim,
    "**$1** ",
  );
  out = out.replace(/^### (Este microservicio[^\n]+)/gim, "$1");
  return out;
}

/** Bloques JSON sueltos (webhook / Odoo) → fence json. */
export function repairLooseJsonBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = (lines[i] ?? "").trim();
    const prev = (lines[i - 1] ?? "").trim();
    if (t === "{" && !prev.match(/^```/)) {
      const block: string[] = [lines[i]!];
      let j = i + 1;
      let depth = (t.match(/{/g) ?? []).length - (t.match(/}/g) ?? []).length;
      while (j < lines.length && depth > 0) {
        block.push(lines[j]!);
        const lj = lines[j]!.trim();
        depth += (lj.match(/{/g) ?? []).length - (lj.match(/}/g) ?? []).length;
        j++;
      }
      if (depth <= 0 && block.length >= 3) {
        out.push("```json");
        out.push(...block);
        out.push("```");
        out.push("");
        i = j;
        continue;
      }
    }
    out.push(lines[i]!);
    i++;
  }
  return out.join("\n");
}

export function repairPastedMarkdown(text: string): string {
  if (!text?.trim()) return text ?? "";
  let out = text.replace(/\r\n/g, "\n");
  out = repairMetadataCoverTable(out);
  out = repairGluedBoldFlowTitles(out);
  out = repairJsonFenceIntegrity(out);
  out = repairIndentedProseBlocks(out);
  out = repairStrayCodeFences(out);
  out = repairPromoteBareSectionHeadings(out);
  out = repairDemoteFalseApiHeadings(out);
  out = repairCollapsedSqlParagraphs(out);
  out = repairCollapsedSqlInsideFences(out);
  out = repairOrphanSqlBlocks(out);
  out = repairLooseJsonBlocks(out);
  out = repairJsonFenceIntegrity(out);
  out = repairGluedSqlTokens(out);
  out = repairUnclosedCodeFences(out);
  out = repairStrayCodeFences(out);
  out = repairAsciiDiagramBlocks(out);
  out = repairDondeGluedBullets(out);
  out = repairTableBoundaries(out);
  out = repairTabSeparatedTables(out);
  out = repairIndentedLists(out);
  out = repairIndentedProseBlocks(out);
  out = repairFlowSectionsToMermaid(out);
  out = repairTableBoundaries(out);
  out = out.replace(/\n(🔴|🟡|🟢)/g, "\n\n$1");
  out = out.replace(/\n-{3,}\n/g, "\n\n---\n\n");
  return out;
}
