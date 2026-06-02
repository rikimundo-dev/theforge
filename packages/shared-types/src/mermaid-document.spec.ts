import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMermaidInDocument, stripMarkdownLeakFromMermaidDiagramBody } from "./mermaid.js";
import { formatDocumentMarkdown } from "./format-document-markdown.js";

describe("stripMarkdownLeakFromMermaidDiagramBody", () => {
  it("trunca TechnicalMetadata filtrado en sequenceDiagram", () => {
    const body = `sequenceDiagram
  participant API
  participant DB
  API->>DB: SELECT
  DB-->>API: rows
**TechnicalMetadata**- \`cicd_pipeline\`: pipeline CI`;
    const out = stripMarkdownLeakFromMermaidDiagramBody(body);
    assert.match(out, /DB-->>API: rows/);
    assert.doesNotMatch(out, /TechnicalMetadata/);
    assert.doesNotMatch(out, /cicd_pipeline/);
  });
});

describe("normalizeMermaidInDocument", () => {
  it("saca viñetas SSO pegadas dentro del fence mermaid", () => {
    const doc = `#### Flujo de autenticación

\`\`\`mermaid
flowchart TD
  evt["Evento"]
  post["POST"]
  evt --> post
- Usuario → Frontend sin token
- Al cargar la app, verificar token
\`\`\`

#### Integración backend`;
    const out = normalizeMermaidInDocument(doc);
    assert.match(out, /evt --> post/);
    assert.doesNotMatch(out, /post\n- Usuario/);
    assert.match(out, /```\n\n- Usuario → Frontend/);
    assert.match(out, /#### Integración backend/);
  });

  it("no fusiona markdown tras el cierre del bloque mermaid", () => {
    const doc = `### Flujo de sincronización

\`\`\`mermaid
flowchart TD
  s0("Paso uno")
  s0 --> s1
  s1("Paso dos")
\`\`\`

- Evento en sistema origen: texto largo
- Endpoint receptor: POST webhooks
`;
    const out = normalizeMermaidInDocument(doc);
    assert.match(out, /```\n\n- Evento en sistema/);
    assert.doesNotMatch(out, /s1\("Paso dos"\)\n- Evento/);
    assert.doesNotMatch(out, /--> s1- Evento/);
  });

  it("saca viñetas numeradas del fence de sincronización webhook", () => {
    const doc = `### Flujo de sincronización vía webhooks

\`\`\`mermaid
flowchart TD
  s0 --> s1
  s1 --> s2
- 1. **Evento en sistema origen:** texto
- 2. **Endpoint receptor:** POST
\`\`\`

### Endpoint receptor`;
    const out = normalizeMermaidInDocument(doc);
    assert.doesNotMatch(out, /s1 --> s2\n- 1\./);
    assert.match(out, /```\n\n- 1\. \*\*Evento/);
  });
});

describe("formatDocumentMarkdown + mermaid", () => {
  it("preserva bullets fuera del fence", () => {
    const doc = `## Doc

\`\`\`mermaid
flowchart TD
  a("A") --> b("B")
\`\`\`

## Siguiente`;
    const out = formatDocumentMarkdown(doc);
    assert.match(out, /```mermaid[\s\S]*?```[\s\S]*## Siguiente/);
  });
});
