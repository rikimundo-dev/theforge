import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLegacyBrdBusinessInventoryPrompt,
  prepareLegacyCodebaseDocForBrdPrompt,
} from "./brd-legacy-source.util.js";

const SAMPLE_DOC = `# Doc

## Repositorio: erp

### Entidades y modelo de datos

| Entidad | Fuente | Campos |
|---------|--------|--------|
| campania | strapi | nombre |
| medio | strapi | tipo |

### Contratos API

| Ruta | Métodos |
|------|---------|
| /api/campanias | GET, POST |

### Lógica de negocio

| Servicio | Archivo |
|----------|---------|
| strapi:campania | services/campania.js |

### Rutas de evidencia

${Array.from({ length: 200 }, (_, i) => `- src/file-${i}.js`).join("\n")}
`;

describe("prepareLegacyCodebaseDocForBrdPrompt", () => {
  it("compacta evidence_paths masivos", () => {
    const prep = prepareLegacyCodebaseDocForBrdPrompt(SAMPLE_DOC);
    assert.ok(prep.text.includes("campania"));
    assert.ok(prep.text.includes("rutas omitidas") || !prep.text.includes("file-199"));
    assert.equal(prep.entityCount, 2);
    assert.equal(prep.serviceCount, 1);
  });

  it("buildLegacyBrdBusinessInventoryPrompt pide inventario exhaustivo", () => {
    const p = buildLegacyBrdBusinessInventoryPrompt("doc");
    assert.match(p, /exhaustivo/i);
    assert.match(p, /Inventario de capacidades/i);
    assert.ok(p.includes("doc"));
  });

  it("etapa 1 AS-IS no trunca codebaseDoc grande en prompt BRD", () => {
    const filler = "z".repeat(150_000);
    const huge = `${SAMPLE_DOC}\n\n## 99. Ruido\n\n${filler}`;
    const prev = process.env.LEGACY_BASELINE_FULL_DETAIL;
    process.env.LEGACY_BASELINE_FULL_DETAIL = "1";
    try {
      const prep = prepareLegacyCodebaseDocForBrdPrompt(huge, { legacyBaselineStage: true });
      assert.equal(prep.truncated, false);
      assert.ok(prep.text.includes(filler.slice(0, 500)));
    } finally {
      if (prev === undefined) delete process.env.LEGACY_BASELINE_FULL_DETAIL;
      else process.env.LEGACY_BASELINE_FULL_DETAIL = prev;
    }
  });
});
