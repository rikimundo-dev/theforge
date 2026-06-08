import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePhase0LlmJson } from "../phase0-llm-json.util.js";
import {
  parsePhase0GapsEnvelope,
  rehydrateInterviewState,
  serializePhase0GapsEnvelope,
} from "../phase0-interview-persist.util.js";
import type { Phase0Document, Phase0InterviewState } from "../phase0.types.js";

describe("parsePhase0LlmJson", () => {
  it("parsea JSON dentro de fences markdown", () => {
    const parsed = parsePhase0LlmJson('```json\n{"type":"question","question":"Hola"}\n```');
    assert.equal(parsed.type, "question");
    assert.equal(parsed.question, "Hola");
  });
});

describe("phase0 interview persist", () => {
  it("serializa y rehidrata el plan de preguntas", () => {
    const borrador: Phase0Document = {
      proposito: { problema: "x", usuarios: ["a"], outOfScope: [] },
      entidades: [{ nombre: "E", descripcion: "d", atributosClave: [] }],
      reglasNegocio: [],
      flujos: [],
      roles: [],
      integraciones: [],
      edgeCases: [],
      preguntasPendientes: [],
    };
    const state: Phase0InterviewState = {
      projectId: "p1",
      threadId: "t1",
      borrador,
      gaps: [],
      preguntasRealizadas: 1,
      maxPreguntas: 5,
      questionPlan: [
        {
          seccion: "proposito",
          criticidad: "critico",
          descripcion: "gap1",
          razon: "r",
          sugerenciaPregunta: "Q1",
        },
        {
          seccion: "entidades",
          criticidad: "critico",
          descripcion: "gap2",
          razon: "r",
          sugerenciaPregunta: "Q2",
        },
      ],
      planCursor: 1,
      status: "interviewing",
      inputRaw: "idea",
      inputType: "idea",
      historial: [],
    };

    const raw = serializePhase0GapsEnvelope(state);
    const envelope = parsePhase0GapsEnvelope(raw);
    assert.ok(envelope?.interview);
    const restored = rehydrateInterviewState("p1", borrador, envelope!, "t1");
    assert.equal(restored?.planCursor, 1);
    assert.equal(restored?.questionPlan.length, 2);
  });
});
