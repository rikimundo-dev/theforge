import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCollectedResultsForMarkdown,
  formatGatheredContextForMarkdown,
  formatRawEvidenceObjectToMarkdown,
  indexOfMatchingJsonObjectEnd,
  normalizeRawEvidenceJsonBlocksInMarkdown,
} from "./theforge-raw-evidence-markdown.js";

test("indexOfMatchingJsonObjectEnd cierra objeto con strings", () => {
  const s = 'xx {"a": "x}", "b": 1} yy';
  const i = s.indexOf("{");
  const end = indexOfMatchingJsonObjectEnd(s, i);
  assert.ok(end > i);
  assert.deepEqual(JSON.parse(s.slice(i, end + 1)), { a: "x}", b: 1 });
});

test("formatGatheredContextForMarkdown extrae conteos y muestras", () => {
  const raw = `[deterministic:get_graph_summary]
Conteos: {"File":3,"Model":2}. Muestras: {
  "File": [{"path": "src/a.ts"},{"path": "src/b.ts"}],
  "Model": [{"path": "src/m.ts", "name": "MMod"}]
}

---

[deterministic:semantic_search:abc]
Algo de texto sin conteos ni muestras pero largo.`;

  const md = formatGatheredContextForMarkdown(raw);
  assert.match(md, /\*\*Conteos \(nodos por etiqueta\)\*\*/);
  assert.match(md, /\| File \| 3 \|/);
  assert.match(md, /##### File \(2 de 2\)/);
  assert.match(md, /`src\/a\.ts`/);
  assert.match(md, /`src\/m\.ts` — MMod/);
  assert.match(md, /#### \[deterministic:semantic_search:abc\]/);
});

test("formatCollectedResultsForMarkdown tabla compacta", () => {
  const md = formatCollectedResultsForMarkdown([
    { tipo: "Model", path: "src/x.ts", name: "X", repoId: "008d1887-c414-40ab-a36a-cd06559864f4" },
    { path: "solo-path" },
  ]);
  assert.match(md, /\| tipo \| path \| name \| repoId \|/);
  assert.match(md, /\| Model \|/);
  assert.match(md, /solo-path/);
});

test("normalizeRawEvidenceJsonBlocksInMarkdown reemplaza JSON pegado por el LLM", () => {
  const inner = `[deterministic:get_graph_summary]
Conteos: {"File":2}. Muestras: {"File":[{"path":"a.ts"}]}`;
  const blob = {
    mode: "raw_evidence",
    deterministicRetriever: true,
    gatheredContext: inner,
    collectedResults: [{ tipo: "Model", path: "m.ts", name: "M" }],
    cypher: "MATCH (n) RETURN n LIMIT 1",
  };
  const md = `## 1. Foo\n\n${JSON.stringify(blob, null, 2)}\n\n## 2. Bar\n\nprosa`;
  const out = normalizeRawEvidenceJsonBlocksInMarkdown(md);
  assert.match(out, /## Evidencia \(raw_evidence/);
  assert.match(out, /\*\*Conteos \(nodos por etiqueta\)\*\*/);
  assert.match(out, /### cypher/);
  assert.match(out, /## 2\. Bar/);
  assert.ok(!out.includes('"mode": "raw_evidence"'));
});

test("formatRawEvidenceObjectToMarkdown coincide con claves esperadas", () => {
  const s = formatRawEvidenceObjectToMarkdown({
    mode: "raw_evidence",
    gatheredContext: "[deterministic:x]\nConteos: {\"A\":1}. Muestras: {\"A\":[{\"path\":\"p\"}]}",
  });
  assert.match(s, /### gatheredContext/);
  assert.match(s, /\| A \| 1 \|/);
});
