import { formatActivePatternsPromptBlock } from "@theforge/shared-types/mdd-governance-patterns";

/** Bloque para system/user prompt de entregables que deben alinearse al Wizard del MDD. */
export function appendMddGovernancePatternsToPrompt(prompt: string, mddContent: string): string {
  const block = formatActivePatternsPromptBlock(mddContent);
  if (!block.trim()) return prompt;
  return `${block}\n\n${prompt}`;
}
