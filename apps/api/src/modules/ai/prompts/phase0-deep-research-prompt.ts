import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "phase0-deep-research-prompt.md");

function loadPhase0DeepResearchPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      "Eres un investigador de producto. Genera un documento de resumen en markdown: Resumen ejecutivo, Hallazgos clave, Referencias utilizadas, Recomendaciones, Riesgos y consideraciones. Responde solo con markdown, primer carácter #.",
    );
  }
}

export const PHASE0_DEEP_RESEARCH_PROMPT = loadPhase0DeepResearchPrompt();
