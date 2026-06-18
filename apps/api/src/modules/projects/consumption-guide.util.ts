import { readFileSync } from "node:fs";
import { join } from "node:path";

const MONOREPO_ROOT = join(__dirname, "../../../../../..");

let cachedConsumptionGuide: string | null = null;

/** Lee `docs/THEFORGE-DOC-CONSUMPTION-GUIDE.md` para bundles SDD (best-effort). */
export function loadConsumptionGuideMarkdown(): string | null {
  if (cachedConsumptionGuide !== null) return cachedConsumptionGuide;
  const candidates = [
    join(MONOREPO_ROOT, "docs/THEFORGE-DOC-CONSUMPTION-GUIDE.md"),
    join(process.cwd(), "docs/THEFORGE-DOC-CONSUMPTION-GUIDE.md"),
  ];
  for (const p of candidates) {
    try {
      const text = readFileSync(p, "utf-8").trim();
      if (text.length > 0) {
        cachedConsumptionGuide = text;
        return text;
      }
    } catch {
      // siguiente candidato
    }
  }
  cachedConsumptionGuide = "";
  return null;
}
