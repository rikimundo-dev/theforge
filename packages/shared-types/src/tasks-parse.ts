/**
 * Parseo de tasks.md para converge y export a GitHub Issues.
 */

export interface ParsedTaskItem {
  line: number;
  title: string;
  section: string;
  done: boolean;
}

const TASK_LINE = /^(\s*)- \[( |x|X)\]\s+(.+)$/;

/** Secciones típicas del documento Tasks generado por The Forge. */
const SECTION_HEADING = /^##\s+(.+)$/;

/**
 * Extrae ítems de checklist del markdown Tasks.
 */
export function parseTasksMarkdown(md: string): ParsedTaskItem[] {
  const lines = (md ?? "").split("\n");
  const items: ParsedTaskItem[] = [];
  let currentSection = "General";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1].trim();
      continue;
    }
    const taskMatch = line.match(TASK_LINE);
    if (!taskMatch?.[3]) continue;
    const done = (taskMatch[2] ?? " ").toLowerCase() === "x";
    const title = taskMatch[3].trim();
    if (title.length === 0) continue;
    items.push({ line: i + 1, title, section: currentSection, done });
  }

  return items;
}

export function filterOpenTasks(items: ParsedTaskItem[]): ParsedTaskItem[] {
  return items.filter((t) => !t.done);
}

/** Etiqueta GitHub segura desde nombre de sección. */
export function sectionToIssueLabel(section: string): string {
  const s = section
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s.length > 0 ? `theforge:${s}` : "theforge:task";
}
