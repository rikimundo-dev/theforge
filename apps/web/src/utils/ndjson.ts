/**
 * Extrae el primer objeto JSON completo de un fragmento (p. ej. NDJSON pegado sin salto de línea).
 */
function extractFirstJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString: "'" | '"' | null = null;
  let i = start;
  while (i < trimmed.length) {
    const c = trimmed[i];
    if (inString) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      i++;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
    i++;
  }
  return null;
}

/** Parsea una línea NDJSON; si vienen varios objetos concatenados, devuelve todos. */
export function parseNdjsonLine(line: string): Record<string, unknown>[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  try {
    return [JSON.parse(trimmed) as Record<string, unknown>];
  } catch {
    const out: Record<string, unknown>[] = [];
    let rest = trimmed;
    while (rest.length > 0) {
      const chunk = extractFirstJsonObject(rest);
      if (!chunk) break;
      try {
        out.push(JSON.parse(chunk) as Record<string, unknown>);
      } catch {
        break;
      }
      rest = rest.slice(rest.indexOf(chunk) + chunk.length).trim();
    }
    return out;
  }
}
