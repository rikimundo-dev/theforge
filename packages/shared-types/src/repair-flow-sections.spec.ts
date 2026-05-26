import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { repairIndentedProseBlocks, repairJsonFenceIntegrity, repairPastedMarkdown } from "./repair-pasted-markdown.js";
import { repairFlowSectionsToMermaid } from "./repair-flow-sections.js";

describe("repairIndentedProseBlocks", () => {
  it("convierte pasos de webhook indentados a bullets", () => {
    const raw = `### Flujo de sincronización vía webhooks

    Evento en sistema origen: Cuando se crea un registro.
    Endpoint receptor: POST /api/v1/webhooks.
    Procesamiento: upsert tabla espejo.
`;
    const out = repairIndentedProseBlocks(raw);
    assert.match(out, /^- Evento en sistema origen:/m);
    assert.doesNotMatch(out, /^    Evento/m);
  });
});

describe("repairFlowSectionsToMermaid", () => {
  it("inserta flowchart TD bajo Flujo de sincronización", () => {
    const raw = `### Flujo de sincronización vía webhooks

- Evento en origen: disparo webhook.
- Endpoint receptor: POST genérico.
- Procesamiento: upsert.
`;
    const out = repairFlowSectionsToMermaid(raw);
    assert.match(out, /```mermaid\nflowchart TD/);
    assert.match(out, /s0\("/);
  });
});

describe("repairJsonFenceIntegrity", () => {
  it("cierra json antes de **Beneficios**", () => {
    const raw = '```json\n{ "status": "ok" }\n\n**Beneficios de las** tablas';
    const out = repairJsonFenceIntegrity(raw);
    assert.match(out, /```\n\n\*\*Beneficios/);
  });
});

describe("repairPastedMarkdown flujo Odoo", () => {
  it("normaliza **Flujo de procesamiento** pegado", () => {
    const raw =
      "**Flujo de procesamiento** **Odoo genera** una OC.\n    Odoo envía el payload.\n    Si existe:\n        Actualiza actual_amount.\n    Si no existe:\n        Crea registro.\n    Responde con el resultado.\n";
    const out = repairPastedMarkdown(raw);
    assert.match(out, /### Flujo de procesamiento/);
    assert.match(out, /```mermaid/);
    assert.match(out, /p1\("Odoo envía el payload/);
  });
});
