import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLegacyAsIsLogicFlowsCoverageChecklist,
  chunkArray,
  extractServicesFromSection5,
  finalizeLogicFlowsDocument,
  LEGACY_AS_IS_LOGIC_FLOWS_SYSTEM_APPENDIX,
  scoreLogicFlowsSection5Coverage,
  stripLogicFlowsFragmentWrapper,
} from "./legacy-as-is-logic-flows.util.js";

const SAMPLE_S5 = `### Lógica de negocio

| Servicio | Dependencias (paths) |
| strapi:createCampaniaWDetalles | api/campania/services/createCampaniaWDetalles.js |
| strapi:obtener-dispo-imj | api/detailpauta/services/obtener-dispo-imj.js |
| strapi:pauta | api/pauta/services/pauta.js |

### Reglas y edge cases

- **Disponibilidad de medios** — solapamiento.
`;

const SAMPLE_MDD = `# MDD

## 4. Contratos de API

| Ruta | Métodos |
| POST /api/createCampaniaWDetalles | POST |
| GET /api/obtener-dispo-imj | GET |

## 5. Lógica y Edge Cases

${SAMPLE_S5}
`;

describe("legacy-as-is-logic-flows.util", () => {
  it("extractServicesFromSection5 parsea tabla", () => {
    const rows = extractServicesFromSection5(SAMPLE_S5);
    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.service, "strapi:createCampaniaWDetalles");
  });

  it("checklist lista servicios §5 y rutas custom", () => {
    const cl = buildLegacyAsIsLogicFlowsCoverageChecklist(SAMPLE_MDD);
    assert.match(cl, /createCampaniaWDetalles/);
    assert.match(cl, /obtener-dispo-imj/);
    assert.match(cl, /Disponibilidad de medios/);
    assert.match(cl, /inferido/);
  });

  it("appendix prohíbe endpoints inventados", () => {
    assert.match(LEGACY_AS_IS_LOGIC_FLOWS_SYSTEM_APPENDIX, /emitir-factura/);
    assert.match(LEGACY_AS_IS_LOGIC_FLOWS_SYSTEM_APPENDIX, /sync\/bitrix/);
    assert.match(LEGACY_AS_IS_LOGIC_FLOWS_SYSTEM_APPENDIX, /Mermaid/);
  });

  it("chunkArray divide servicios en lotes", () => {
    const chunks = chunkArray([1, 2, 3, 4, 5], 2);
    assert.deepEqual(chunks, [[1, 2], [3, 4], [5]]);
  });

  it("scoreLogicFlowsSection5Coverage detecta servicios mencionados", () => {
    const doc = `# Flujos

## Flujo 1: strapi:createCampaniaWDetalles
POST /api/createCampaniaWDetalles

## Flujo 2: strapi:obtener-dispo-imj
`;
    const score = scoreLogicFlowsSection5Coverage(SAMPLE_MDD, doc);
    assert.equal(score.totalServices, 3);
    assert.equal(score.coveredServices, 2);
    assert.equal(score.missingServices[0], "strapi:pauta");
  });

  it("finalizeLogicFlowsDocument ensambla header y telemetría", () => {
    const body = "## Flujo 1: strapi:createCampaniaWDetalles\n\nPaso 1.";
    const { content, coverage } = finalizeLogicFlowsDocument(body, SAMPLE_MDD);
    assert.match(content, /^# Flujos de lógica/);
    assert.match(content, /cobertura §5/);
    assert.ok(coverage.totalServices >= 1);
  });

  it("stripLogicFlowsFragmentWrapper quita H1 duplicado", () => {
    const stripped = stripLogicFlowsFragmentWrapper("# Flujos de lógica\n\n## Flujo 1: foo");
    assert.match(stripped, /^## Flujo 1/);
    assert.doesNotMatch(stripped, /^# Flujos/);
  });
});
