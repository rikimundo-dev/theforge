import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chatClaimsDocumentWasModified,
  docWasPersistedForTab,
  looksLikeOrchestratorDocModificationRequest,
  shouldWarnOrchestratorDocNotPersisted,
} from "../orchestrator-doc-guard.util.js";

describe("orchestrator-doc-guard.util", () => {
  it("detecta queja de documento sin cambios", () => {
    assert.equal(
      looksLikeOrchestratorDocModificationRequest(
        "no veo los cambios y la sección 6.3 sigue mencionando kubernetes",
      ),
      true,
    );
  });

  it("detecta afirmación falsa de edición en chat", () => {
    assert.equal(
      chatClaimsDocumentWasModified(
        "He ajustado las secciones 6 y 7; ya no contiene referencias a Kubernetes.",
      ),
      true,
    );
  });

  it("avisa cuando architecture no persistió pero el chat afirma cambio", () => {
    assert.equal(
      shouldWarnOrchestratorDocNotPersisted({
        tab: "architecture",
        userMessage: "quita kubernetes y usa dokploy",
        assistantContent: "Listo, eliminé Kubernetes del documento.",
        flags: { hasArch: false },
        currentDocLen: 1200,
      }),
      true,
    );
  });

  it("no avisa si el parser extrajo documento", () => {
    assert.equal(
      shouldWarnOrchestratorDocNotPersisted({
        tab: "architecture",
        userMessage: "quita kubernetes",
        assistantContent: "Actualizado.",
        flags: { hasArch: true },
        currentDocLen: 1200,
      }),
      false,
    );
    assert.equal(docWasPersistedForTab("architecture", { hasArch: true }), true);
  });
});
