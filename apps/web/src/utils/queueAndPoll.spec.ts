import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contentFieldForGenerateUrl,
  extractProjectIdFromGenerateUrl,
  isFireAndForgetQueueResponse,
  isProjectGenerationComplete,
} from "./queueAndPollHelpers.js";

describe("queueAndPoll helpers", () => {
  it("detecta respuesta fire-and-forget por jobId bg-*", () => {
    assert.equal(
      isFireAndForgetQueueResponse({ queued: true, jobId: "bg-1781638259186", statusPath: null }),
      true,
    );
  });

  it("detecta respuesta fire-and-forget por statusPath null", () => {
    assert.equal(
      isFireAndForgetQueueResponse({ queued: true, jobId: "real-job", statusPath: null }),
      true,
    );
  });

  it("no trata job BullMQ real como fire-and-forget", () => {
    assert.equal(
      isFireAndForgetQueueResponse({
        queued: true,
        jobId: "42",
        statusPath: "/projects/jobs/42",
      }),
      false,
    );
  });

  it("extrae projectId y campo de contenido desde la URL generate-*", () => {
    const url = "http://localhost:5173/api/projects/abc-123/generate-agent-governance";
    assert.equal(extractProjectIdFromGenerateUrl(url), "abc-123");
    assert.equal(contentFieldForGenerateUrl(url), "agentGovernanceContent");
  });

  it("marca generación completa cuando el contenido cambia respecto al baseline", () => {
    assert.equal(
      isProjectGenerationComplete(
        { agentGovernanceContent: '{"files":[]}' },
        "agentGovernanceContent",
        '{"files":[{"path":"old"}]}',
      ),
      true,
    );
  });

  it("no marca completa si el contenido sigue igual al baseline", () => {
    const baseline = '{"files":[{"path":"same"}]}';
    assert.equal(
      isProjectGenerationComplete(
        { agentGovernanceContent: baseline },
        "agentGovernanceContent",
        baseline,
      ),
      false,
    );
  });

  it("marca completa en primera generación cuando hay contenido nuevo", () => {
    assert.equal(
      isProjectGenerationComplete(
        { agentGovernanceContent: '{"files":[]}' },
        "agentGovernanceContent",
        null,
      ),
      true,
    );
  });

  it("marca completa en regeneración forzada con baseline null aunque el JSON sea igual", () => {
    const content = '{"files":[{"path":"same"}]}';
    assert.equal(
      isProjectGenerationComplete(
        { agentGovernanceContent: content },
        "agentGovernanceContent",
        null,
      ),
      true,
    );
  });
});
