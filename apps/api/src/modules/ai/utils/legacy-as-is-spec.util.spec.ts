import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLegacyAsIsSpecCoverageChecklist,
  buildMddContextForLegacyAsIsSpec,
  isLegacyAsIsMddDocument,
  resolveLegacyBaselineStageFlag,
} from "./legacy-as-is-spec.util.js";

const SAMPLE_AS_IS_MDD = `# MDD

## 1. Contexto

### AS-IS (Estado Actual)

Plataforma OOH IMJ.

- **Campañas:** gestión de campañas.
- **Pautas:** planes de medios.

## 3. Modelo de Datos

| Entidad | Origen | Atributos |
| campania | strapi | nombre |
| medio | strapi | clave |
| pauta | strapi | cliente |

## 4. Contratos de API

| Ruta | Métodos |
| /campanias | GET, POST |

## 5. Lógica y Edge Cases

### Reglas y edge cases

- **Disponibilidad de medios** — reglas de solapamiento.
- **Cálculo de bolsa** — cotización.
`;

describe("legacy-as-is-spec.util", () => {
  it("detecta MDD AS-IS por bloque §1", () => {
    assert.equal(isLegacyAsIsMddDocument(SAMPLE_AS_IS_MDD), true);
    assert.equal(isLegacyAsIsMddDocument("## 1. Contexto\n\nCambio MVP"), false);
  });

  it("buildMddContextForLegacyAsIsSpec incluye §1 y entidades sin rutas §4", () => {
    const out = buildMddContextForLegacyAsIsSpec(SAMPLE_AS_IS_MDD);
    assert.match(out, /AS-IS \(Estado Actual\)/);
    assert.match(out, /campania/);
    assert.match(out, /Disponibilidad de medios/);
    assert.doesNotMatch(out, /\/campanias/);
  });

  it("checklist lista dominios §3", () => {
    const cl = buildLegacyAsIsSpecCoverageChecklist(SAMPLE_AS_IS_MDD);
    assert.match(cl, /campania/);
    assert.match(cl, /Capacidades/);
  });

  it("resolveLegacyBaselineStageFlag usa heurística MDD AS-IS", () => {
    assert.equal(
      resolveLegacyBaselineStageFlag({ ordinal: 2 }, SAMPLE_AS_IS_MDD),
      true,
    );
    assert.equal(resolveLegacyBaselineStageFlag({ ordinal: 2 }, "## 1\n\nCambio"), false);
  });
});
