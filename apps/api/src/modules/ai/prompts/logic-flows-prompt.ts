import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "logic-flows-prompt.md");

function loadLogicFlowsPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      `Genera el documento de Casos de Uso y Flujos de Lógica en markdown: diagramas Mermaid, flujos de error, reglas de validación, casos de borde. Basado en el MDD. Solo markdown, primer carácter #.`,
    );
  }
}

export const LOGIC_FLOWS_PROMPT = loadLogicFlowsPrompt();
