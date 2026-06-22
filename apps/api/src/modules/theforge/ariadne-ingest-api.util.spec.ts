import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveAriadneApiBaseFromMcpUrl,
  isAriadneBrownfieldConvergeAutoEnabled,
  normalizeAriadneBrownfieldConvergeMode,
  resolveAriadneIngestApiConfig,
} from "./ariadne-ingest-api.util.js";

describe("ariadne-ingest-api.util", () => {
  it("derives /api from /mcp URL", () => {
    assert.equal(
      deriveAriadneApiBaseFromMcpUrl("https://relicai.obp.mx/mcp"),
      "https://relicai.obp.mx/api",
    );
  });

  it("normalizes converge mode", () => {
    assert.equal(normalizeAriadneBrownfieldConvergeMode("bogus"), "incremental");
    assert.equal(normalizeAriadneBrownfieldConvergeMode("all"), "all");
  });

  it("auto wire enabled by default", () => {
    const prev = process.env.ARIADNE_BROWNFIELD_CONVERGE_AUTO;
    delete process.env.ARIADNE_BROWNFIELD_CONVERGE_AUTO;
    assert.equal(isAriadneBrownfieldConvergeAutoEnabled(), true);
    process.env.ARIADNE_BROWNFIELD_CONVERGE_AUTO = "0";
    assert.equal(isAriadneBrownfieldConvergeAutoEnabled(), false);
    if (prev === undefined) delete process.env.ARIADNE_BROWNFIELD_CONVERGE_AUTO;
    else process.env.ARIADNE_BROWNFIELD_CONVERGE_AUTO = prev;
  });

  it("resolves API config from MCP URL + token", () => {
    const cfg = resolveAriadneIngestApiConfig({
      mcpUrl: "https://relicai.obp.mx/mcp",
      envMcpToken: "ari_test",
    });
    assert.ok(cfg);
    assert.equal(cfg?.baseUrl, "https://relicai.obp.mx/api");
    assert.equal(cfg?.bearerToken, "ari_test");
    assert.equal(cfg?.directIngest, false);
  });
});
