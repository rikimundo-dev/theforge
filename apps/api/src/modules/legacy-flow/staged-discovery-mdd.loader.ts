import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PROMPT_FILE = "staged-discovery-mdd-prompt.md";

/**
 * Carga el system prompt del descubrimiento escalonado MDD (Plan-and-Execute).
 * Runtime: `dist/.../legacy-flow/prompts/` vía assets de nest-cli.
 */
export function loadStagedDiscoveryMddPrompt(): string {
  const p = join(__dirname, "prompts", PROMPT_FILE);
  if (!existsSync(p)) {
    return "";
  }
  try {
    return readFileSync(p, "utf-8").trim();
  } catch {
    return "";
  }
}

const PLACEHOLDER = "{{theforgeProjectId}}";
const PLACEHOLDER_REPOS = "{{ariadneRepositoriesCatalog}}";

/**
 * Sustituye `{{theforgeProjectId}}` y `{{ariadneRepositoriesCatalog}}` en el prompt cargado.
 * El catálogo (markdown) viene de `list_known_projects` en runtime; el modelo debe partir de ahí para roles por repo.
 */
export function hydrateStagedDiscoveryMddPrompt(
  template: string,
  theforgeProjectId: string,
  repositoriesCatalogMarkdown: string,
): string {
  if (!template) return "";
  const catalog = (repositoriesCatalogMarkdown ?? "").trim() || "_Catálogo de repositorios no disponible._";
  return template.split(PLACEHOLDER).join(theforgeProjectId.trim()).split(PLACEHOLDER_REPOS).join(catalog);
}
