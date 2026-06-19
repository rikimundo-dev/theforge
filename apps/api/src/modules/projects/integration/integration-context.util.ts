/**
 * Prompt blocks and parsers for NEW ↔ LEGACY cross-project integration.
 */

import { extractSectionByNumber } from "../../engine/mdd-markdown-parser.js";
import {
  buildHandoffImportDescription,
  mergeHandoffIntoLegacyDescription,
  type IntegrationHandoffItem,
} from "@theforge/shared-types";

export { buildHandoffImportDescription, mergeHandoffIntoLegacyDescription };

export function extractLegacyAsIsApiSection(mddMarkdown: string, maxChars = 12000): string {
  const s4 = extractSectionByNumber(mddMarkdown, 4)?.trim() ?? "";
  if (!s4) return "";
  return s4.length > maxChars ? s4.slice(0, maxChars) + "\n\n_(truncado)_" : s4;
}

export function extractLegacyAsIsContextSection(mddMarkdown: string, maxChars = 6000): string {
  const s1 = extractSectionByNumber(mddMarkdown, 1)?.trim() ?? "";
  if (!s1) return "";
  return s1.length > maxChars ? s1.slice(0, maxChars) + "\n\n_(truncado)_" : s1;
}

export function buildExternalLegacyContextBlock(input: {
  legacyProjectId: string;
  legacyProjectName: string;
  apiSectionMarkdown: string;
  contextSectionMarkdown?: string;
}): string {
  const lines: string[] = [
    "## Dependencia externa — Legacy AS-IS (generado, no editar manualmente)",
    "",
    `- **Proyecto legacy:** ${input.legacyProjectName} (\`${input.legacyProjectId}\`)`,
    "- **Contrato:** etapa 1 AS-IS — §4 API y §1 Contexto (extracto)",
    "",
  ];
  if (input.contextSectionMarkdown?.trim()) {
    lines.push("### §1 Contexto (legacy)", "", input.contextSectionMarkdown.trim(), "");
  }
  if (input.apiSectionMarkdown.trim()) {
    lines.push("### §4 Contratos API (legacy)", "", input.apiSectionMarkdown.trim(), "");
  }
  return lines.join("\n");
}

export function buildHandoffPromptBlockForLegacyChange(input: {
  newProjectId: string;
  newProjectName: string;
  items: IntegrationHandoffItem[];
}): string {
  if (!input.items.length) return "";
  const lines: string[] = [
    "## Handoff de integración (proyecto NEW)",
    "",
    `- **Origen:** ${input.newProjectName} (\`${input.newProjectId}\`)`,
    "- **Instrucción:** El MDD de cambio y las H.U. deben implementar **solo** estos ítems. En §1 cita explícitamente el handoff.",
    "",
    "| ID | Título | Descripción |",
    "|----|--------|-------------|",
  ];
  for (const item of input.items) {
    const desc = item.description.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 400);
    lines.push(`| ${item.id} | ${item.title.replace(/\|/g, "\\|")} | ${desc} |`);
  }
  lines.push(
    "",
    "En cada historia de usuario legacy (`LEG-*`), incluye la línea: **Satisface:** `NEW-LEG-XX`.",
  );
  return lines.join("\n");
}

export function buildHandoffUserStoriesAppendix(
  items: Pick<IntegrationHandoffItem, "id" | "title" | "description" | "acceptanceCriteria">[],
): string {
  if (!items.length) return "";
  const lines: string[] = [
    "",
    "---",
    "",
    "## Trabajo en sistema legacy (handoff)",
    "",
    "Historias etiquetadas `[Legacy handoff]` — contrato de integración hacia el monolito legacy.",
    "",
  ];
  for (const item of items) {
    lines.push(`### [Legacy handoff] ${item.id}`, "", item.description.trim(), "");
    if (item.acceptanceCriteria?.length) {
      lines.push("**Criterios de aceptación:**", "");
      for (const ac of item.acceptanceCriteria) lines.push(`- ${ac}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

const SATISFIES_RE = /Satisface:\s*`?(NEW-LEG-\d{2,})`?/gi;

export function parseSatisfiesLinksFromUserStories(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const sections = markdown.split(/(?=^#{1,3}\s)/m);
  for (const section of sections) {
    const legMatch = section.match(/^#{1,3}\s*(LEG-\d{2,})/im);
    if (!legMatch) continue;
    const legId = legMatch[1]!.toUpperCase();
    let m: RegExpExecArray | null;
    SATISFIES_RE.lastIndex = 0;
    while ((m = SATISFIES_RE.exec(section)) !== null) {
      map.set(m[1]!.toUpperCase(), legId);
    }
  }
  return map;
}
