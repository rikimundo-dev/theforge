import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanApprovalChatContents,
  isPlanApprovalResumeMessage,
} from "./planApprovalChat.js";

describe("isPlanApprovalResumeMessage", () => {
  it("acepta confirmaciones habituales", () => {
    assert.equal(isPlanApprovalResumeMessage("sí"), true);
    assert.equal(isPlanApprovalResumeMessage("  ejecutar  "), true);
    assert.equal(isPlanApprovalResumeMessage("de acuerdo"), true);
  });

  it("rechaza peticiones de cambio", () => {
    assert.equal(isPlanApprovalResumeMessage("cambia dokploy por coolify"), false);
    assert.equal(isPlanApprovalResumeMessage(""), false);
  });
});

describe("buildPlanApprovalChatContents", () => {
  it("separa resumen y tareas (doble burbuja)", () => {
    const bubbles = buildPlanApprovalChatContents(
      "Impacto en §2.\n\n---\nRevisa la lista y confirma.",
      [{ step_id: "1", task_description: "Actualizar infra", node: "integration" }],
    );
    assert.equal(bubbles.length, 2);
    assert.match(bubbles[0], /Impacto/);
    assert.match(bubbles[1], /Tareas y responsables/);
    assert.doesNotMatch(bubbles[1], /Revisa la lista/);
  });
});
