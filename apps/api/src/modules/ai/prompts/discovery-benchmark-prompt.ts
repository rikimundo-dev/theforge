import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withDocumentChangelogInstructions } from "./with-document-changelog-instructions.js";

const PROMPT_PATH = join(__dirname, "discovery-benchmark-prompt.md");

function loadDiscoveryBenchmarkPrompt(): string {
  try {
    return withDocumentChangelogInstructions(readFileSync(PROMPT_PATH, "utf-8").trim());
  } catch {
    return withDocumentChangelogInstructions(
      `Eres un consultor de dominio. Genera un Domain Benchmark & Gap Analysis en markdown: 3 líderes de mercado, checklist de funciones estándar del dominio, y brechas de la idea del usuario respecto a ese estándar. Responde solo con markdown, primer carácter #.`,
    );
  }
}

export const DISCOVERY_BENCHMARK_PROMPT = loadDiscoveryBenchmarkPrompt();
