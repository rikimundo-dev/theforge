import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMddQuestionPlan,
  hasMddAuditDocument,
  isMddAuditPass,
} from "../mdd-manual-audit.util.js";
import { validateMddStructure } from "../../utils/mdd-sanitize.js";

describe("mdd manual audit util", () => {
  it("hasMddAuditDocument exige contenido mínimo", () => {
    assert.equal(hasMddAuditDocument(""), false);
    assert.equal(hasMddAuditDocument("x".repeat(199)), false);
    assert.equal(hasMddAuditDocument("x".repeat(200)), true);
  });

  it("isMddAuditPass requiere score, secciones y sin gaps críticos", () => {
    const validation = validateMddStructure("# MDD\n\n## 1. Contexto\n\n## 2. Alcance\n");
    assert.equal(isMddAuditPass(90, validation, null), false);
    assert.equal(
      isMddAuditPass(90, { ...validation, missingSections: [] }, {
        score: 90,
        status: "APROBADO",
        critical_gaps: [],
        syntax_errors: [],
        infrastructure_ready: true,
      }),
      true,
    );
  });

  it("buildMddQuestionPlan prioriza secciones faltantes y gaps críticos", () => {
    const plan = buildMddQuestionPlan(
      {
        missingSections: ["6. Seguridad"],
        section3HasPayloads: true,
        hasTechnicalMetadata: true,
        sectionOrderCorrect: true,
        issues: [],
      },
      {
        score: 70,
        status: "RECHAZADO",
        critical_gaps: [
          { sections: ["4"], issue: "Auth incompleta", fix: "¿Qué proveedor OAuth usan?" },
        ],
        syntax_errors: [],
        infrastructure_ready: false,
      },
    );
    assert.ok(plan.length >= 2);
    assert.ok(plan.some((p) => p.issue.includes("Auth incompleta")));
    assert.ok(plan.some((p) => p.issue.includes("Seguridad")));
  });
});
