import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandCollapsedSqlText,
  extractCreateStatements,
  repairCollapsedSqlParagraphs,
} from "./repair-collapsed-sql.js";
import { repairPastedMarkdown } from "./repair-pasted-markdown.js";

const OBP_COLLAPSED = `-- Tabla espejo de ubicaciones (desde OBP — estructura plana) CREATE TABLE ubicaciones_obp ( id UUID PRIMARY KEY, nombre_VARCHAR(255) NOT NULL, siglas_VARCHAR(10), audiencia BIGINT, geolocalizacion JSONB, tipo_VARCHAR(50), -- 'PAIS', 'ESTADO', 'CIUDAD' (se infiere del contexto) pais_referencia_VARCHAR(255), -- campo libre mientras no se normalice estado_referencia_VARCHAR(255), created_at TIMESTAMPTZ DEFAULT_NOW(), updated_at TIMESTAMPTZ DEFAULT_NOW() );

-- Tabla espejo de formatos de medio (desde OBP) CREATE TABLE formatos_medio_obp ( id UUID PRIMARY KEY, nombre_VARCHAR(255) NOT NULL, siglas_VARCHAR(10), descripcion TEXT, ubicacion_id UUID REFERENCES_ubicaciones_obp(id), -- mientras no haya país explícito created_at TIMESTAMPTZ DEFAULT_NOW(), updated_at TIMESTAMPTZ DEFAULT_NOW() );

-- Tabla espejo de medios (desde OBP) CREATE TABLE medios_obp ( id UUID PRIMARY KEY, ubicacion_id UUID NOT NULL REFERENCES_ubicaciones_obp(id) ON DELETE CASCADE, formato_medio_id UUID REFERENCES_formatos_medio_obp(id), clave_VARCHAR(100) NOT NULL, nombre_VARCHAR(255) NOT NULL, audiencia BIGINT, geolocalizacion JSONB, flags JSONB, activo BOOLEAN DEFAULT TRUE, calificacion INTEGER CHECK (calificacion >= 1 AND calificacion <= 5), created_at TIMESTAMPTZ DEFAULT_NOW(), updated_at TIMESTAMPTZ DEFAULT_NOW() );`;

describe("extractCreateStatements", () => {
  it("extrae 3 tablas OBP colapsadas", () => {
    const stmts = extractCreateStatements(OBP_COLLAPSED);
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0]!.name, "ubicaciones_obp");
    assert.equal(stmts[2]!.name, "medios_obp");
  });
});

describe("repairCollapsedSqlParagraphs", () => {
  it("envuelve Esquema SQL OBP en fence multilínea", () => {
    const raw = `Esquema SQL para tablas espejo (OBP — estructura desnormalizada)

${OBP_COLLAPSED}

### Flujo de sincronización`;
    const out = repairCollapsedSqlParagraphs(raw);
    assert.match(out, /### Esquema SQL/);
    assert.match(out, /```sql\n-- Tabla espejo de ubicaciones/);
    assert.match(out, /CREATE TABLE ubicaciones_obp \(\n/);
    assert.match(out, /nombre VARCHAR\(255\)/); // tras repairPastedMarkdown
    assert.match(out, /```\n\n### Flujo de sincronización/);
  });
});

describe("repairPastedMarkdown OBP SQL", () => {
  it("formatea SQL colapsado del usuario", () => {
    const raw = `### Esquema SQL para tablas espejo (OBP — estructura desnormalizada)

${OBP_COLLAPSED}`;
    const out = repairPastedMarkdown(raw);
    assert.match(out, /```sql/);
    assert.match(out, /REFERENCES ubicaciones_obp/);
    assert.match(out, /DEFAULT NOW\(\)/);
    assert.doesNotMatch(out, /nombre_VARCHAR/);
  });
});
