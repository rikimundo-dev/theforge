/**
 * Builds a 1–2 letter monogram from a project display name (sidebar rail, avatars).
 */
export function getProjectMonogram(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";

  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) {
    const a = words[0]?.[0];
    const b = words[1]?.[0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }

  const word = words[0] ?? trimmed;
  if (word.length === 1) return word.toUpperCase();
  return word.slice(0, 2).toUpperCase();
}
