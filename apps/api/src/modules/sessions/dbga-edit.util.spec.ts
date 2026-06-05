import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BENCHMARK_CHAT_ACK,
  benchmarkAssistantChatMessage,
  dbgaReflectsUserEditIntent,
  isDbgaContentNearlyIdentical,
  isPartialBenchmarkDoc,
  looksLikeDbgaEditRequest,
  mergeBenchmarkPartialDoc,
  parseBenchmarkResponse,
  wouldShrinkDbgaDangerously,
} from "./dbga-edit.util.js";

describe("looksLikeDbgaEditRequest", () => {
  it("detecta petición de cambio multi-tenant", () => {
    assert.ok(
      looksLikeDbgaEditRequest(
        "Hay que hacer modificaciones. El catálogo debe ser multi tenant con tenant_id en OBP y OBP4MO",
      ),
    );
  });
});

describe("dbgaReflectsUserEditIntent", () => {
  it("falla si piden tenant_id y el doc no lo tiene", () => {
    const doc = "# Research Report\n\n## Módulo 01\nSin tenant.";
    const user =
      "todo el microservicio sea multi tenant lógico a través de un tenant_id";
    assert.equal(dbgaReflectsUserEditIntent(doc, user), false);
  });

  it("pasa si el doc incluye tenant_id", () => {
    const doc = "## Multi-tenancy\n`tenant_id` en catálogo y tablas espejo.";
    const user = "multi tenant con tenant_id";
    assert.equal(dbgaReflectsUserEditIntent(doc, user), true);
  });

  it("falla si piden tablas espejo geográficas y el doc no las menciona", () => {
    const doc = "# Research Report\n\n## Catálogo\nSolo costos.";
    const user =
      "diagrama con paises, estados, ciudades; debemos tener espejo con tenant_id";
    assert.equal(dbgaReflectsUserEditIntent(doc, user), false);
  });

  it("pasa si piden id de origen e id propio en tablas espejo", () => {
    const doc = `### Tablas espejo
| tabla | tenant_id | origin_id | id_espejo |
| paises_espejo | uuid | int origen | bigint PK |`;
    const user =
      "En todas las tablas espejo necesitamos el id de origen y el id propio de la tabla espejo";
    assert.equal(dbgaReflectsUserEditIntent(doc, user), true);
  });
});

describe("looksLikeDbgaEditRequest — ajustes", () => {
  it("detecta «haz los ajustes»", () => {
    assert.ok(
      looksLikeDbgaEditRequest(
        "En todas las tablas espejo necesitamos el id de origen y el id propio, haz los ajustes",
      ),
    );
  });
});

describe("benchmarkAssistantChatMessage", () => {
  it("no afirma éxito si no hubo persistencia", () => {
    const msg = benchmarkAssistantChatMessage(BENCHMARK_CHAT_ACK, undefined);
    assert.match(msg, /No se guardaron cambios/i);
  });

  it("mantiene ack cuando sí hubo doc", () => {
    const msg = benchmarkAssistantChatMessage(BENCHMARK_CHAT_ACK, "# DBGA\n\ntenant_id");
    assert.equal(msg, BENCHMARK_CHAT_ACK);
  });
});

describe("isDbgaContentNearlyIdentical", () => {
  it("detecta copias casi iguales", () => {
    const a = "x".repeat(10_000);
    const b = a + " ";
    assert.equal(isDbgaContentNearlyIdentical(b, a), true);
  });
});

describe("parseBenchmarkResponse", () => {
  it("separa doc y chat con ---FIN_DBGA---", () => {
    const text = "### Módulos\n\nContenido tenant_id.\n\n---FIN_DBGA---\nListo, revisa el panel.";
    const split = parseBenchmarkResponse(text);
    assert.ok(split);
    assert.match(split!.docPart, /tenant_id/);
    assert.match(split!.chatPart, /revisa el panel/i);
  });

  it("tolera espacios en el delimitador", () => {
    const text = "## Arquitectura\n\n--- FIN_DBGA ---\nOk.";
    const split = parseBenchmarkResponse(text);
    assert.ok(split);
    assert.match(split!.docPart, /Arquitectura/);
  });
});

describe("mergeBenchmarkPartialDoc", () => {
  it("conserva cabecera Research Report al recibir fragmento ### Módulos", () => {
    const current = "# Research Report — Costos\n\n**Etapa:** principal\n\n## Intro\n\nTexto previo.";
    const partial = "### Módulos del proyecto\n\n| 01 | Catálogo | tenant_id |";
    const merged = mergeBenchmarkPartialDoc(current, partial);
    assert.match(merged, /^# Research Report/);
    assert.match(merged, /tenant_id/);
    assert.doesNotMatch(merged, /Texto previo/);
  });
});

describe("wouldShrinkDbgaDangerously", () => {
  it("bloquea fragmento que borra la mayor parte del doc", () => {
    const current = "# Research Report\n\n" + "x".repeat(5000);
    const fragment = "### Módulos\n\n" + "y".repeat(800);
    assert.equal(wouldShrinkDbgaDangerously(current, fragment), true);
  });
});
