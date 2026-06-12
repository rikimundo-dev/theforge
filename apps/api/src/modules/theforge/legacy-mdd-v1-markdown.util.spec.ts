import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  extractLegacyMddEvidencePayload,
  formatLegacyMddEvidenceToMarkdown,
  normalizeLegacyMddToolText,
  normalizeLegacyMddV1JsonBlocksInMarkdown,
  compactCodebaseDocForMddPrompt,
} from "./legacy-mdd-v1-markdown.util.js";

describe("legacy-mdd-v1-markdown.util", () => {
  const samplePayload = {
    summary: "Repo Strapi OBP.",
    openapi_spec: { found: false, path: null, trust_level: "low" },
    entities: [{ name: "campania", source: "strapi", fields: ["nombre:string", "activo:boolean"] }],
    api_contracts: [{ route: "/api/campanias", methods: ["GET", "POST"], doc_source: "strapi" }],
    business_logic: [],
    infrastructure: { orm: "none", env_vars: ["DATABASE_URL"] },
    risk_report: { complexity: 12, anti_patterns: [] },
    evidence_paths: ["src/api/campania/content-types/campania/schema.json", "package.json"],
  };

  test("parsea envelope legacy_mdd_v1 con bloque cypher posterior", () => {
    const envelope = {
      format: "legacy_mdd_v1",
      source: "generate_legacy_documentation",
      mddDocument: samplePayload,
      answer: JSON.stringify(samplePayload),
    };
    const text = `${JSON.stringify(envelope, null, 2)}\n\n\`\`\`cypher\nMATCH (n) RETURN n\n\`\`\``;
    const payload = extractLegacyMddEvidencePayload(text);
    assert.equal(payload?.summary, samplePayload.summary);
    const md = normalizeLegacyMddToolText(text);
    assert.match(md, /## Evidencia \(MDD estructurado/);
    assert.match(md, /\| campania \| strapi \|/);
    assert.match(md, /\| \/api\/campanias \| GET, POST \| strapi \|/);
    assert.doesNotMatch(md, /"legacy_mdd_v1"/);
  });

  test("formatLegacyMddEvidenceToMarkdown muestra tablas y trunca evidence_paths", () => {
    const manyPaths = Array.from({ length: 100 }, (_, i) => `src/file-${i}.ts`);
    const md = formatLegacyMddEvidenceToMarkdown({
      ...samplePayload,
      evidence_paths: manyPaths,
    });
    assert.match(md, /ruta\(s\) de evidencia adicional/);
    assert.match(md, /total: 100/);
  });

  test("normalizeLegacyMddV1JsonBlocksInMarkdown reemplaza JSON embebido", () => {
    const envelope = {
      format: "legacy_mdd_v1",
      mddDocument: samplePayload,
      answer: JSON.stringify(samplePayload),
    };
    const md = `# Doc\n\n${JSON.stringify(envelope)}\n`;
    const out = normalizeLegacyMddV1JsonBlocksInMarkdown(md);
    assert.match(out, /## Evidencia \(MDD estructurado/);
    assert.doesNotMatch(out, /"format": "legacy_mdd_v1"/);
  });

  test("compactCodebaseDocForMddPrompt recorta solo evidence_paths", () => {
    const paths = Array.from({ length: 300 }, (_, i) => `- \`src/f-${i}.js\``).join("\n");
    const md = `# Doc\n\n### Entidades\n\n| x |\n\n### Rutas de evidencia\n\n${paths}`;
    const out = compactCodebaseDocForMddPrompt(md, 50_000);
    assert.match(out, /### Entidades/);
    assert.match(out, /rutas omitidas en prompt/);
  });

  test("formatLegacyMddEvidenceToMarkdown incluye secciones vacías con diagnóstico", () => {
    const md = formatLegacyMddEvidenceToMarkdown({
      summary: "test",
      openapi_spec: { found: false, path: null, trust_level: "low" },
      entities: [],
      api_contracts: [],
      business_logic: [],
      infrastructure: { orm: "none", env_vars: [] },
      risk_report: { complexity: 1, anti_patterns: [] },
      evidence_paths: [],
    });
    assert.match(md, /StrapiContentType/);
    assert.match(md, /StrapiRoute/);
  });

  test("formatLegacyMddEvidenceToMarkdown muestra extracto de documentación complementaria", () => {
    const md = formatLegacyMddEvidenceToMarkdown({
      ...samplePayload,
      openapi_spec: {
        found: true,
        path: "src/api/campania/documentation/1.0.0/campania.json",
        trust_level: "medium",
        supplementary_doc_paths: ["INVENTARIO_ENDPOINTS_ERP_IMJMedia.md"],
        supplementary_docs: [
          {
            path: "INVENTARIO_ENDPOINTS_ERP_IMJMedia.md",
            excerpt: "## Inventario\n\n- GET /api/campanias",
            truncated: false,
            total_chars: 42,
          },
        ],
      },
    });
    assert.match(md, /#### Documentación complementaria/);
    assert.match(md, /INVENTARIO_ENDPOINTS_ERP_IMJMedia\.md/);
    assert.match(md, /GET \/api\/campanias/);
    assert.doesNotMatch(md, /"supplementary_docs"/);
  });
});
