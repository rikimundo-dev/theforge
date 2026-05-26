import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { repairIndentedProseBlocks, repairJsonFenceIntegrity, repairPastedMarkdown } from "./repair-pasted-markdown.js";
import { repairFlowSectionsToMermaid } from "./repair-flow-sections.js";
import { formatDocumentMarkdown } from "./format-document-markdown.js";

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const webhookFlowFixture = readFileSync(
  join(fixtureDir, "mermaid-webhook-flow.fixture.txt"),
  "utf8",
);

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

  it("reemplaza mermaid JSON-aplanado bajo Flujo de sin borrarlo", () => {
    const raw = `### Flujo de sincronización vía webhooks

\`\`\`mermaid
flowchart TD
  s0("")
  s1("event — created ,")
  s0 --> s1
  s2("tenant_id — uuid ,")
  s1 --> s2
\`\`\`

### Beneficios
`;
    const out = repairFlowSectionsToMermaid(raw);
    assert.match(out, /```mermaid[\s\S]*?```/);
    assert.match(out, /evt\["Evento en sistema origen/);
    assert.match(out, /POST \/api\/v1\/webhooks/);
    assert.doesNotMatch(out, /s0\(""\)/);
    assert.match(out, /### Beneficios/);
  });

  it("fixture usuario: reemplaza s0..s27 y saca Beneficios del diagrama", () => {
    const out = repairFlowSectionsToMermaid(webhookFlowFixture);
    assert.match(out, /evt\["Evento en sistema origen/);
    assert.doesNotMatch(out, /s22\("\*\*Beneficios/);
    assert.doesNotMatch(out, /s27\("---"\)/);
    assert.match(out, /### Beneficios de las tablas espejo/);
  });

  it("formatDocumentMarkdown aplica el mismo arreglo al fixture", () => {
    const out = formatDocumentMarkdown(webhookFlowFixture);
    assert.match(out, /```mermaid[\s\S]*?upsert --> rsp[\s\S]*?```/);
    assert.doesNotMatch(out, /\bs27\b/);
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
