import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "use-cases-prompt.md");

function loadUseCasesPrompt(): string {
    try {
        return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
    } catch {
        return withDocumentChangelogInstructions(
            "Eres un analista funcional. Genera el documento de Casos de Uso con escenarios detallados y robustos en markdown. Salida solo markdown, primer carácter #.",
        );
    }
}

export const USE_CASES_PROMPT = loadUseCasesPrompt();
