import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_PATH = join(__dirname, "converge-prompt.md");

function loadConvergePrompt(): string {
  try {
    return readFileSync(PROMPT_PATH, "utf-8").trim();
  } catch {
    return "Genera ## Tareas pendientes (converge) con ítems - [ ] a partir de tareas abiertas y gaps.";
  }
}

export const CONVERGE_PROMPT = loadConvergePrompt();
