import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMermaidInDocument } from "./mermaid.js";
import { formatDocumentMarkdown } from "./format-document-markdown.js";

describe("normalizeMermaidInDocument", () => {
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
