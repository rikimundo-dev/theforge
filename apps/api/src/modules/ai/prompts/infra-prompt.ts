import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "infra-prompt.md");

function loadInfraPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      `Genera el documento de Infraestructura y Despliegue en markdown: Dockerfile multietapa, docker-compose, .env.example, volúmenes. Basado en el MDD y Blueprint. Solo markdown, primer carácter #.`,
    );
  }
}

export const INFRA_PROMPT = loadInfraPrompt();
