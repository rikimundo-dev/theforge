import { describe, expect, it } from "vitest";
import { detectNaturalRegenerateSection, getRegenerateSectionFromSlashCommand } from "./mddSectionRegen";

describe("mddSectionRegen", () => {
  it("detectNaturalRegenerateSection acepta texto después del número", () => {
    expect(detectNaturalRegenerateSection("regenera la sección 6 por favor")).toBe(6);
    expect(detectNaturalRegenerateSection("rehacer paso 3 del mdd")).toBe(3);
  });

  it("getRegenerateSectionFromSlashCommand resuelve /seguridad", () => {
    expect(getRegenerateSectionFromSlashCommand("/seguridad")).toBe(6);
  });
});
