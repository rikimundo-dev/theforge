import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSpecKitBundleFiles,
  parseTasksMarkdown,
  slugifySpecKitFeature,
  specKitFeatureDir,
} from "@theforge/shared-types";

describe("spec-kit-bundle", () => {
  it("slugifySpecKitFeature normaliza nombre", () => {
    assert.equal(slugifySpecKitFeature("Mi App SDD"), "mi-app-sdd");
  });

  it("buildSpecKitBundleFiles crea layout spec-kit", () => {
    const files = buildSpecKitBundleFiles({
      projectName: "Taskify",
      mddContent: "# MDD\n\n## 3. Modelo\n\nTabla users",
      specContent: "# Spec",
      blueprintContent: "# Plan",
      tasksContent: "- [ ] Implementar login",
    });
    const paths = files.map((f) => f.path);
    assert.ok(paths.includes(".specify/memory/constitution.md"));
    assert.ok(paths.some((p) => p.startsWith("specs/001-taskify/spec.md")));
    assert.ok(paths.some((p) => p.endsWith("data-model.md")));
    assert.ok(paths.includes("IMPLEMENT.md"));
  });

  it("specKitFeatureDir usa ordinal", () => {
    assert.equal(specKitFeatureDir(2, "Foo"), "specs/002-foo");
  });
});

describe("tasks-parse", () => {
  it("parseTasksMarkdown extrae checklist", () => {
    const md = `## Backend tasks\n- [ ] Crear API\n- [x] Hecho\n`;
    const items = parseTasksMarkdown(md);
    assert.equal(items.length, 2);
    assert.equal(items[0].done, false);
    assert.equal(items[1].done, true);
    assert.equal(items[0].section, "Backend tasks");
  });
});
