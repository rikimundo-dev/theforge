import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "spec-prompt.md");

function loadSpecPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      "Eres un analista de requisitos. Genera el documento Spec (objetivos, alcance, criterios de éxito, user journeys resumidos) en markdown. Salida solo markdown, primer carácter #.",
    );
  }
}

export const SPEC_PROMPT = loadSpecPrompt();
