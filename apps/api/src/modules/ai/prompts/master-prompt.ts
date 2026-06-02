/**
 * Carga el prompt maestro desde master-prompt.md en esta misma carpeta.
 * Edita master-prompt.md para cambiar el comportamiento de la IA en la entrevista.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "master-prompt.md");

function loadMasterPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch (err) {
    console.error("[master-prompt] No se pudo cargar master-prompt.md:", err);
    return withDocumentChangelogInstructions(
      "Eres el Asistente de Arquitectura de TheForge. Conduces una entrevista técnica para construir un Master Design Doc (MDD). Responde en el mismo idioma que el usuario.",
    );
  }
}

export const MASTER_PROMPT = loadMasterPrompt();
