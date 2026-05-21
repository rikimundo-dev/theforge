/**
 * Repara salidas de LLM donde trozos de MDD quedan dentro de fences ``` sin idioma
 * o con fence de apertura sin cierre: el markdown se mostraba como un bloque de código
 * (sin wrap, texto cortado a la derecha).
 */

function markdownLikeDocFragment(t: string): boolean {
  const s = t.trim();
  if (s.length < 40) return false;
  const headers = s.match(/^#{1,6}\s+[^\n]+/gm) ?? [];
  if (headers.length < 2) return false;
  const hasListOrPara = /^[-*]\s/m.test(s) || /^\d+\.\s/m.test(s) || /\n\n[^\n`]{20,}/.test(s);
  return hasListOrPara || /\n##\s/.test(s);
}

/**
 * - Desenvuelve bloques ``` / ```markdown cuyo interior son títulos y listas (markdown real).
 * - Si hay un ``` de apertura sin cierre y el resto parece MDD, elimina la línea del fence.
 */
export function repairMarkdownFences(raw: string): string {
  if (!raw?.trim()) return raw ?? "";
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (/^```[a-zA-Z0-9_-]*\s*$/.test(trimmed)) {
      const lang = (trimmed.match(/^```([a-zA-Z0-9_-]*)?/)?.[1] ?? "").toLowerCase();
      const openLine = line;
      i++;
      const inner: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) {
        inner.push(lines[i]!);
        i++;
      }
      const hasClose = i < lines.length && /^```\s*$/.test(lines[i]!.trim());
      if (hasClose) i++;
      const body = inner.join("\n");
      // LLMs sometimes fence BRD/MDD prose as ```mermaid; unwrap when body is markdown, not a diagram.
      const unwrapLang = !lang || lang === "markdown" || lang === "md" || lang === "mermaid";
      if (hasClose && unwrapLang && markdownLikeDocFragment(body)) {
        if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
        out.push(...body.split("\n"));
      } else if (!hasClose && unwrapLang && markdownLikeDocFragment(body)) {
        if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
        out.push(...body.split("\n"));
      } else {
        out.push(openLine);
        out.push(...inner);
        if (hasClose) out.push("```");
      }
    } else {
      out.push(line);
      i++;
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
