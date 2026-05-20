import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPT_PATH = join(__dirname, "..", "..", "..", "..", "..", "..", "modules", "ai", "prompts", "api-contracts-prompt.md");

function loadApiContractsPrompt(): string {
  try {
    return readFileSync(PROMPT_PATH, "utf-8").trim();
  } catch {
    return `Genera el documento de Contratos de API en markdown puro (tablas para endpoints con columnas Método, Ruta, Descripción, Auth, Notas). PROHIBIDO OpenAPI/YAML/Swagger. Basado en el MDD y Blueprint proporcionados. Solo markdown, primer carácter #.`;
  }
}

export const API_CONTRACTS_PROMPT = loadApiContractsPrompt();
