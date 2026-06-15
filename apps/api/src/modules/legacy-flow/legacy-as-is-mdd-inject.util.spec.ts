import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAsIsSection3BodyFromCodebaseDoc,
  injectAsIsCodebaseEvidenceIntoMdd,
  stripEntitySummaryPlaceholders,
} from "./legacy-as-is-mdd-inject.util.js";

const ERP_SNIPPET = `
## Repositorio: desarrollo_imj/erp

### Entidades y modelo de datos
| Entidad | Origen | Atributos (muestra) |
| --- | --- | --- |
| campania | strapi | uid:api::campania.campania |
| pauta | strapi | uid:api::pauta.pauta |
| cotizador | strapi | uid:api::cotizador.cotizador |

### Contratos API
| Ruta | Métodos | Fuente |
| --- | --- | --- |
| /campanias | GET, POST | strapi |
`;

const OOH_SNIPPET = `
## Repositorio: desarrollo_imj/oohbp2

### Entidades y modelo de datos
| Entidad | Origen | Atributos (muestra) |
| --- | --- | --- |
| CampaniaModel | frontend | path:src/Models/CampaniaModel.tsx |

### Contratos API
| Ruta | Métodos | Fuente |
| --- | --- | --- |
| /api/campanias | GET | ast |
`;

describe("buildAsIsSection3BodyFromCodebaseDoc", () => {
  it("incluye tablas de todos los repos", () => {
    const body = buildAsIsSection3BodyFromCodebaseDoc(ERP_SNIPPET + OOH_SNIPPET);
    assert.ok(body);
    assert.match(body!, /campania/);
    assert.match(body!, /pauta/);
    assert.match(body!, /cotizador/);
    assert.match(body!, /CampaniaModel/);
    assert.match(body!, /Prohibido.*adicionales/i);
  });
});

describe("stripEntitySummaryPlaceholders", () => {
  it("elimina bloques de resumen LLM", () => {
    const raw =
      "### Dominio campañas\n\nTabla principal.\n\nOtras entidades significativas (60+ adicionales)\n\npauta, cotizador, ruta.";
    const out = stripEntitySummaryPlaceholders(raw);
    assert.doesNotMatch(out, /Otras entidades significativas/i);
    assert.doesNotMatch(out, /60\+ adicionales/i);
    assert.match(out, /Dominio campañas/);
  });
});

describe("injectAsIsCodebaseEvidenceIntoMdd", () => {
  it("reemplaza §3 resumido por inventario del codebaseDoc", () => {
    const mdd = `## 1. Contexto

Sistema OBP.

## 2. Arquitectura y Stack

Strapi + React.

## 3. Modelo de Datos

Otras entidades significativas (60+ adicionales)

pauta, cotizador, concepto-cotizador, ruta.

## 4. Contratos de API

Algunos endpoints.

## 5. Lógica y Edge Cases

Reglas.

## 6. Seguridad

Auth.

## 7. Infraestructura

Docker.
`;
    const out = injectAsIsCodebaseEvidenceIntoMdd(mdd, ERP_SNIPPET + OOH_SNIPPET);
    assert.doesNotMatch(out, /Otras entidades significativas/i);
    assert.match(out, /## 3\. Modelo de Datos[\s\S]*\| pauta \|/);
    assert.match(out, /## 4\. Contratos de API[\s\S]*\| \/campanias \|/);
    assert.match(out, /## 5\. Lógica/);
  });
});
