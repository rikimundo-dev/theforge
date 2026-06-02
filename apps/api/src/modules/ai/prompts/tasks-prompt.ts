import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "tasks-prompt.md");

function loadTasksPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      "Genera el documento Tasks (breakdown de implementación) en markdown: Backend tasks, Frontend tasks, Infra tasks, con ítems comprobables. Salida solo markdown, primer carácter #.",
    );
  }
}

export const TASKS_PROMPT = loadTasksPrompt();
