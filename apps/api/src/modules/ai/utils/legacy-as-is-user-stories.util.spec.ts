import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLegacyAsIsUserStoriesCoverageChecklist,
  buildMddContextForLegacyAsIsUserStories,
  LEGACY_AS_IS_USER_STORIES_SYSTEM_APPENDIX,
} from "./legacy-as-is-user-stories.util.js";

const SAMPLE_AS_IS_MDD = `# MDD

## 1. Contexto

### AS-IS (Estado Actual)

Plataforma OOH IMJ.

### Usuarios y casos de uso clave

- **Ejecutivo Comercial** — ventas.

- **Campañas:** gestión de campañas.

## 3. Modelo de Datos

| Entidad | Origen | Atributos |
| campania | strapi | nombre |

## 4. Contratos de API

| Ruta | Métodos |
| /campanias | GET, POST |

## 5. Lógica y Edge Cases

### Reglas y edge cases

- **Disponibilidad de medios** — solapamiento.
`;

describe("legacy-as-is-user-stories.util", () => {
  it("buildMddContextForLegacyAsIsUserStories excluye rutas §4", () => {
    const out = buildMddContextForLegacyAsIsUserStories(SAMPLE_AS_IS_MDD);
    assert.match(out, /Ejecutivo Comercial/);
    assert.match(out, /campania/);
    assert.doesNotMatch(out, /\/campanias/);
  });

  it("checklist incluye actores y matriz Epic/US", () => {
    const cl = buildLegacyAsIsUserStoriesCoverageChecklist(SAMPLE_AS_IS_MDD);
    assert.match(cl, /Ejecutivo Comercial/);
    assert.match(cl, /Campañas/);
    assert.match(cl, /Matriz de trazabilidad/);
    assert.match(cl, /Casos de Uso/);
  });

  it("appendix prohíbe rutas en AC y bloques alcance", () => {
    assert.match(LEGACY_AS_IS_USER_STORIES_SYSTEM_APPENDIX, /PROHIBIDO.*endpoints/i);
    assert.match(LEGACY_AS_IS_USER_STORIES_SYSTEM_APPENDIX, /alcance/);
  });
});
