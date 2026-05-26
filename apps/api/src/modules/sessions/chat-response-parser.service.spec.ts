import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChatResponseParserService } from "./chat-response-parser.service.js";

const parser = new ChatResponseParserService();

describe("mergeDbgaOrUseFull", () => {
  const longDbga = `# Domain Benchmark & Gap Analysis

## Referencia de Industria
Contenido largo del benchmark original con muchos módulos y tablas.

## Módulo 07
Feature candidates existentes.`;

  it("conserva el documento si el modelo manda solo un fragmento corto", () => {
    const fragment = `## Dos objetivos centrales del microservicio
Listas de precios con niveles y márgenes.
Endpoint Odoo para costos reales.`;
    const merged = parser.mergeDbgaOrUseFull(longDbga, fragment);
    assert.ok(merged.includes("Referencia de Industria"));
    assert.ok(merged.includes("Dos objetivos centrales"));
    assert.ok(merged.length > longDbga.length * 0.9);
  });

  it("acepta reemplazo cuando el nuevo doc parece DBGA completo", () => {
    const full = `${longDbga}\n\n## Nuevo bloque\nMás texto.`.repeat(2);
    const merged = parser.mergeDbgaOrUseFull(longDbga, full);
    assert.equal(merged, full.trim());
  });

  it("acepta Research Report como documento completo de Fase 0", () => {
    const research = `# Research Report — Módulo de Costos OBP

## Módulos del proyecto
Contenido extenso del discovery con tablas y módulos numerados.`.repeat(8);
    const updated = `# Research Report — Módulo de Costos OBP

## Multi-tenancy
tenant_id en catálogo y tablas espejo.`.repeat(8);
    const merged = parser.mergeDbgaOrUseFull(research, updated);
    assert.ok(merged.includes("Multi-tenancy"));
    assert.ok(merged.includes("tenant_id"));
  });
});

describe("detectBenchmarkDocFallback", () => {
  it("detecta DBGA cuando el título está en la primera línea (index 0)", () => {
    const text = `# Domain Benchmark & Gap Analysis

## Integración OBP / OBP4MO
Tablas espejo y normalización.

He añadido la sección de integración.`;
    const split = parser.detectBenchmarkDocFallback(text);
    assert.ok(split);
    assert.ok(split!.docPart.includes("Integración OBP"));
  });

  it("detecta sección ## Integración sin título Domain Benchmark", () => {
    const text = `## Integración con sistemas externos (OBP4MO y OBP)

Tablas espejo en el microservicio para cálculos ágiles.
OBP4MO normalizado (País → Estado → Ciudad); OBP con ubicación plana.
Ciudad y Ubicación desprenden medios (Indoors, Outdoor, Camiones).
El país define formatos de medio asociados a cada medio.`;
    const split = parser.detectBenchmarkDocFallback(text);
    assert.ok(split);
    assert.ok(split!.docPart.includes("OBP4MO"));
  });
});

describe("salvage path via detectDocFallback benchmark", () => {
  it("ruta benchmark delega a detectBenchmarkDocFallback", () => {
    const text = `# Domain Benchmark & Gap Analysis

## Módulo 1
Contenido de referencia de industria con suficiente extensión para superar el umbral mínimo de detección del parser en tests automatizados y validar la ruta detectDocFallback con tab benchmark.`;
    const split = parser.detectDocFallback(text, "benchmark");
    assert.ok(split);
    assert.ok(split!.docPart.startsWith("# Domain Benchmark"));
  });
});
