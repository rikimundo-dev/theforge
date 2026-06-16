import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLegacyAsIsBlueprintCoverageChecklist,
  LEGACY_AS_IS_BLUEPRINT_SYSTEM_APPENDIX,
} from "./legacy-as-is-blueprint.util.js";

const SAMPLE_MDD = `# MDD

## 3. Modelo de Datos

| Entidad | Origen |
| campania | strapi |
| medio | strapi |

## 4. Contratos de API

| Ruta | Métodos |
| /api/createCampaniaWDetalles | POST |
| /api/obtener-dispo-imj | GET |

## 5. Lógica y Edge Cases

### Reglas y edge cases

- **Disponibilidad de medios** — solapamiento.
`;

describe("legacy-as-is-blueprint.util", () => {
  it("checklist incluye secciones 1-8 y entidades", () => {
    const cl = buildLegacyAsIsBlueprintCoverageChecklist(SAMPLE_MDD);
    assert.match(cl, /Persistencia y datos/);
    assert.match(cl, /Checklist de verificación/);
    assert.match(cl, /campania/);
    assert.match(cl, /createCampaniaWDetalles/);
    assert.match(cl, /Disponibilidad de medios/);
  });

  it("appendix prohíbe section merge y duplicar §2", () => {
    assert.match(LEGACY_AS_IS_BLUEPRINT_SYSTEM_APPENDIX, /section merge/i);
    assert.match(LEGACY_AS_IS_BLUEPRINT_SYSTEM_APPENDIX, /oohbp2.*frontend/i);
    assert.match(LEGACY_AS_IS_BLUEPRINT_SYSTEM_APPENDIX, /Persistencia y datos/);
  });
});
