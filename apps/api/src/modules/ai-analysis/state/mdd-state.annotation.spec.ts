import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reduceMddDraft, reducePreferDefined } from "./mdd-state.annotation.js";

describe("reduceMddDraft", () => {
  it("prefiere el borrador más largo cuando el nuevo es una ampliación", () => {
    const short = "# Master Design Document\n\n## 1. Contexto\n\nBreve.";
    const long = `${short}\n\n## 2. Arquitectura\n\n${"x".repeat(400)}`;
    assert.equal(reduceMddDraft(short, long), long);
  });

  it("prefiere la actualización más reciente aunque sea más corta (MDD reescrito)", () => {
    const prev = `# Master Design Document\n\n## 1. Contexto\n\n${"a".repeat(4000)}\n\n## 2. Arquitectura y Stack\n\n| Contenedores | Docker + Kubernetes |`;
    const next = `# Master Design Document\n\n## 1. Contexto\n\nResumen.\n\n## 2. Arquitectura y Stack\n\n| Contenedores | Docker + Dokploy |`;
    assert.equal(reduceMddDraft(prev, next), next);
  });

  it("conserva el previo si el nuevo parece fragmento sin estructura MDD", () => {
    const prev = `# Master Design Document\n\n## 1. Contexto\n\n${"x".repeat(5000)}`;
    const fragment = "solo un párrafo suelto sin secciones.";
    assert.equal(reduceMddDraft(prev, fragment), prev);
  });

  it("conserva el valor previo si la actualización está vacía", () => {
    const prev = "# Master Design Document\n\nContenido.";
    assert.equal(reduceMddDraft(prev, ""), prev);
    assert.equal(reduceMddDraft(prev, "   "), prev);
  });

  it("acepta el nuevo valor si no había borrador previo", () => {
    const next = "# Master Design Document\n\nNuevo.";
    assert.equal(reduceMddDraft("", next), next);
  });
});

describe("reducePreferDefined", () => {
  it("prefiere el valor nuevo cuando está definido", () => {
    assert.equal(reducePreferDefined("a", "b"), "b");
    assert.equal(reducePreferDefined(undefined, "id-1"), "id-1");
  });

  it("conserva el previo si la actualización es undefined", () => {
    assert.equal(reducePreferDefined("id-1", undefined), "id-1");
  });

  it("acepta duplicados idénticos (resume + checkpoint)", () => {
    const id = "8f1d250a-08e4-483f-9eec-6bb4e3d61cb4";
    assert.equal(reducePreferDefined(id, id), id);
  });
});
