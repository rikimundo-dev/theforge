import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProposedComponentDiagramMermaid,
  injectProposedComponentDiagramIntoSection2,
  parseGreenfieldMddSignals,
} from "./mdd-component-diagram.util.js";

const SAMPLE_MDD = `# Master Design Document

## 1. Contexto

Plataforma SSO con MFA.

## 2. Arquitectura y Stack

### 2.1 Backend
NestJS v10 con módulos por dominio.

### 2.2 Frontend
React 18 + Vite.

### 2.3 Datos
PostgreSQL 16 para identidad; Redis para colas de email.

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE users (id UUID PRIMARY KEY, email TEXT NOT NULL);
CREATE TABLE sessions (id UUID PRIMARY KEY, user_id UUID NOT NULL);
\`\`\`

## 4. Contratos de API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/refresh | Refresh |

### POST /api/auth/login

Autenticación.

## 5. Lógica y Edge Cases

Refresh rotativo.

## 6. Seguridad

(Pendiente)

## 7. Infraestructura

(Pendiente)
`;

describe("mdd-component-diagram.util", () => {
  it("parseGreenfieldMddSignals detecta stack y conteos", () => {
    const signals = parseGreenfieldMddSignals(SAMPLE_MDD);
    assert.ok(signals);
    assert.equal(signals!.frontend, "React");
    assert.equal(signals!.backend, "NestJS");
    assert.equal(signals!.primaryDb, "PostgreSQL");
    assert.equal(signals!.cacheOrQueue, "Redis");
    assert.equal(signals!.tableCount, 2);
    assert.ok(signals!.endpointCount >= 2);
  });

  it("buildProposedComponentDiagramMermaid incluye capas FE/BE/DB", () => {
    const signals = parseGreenfieldMddSignals(SAMPLE_MDD)!;
    const mermaid = buildProposedComponentDiagramMermaid(signals);
    assert.ok(mermaid);
    assert.match(mermaid!, /flowchart TB/);
    assert.match(mermaid!, /NestJS/);
    assert.match(mermaid!, /React/);
    assert.match(mermaid!, /PostgreSQL/);
    assert.match(mermaid!, /Redis/);
  });

  it("injectProposedComponentDiagramIntoSection2 es idempotente", () => {
    const first = injectProposedComponentDiagramIntoSection2(SAMPLE_MDD);
    assert.match(first, /### Diagrama de componentes propuesto/);
    assert.match(first, /```mermaid/);
    assert.match(first, /FE_CLIENT -->/);
    const second = injectProposedComponentDiagramIntoSection2(first);
    assert.equal(second, first);
  });

  it("no inyecta en MDD legacy con evidencia estructurada", () => {
    const legacy = `${SAMPLE_MDD}\n\n## Evidencia (MDD estructurado)\n\n| x |`;
    assert.equal(injectProposedComponentDiagramIntoSection2(legacy), legacy);
  });
});
