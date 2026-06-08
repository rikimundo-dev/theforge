/** Extrae JSON de respuestas LLM (a veces vienen en fences ```json). */
export function parsePhase0LlmJson(text: string): Record<string, unknown> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) throw new SyntaxError("Respuesta LLM vacía");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  }
  return JSON.parse(raw) as Record<string, unknown>;
}
