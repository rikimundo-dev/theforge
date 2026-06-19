import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  documentPersistFieldLabel,
  validateDocumentForPersist,
  wouldShrinkDocDangerously,
} from "./document-shrink.util.js";

describe("document-shrink.util", () => {
  it("wouldShrinkDocDangerously rechaza borrado masivo", () => {
    const current = "# Spec\n\n".padEnd(1200, "x");
    const next = "## Registro de cambios del documento\n\n| 1.0 | Junio 2026 | Creación |";
    assert.equal(wouldShrinkDocDangerously(current, next), true);
  });

  it("validateDocumentForPersist rechaza changelog-only", () => {
    const shell =
      "## Registro de cambios del documento\n\n| Versión | Fecha | Descripción del cambio |\n| --- | --- | --- |\n| 1.0 | Junio 2026 | Creación inicial del documento |";
    const result = validateDocumentForPersist(null, shell, { fieldLabel: "Spec" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /no se guardó/);
    }
  });

  it("validateDocumentForPersist permite spec sustancial", () => {
    const current = "# Spec\n\n".padEnd(900, "a");
    const next = "# Spec\n\nContenido aclarado con alcance y criterios de éxito detallados.";
    const result = validateDocumentForPersist(current, next, { fieldLabel: "Spec" });
    assert.equal(result.ok, true);
  });

  it("validateDocumentForPersist rechaza vaciar spec con contenido previo", () => {
    const current = "# Spec\n\n".padEnd(200, "x");
    const result = validateDocumentForPersist(current, "", { fieldLabel: "Spec" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /No se puede vaciar Spec/);
    }
  });

  it("documentPersistFieldLabel resuelve specContent", () => {
    assert.equal(documentPersistFieldLabel("specContent"), "Spec");
  });
});
