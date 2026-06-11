import { describe, expect, it } from "vitest";
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

  it("parsea envelope legacy_mdd_v1 con bloque cypher posterior", () => {
    const envelope = {
      format: "legacy_mdd_v1",
      source: "generate_legacy_documentation",
      mddDocument: samplePayload,
      answer: JSON.stringify(samplePayload),
    };
    const text = `${JSON.stringify(envelope, null, 2)}\n\n\`\`\`cypher\nMATCH (n) RETURN n\n\`\`\``;
    const payload = extractLegacyMddEvidencePayload(text);
    expect(payload?.summary).toBe(samplePayload.summary);
    const md = normalizeLegacyMddToolText(text);
    expect(md).toContain("## Evidencia (MDD estructurado");
    expect(md).toContain("| campania | strapi |");
    expect(md).toContain("| /api/campanias | GET, POST | strapi |");
    expect(md).not.toContain('"legacy_mdd_v1"');
  });

  it("formatLegacyMddEvidenceToMarkdown muestra tablas y trunca evidence_paths", () => {
    const manyPaths = Array.from({ length: 100 }, (_, i) => `src/file-${i}.ts`);
    const md = formatLegacyMddEvidenceToMarkdown({
      ...samplePayload,
      evidence_paths: manyPaths,
    });
    expect(md).toContain("ruta(s) de evidencia adicional");
    expect(md).toContain("total: 100");
  });

  it("normalizeLegacyMddV1JsonBlocksInMarkdown reemplaza JSON embebido", () => {
    const envelope = {
      format: "legacy_mdd_v1",
      mddDocument: samplePayload,
      answer: JSON.stringify(samplePayload),
    };
    const md = `# Doc\n\n${JSON.stringify(envelope)}\n`;
    const out = normalizeLegacyMddV1JsonBlocksInMarkdown(md);
    expect(out).toContain("## Evidencia (MDD estructurado");
    expect(out).not.toContain('"format": "legacy_mdd_v1"');
  });

  it("compactCodebaseDocForMddPrompt recorta solo evidence_paths", () => {
    const paths = Array.from({ length: 300 }, (_, i) => `- \`src/f-${i}.js\``).join("\n");
    const md = `# Doc\n\n### Entidades\n\n| x |\n\n### Rutas de evidencia\n\n${paths}`;
    const out = compactCodebaseDocForMddPrompt(md, 50_000);
    expect(out).toContain("### Entidades");
    expect(out).toContain("rutas omitidas en prompt");
  });

  it("formatLegacyMddEvidenceToMarkdown incluye secciones vacías con diagnóstico", () => {
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
    expect(md).toContain("StrapiContentType");
    expect(md).toContain("StrapiRoute");
  });
});
