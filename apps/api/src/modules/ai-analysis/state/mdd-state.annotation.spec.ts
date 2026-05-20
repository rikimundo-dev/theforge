import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reduceMddDraft, reducePreferDefined } from "./mdd-state.annotation.js";

describe("reduceMddDraft", () => {
  it("prefiere el borrador más largo cuando hay dos actualizaciones", () => {
    const short = "# Master Design Document\n\n## 1. Contexto\n\nBreve.";
    const long = `${short}\n\n## 2. Arquitectura\n\n${"x".repeat(400)}`;
    assert.equal(reduceMddDraft(short, long), long);
    assert.equal(reduceMddDraft(long, short), long);
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
