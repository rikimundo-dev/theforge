import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "architecture-prompt.md");

function loadArchitecturePrompt(): string {
    try {
        return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
    } catch {
        return withDocumentChangelogInstructions(
            "Eres arquitecto de software del producto descrito en el MDD. Genera arquitectura técnica (módulos, datos, APIs) en markdown; no inventes agentes LLM ni titules el sistema como TheForge. Primer carácter #.",
        );
    }
}

export const ARCHITECTURE_PROMPT = loadArchitecturePrompt();
