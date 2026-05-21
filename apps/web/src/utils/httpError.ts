/**
 * Parses NestJS-style JSON error bodies or plain text (proxies, HTML errors).
 */
export function parseErrorBodyText(text: string, fallback: string, httpStatus?: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return httpStatus != null ? `${fallback} (HTTP ${httpStatus})` : fallback;
  }
  try {
    const data = JSON.parse(trimmed) as { message?: string | string[] };
    const m = data.message;
    if (typeof m === "string" && m.trim()) return m.trim();
    if (Array.isArray(m) && m.length > 0) return m.filter(Boolean).join(", ");
  } catch {
    /* not JSON */
  }
  if (trimmed.length <= 400) return trimmed;
  return `${trimmed.slice(0, 280)}…`;
}

export async function parseErrorMessageFromResponse(res: Response, fallback: string): Promise<string> {
  const text = await res.text();
  return parseErrorBodyText(text, fallback, res.status);
}

function messageFromJsonObject(data: {
  type?: string;
  message?: string | string[];
  code?: string;
}): { message: string; code?: string } | null {
  const m = data.message;
  const message =
    typeof m === "string" && m.trim()
      ? m.trim()
      : Array.isArray(m) && m.length > 0
        ? m.filter(Boolean).join(", ")
        : null;
  if (!message) return null;
  const code = typeof data.code === "string" && data.code.trim() ? data.code.trim() : undefined;
  return { message, code };
}

/** Parsea cuerpo de error: JSON Nest, NDJSON (varias líneas) o texto plano. */
export function parseApiErrorPayload(
  text: string,
  fallback: string,
  httpStatus?: number,
): { message: string; code?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { message: httpStatus != null ? `${fallback} (HTTP ${httpStatus})` : fallback };
  }
  try {
    const single = messageFromJsonObject(
      JSON.parse(trimmed) as { type?: string; message?: string | string[]; code?: string },
    );
    if (single) return single;
  } catch {
    /* puede ser NDJSON u otro formato */
  }
  for (const line of trimmed.split(/\n+/)) {
    const row = line.trim();
    if (!row) continue;
    try {
      const parsed = messageFromJsonObject(
        JSON.parse(row) as { type?: string; message?: string | string[]; code?: string },
      );
      if (parsed && (parsed.message || row.includes('"type":"error"'))) {
        return parsed;
      }
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }
  return { message: parseErrorBodyText(trimmed, fallback, httpStatus) };
}

export async function parseApiErrorPayloadFromResponse(
  res: Response,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  const text = await res.text();
  return parseApiErrorPayload(text, fallback, res.status);
}
