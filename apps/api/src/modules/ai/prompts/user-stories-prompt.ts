import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "user-stories-prompt.md");

function loadUserStoriesPrompt(): string {
    try {
        return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
    } catch {
        return withDocumentChangelogInstructions(
            "Eres un Product Owner. Genera el documento en markdown con Epics, Historias de usuario y Tareas técnicas; cada ítem debe seguir las plantillas EPIC / HISTORIA / TAREA del prompt completo (archivo user-stories-prompt.md). Salida solo markdown, primer carácter #.",
        );
    }
}

export const USER_STORIES_PROMPT = loadUserStoriesPrompt();
