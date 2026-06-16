import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLegacyAsIsUseCasesCoverageChecklist,
  buildMddContextForLegacyAsIsUseCases,
  LEGACY_AS_IS_USE_CASES_SYSTEM_APPENDIX,
} from "./legacy-as-is-use-cases.util.js";

const SAMPLE_AS_IS_MDD = `# MDD

## 1. Contexto

### AS-IS (Estado Actual)

Plataforma OOH IMJ.

### Usuarios y casos de uso clave

- **Ejecutivo Comercial** — ventas y cotización.
- **Operaciones** — inventario y cumplimiento.

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

describe("legacy-as-is-use-cases.util", () => {
  it("buildMddContextForLegacyAsIsUseCases excluye rutas §4", () => {
    const out = buildMddContextForLegacyAsIsUseCases(SAMPLE_AS_IS_MDD);
    assert.match(out, /Ejecutivo Comercial/);
    assert.match(out, /campania/);
    assert.doesNotMatch(out, /\/campanias/);
  });

  it("checklist incluye actores, módulos y matriz", () => {
    const cl = buildLegacyAsIsUseCasesCoverageChecklist(SAMPLE_AS_IS_MDD);
    assert.match(cl, /Ejecutivo Comercial/);
    assert.match(cl, /Campañas/);
    assert.match(cl, /Matriz de trazabilidad/);
    assert.match(cl, /Disponibilidad de medios/);
  });

  it("appendix prohíbe rutas HTTP en flujo principal", () => {
    assert.match(LEGACY_AS_IS_USE_CASES_SYSTEM_APPENDIX, /PROHIBIDO.*HTTP/i);
    assert.match(LEGACY_AS_IS_USE_CASES_SYSTEM_APPENDIX, /dominio_flujos/);
  });
});
