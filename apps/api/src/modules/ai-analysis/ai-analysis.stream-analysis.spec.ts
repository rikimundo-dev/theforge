import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AiAnalysisService } from "./ai-analysis.service.js";

const RECURSION_RAW =
  "Recursion limit of 25 reached without hitting a stop condition";

function createServiceWithMockGraph(): AiAnalysisService {
  return new AiAnalysisService(
    {} as never,
    { getCheckpointer: async () => null } as never,
    { getPreferencesForContext: async () => undefined } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    () =>
      ({
        stream: async () => {
          throw new Error(RECURSION_RAW);
        },
      }) as ReturnType<typeof import("./graph/dbga-graph.js").createDbgaGraph>,
  );
}

describe("AiAnalysisService.streamAnalysis", () => {
  it("yields error NDJSON con mensaje español cuando graph.stream lanza recursion limit", async () => {
    assert.match(RECURSION_RAW, /25/);

    const service = createServiceWithMockGraph();
    const events: Array<{ type: string; message?: string }> = [];
    for await (const event of service.streamAnalysis("plataforma B2B interna")) {
      events.push(event);
    }

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "error");
    const message = events[0].message ?? "";
    assert.match(message, /competidores directos/i);
    assert.match(message, /B2B/i);
    assert.doesNotMatch(message, /Recursion limit/i);
    assert.doesNotMatch(message, /recursion limit/i);
  });
});
