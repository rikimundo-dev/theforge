import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendComponentDiagramToCodebaseDoc,
  buildLegacyComponentDiagramMermaid,
  injectComponentDiagramIntoMddSection2,
  parseLegacyCodebaseDocEvidence,
} from "./legacy-component-diagram.util.js";

const ERP_SNIPPET = `
## Repositorio: desarrollo_imj/erp

### Entidades y modelo de datos
| Entidad | Origen | Atributos (muestra) |
| --- | --- | --- |
| campania | strapi | uid:api::campania.campania |

### Contratos API
| Ruta | Métodos | Fuente |
| --- | --- | --- |
| /campanias | GET, POST | strapi |

### Lógica de negocio
| Servicio | Dependencias (paths) |
| --- | --- |
| strapi:campania | src/api/campania/services/campania.js |

### Infraestructura
\`\`\`json
{ "orm": "strapi", "env_vars": [] }
\`\`\`
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

### Lógica de negocio
| Servicio | Dependencias (paths) |
| --- | --- |
| frontend:CampaniaQuerys | src/api/CampaniaQuerys.tsx |
`;

describe("parseLegacyCodebaseDocEvidence", () => {
  it("detecta frontend + strapi en multi-root", () => {
    const ev = parseLegacyCodebaseDocEvidence(ERP_SNIPPET + OOH_SNIPPET);
    assert.equal(ev.repos.length, 2);
    assert.equal(ev.repos[0]!.kind, "strapi");
    assert.equal(ev.repos[1]!.kind, "frontend");
    assert.equal(ev.repos[0]!.apiRouteCount, 1);
  });
});

describe("buildLegacyComponentDiagramMermaid", () => {
  it("genera flowchart frontend→backend", () => {
    const mermaid = buildLegacyComponentDiagramMermaid(
      parseLegacyCodebaseDocEvidence(ERP_SNIPPET + OOH_SNIPPET),
    );
    assert.ok(mermaid);
    assert.match(mermaid!, /flowchart TB/);
    assert.match(mermaid!, /HTTP REST/);
    assert.match(mermaid!, /oohbp2/);
    assert.match(mermaid!, /erp/);
  });
});

describe("appendComponentDiagramToCodebaseDoc", () => {
  it("añade sección una sola vez", () => {
    const once = appendComponentDiagramToCodebaseDoc(ERP_SNIPPET + OOH_SNIPPET);
    assert.match(once, /(?:^|\n)## Diagrama de Componentes/);
    assert.match(once, /```mermaid/);
    const twice = appendComponentDiagramToCodebaseDoc(once);
    assert.equal(twice, once);
  });
});

describe("injectComponentDiagramIntoMddSection2", () => {
  it("inyecta en §2 del MDD de cambio", () => {
    const mdd = `## 1. Contexto\n\nFoo.\n\n## 2. Arquitectura y Stack\n\nBackend Strapi.\n\n## 3. Modelo de Datos\n\nBar.\n`;
    const out = injectComponentDiagramIntoMddSection2(mdd, ERP_SNIPPET + OOH_SNIPPET);
    assert.match(out, /## 2\. Arquitectura[\s\S]*### Diagrama de Componentes/);
    assert.match(out, /### Diagrama de Componentes[\s\S]*## 3\. Modelo de Datos/);
  });
});
