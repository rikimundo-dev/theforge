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
