import { describe, it } from "node:test";
import assert from "node:assert";
import {
  applyDeploymentStackDirectiveToDraft,
  getSectionsToPreserveFromExecutorPlan,
  isMddSectionPlaceholderBody,
  normalizeMddEnglishSubheadings,
  preserveUntouchedMddSectionsFromBaseline,
  sanitizeSeguridadIntegracionRawJson,
} from "./mdd-sanitize.js";
import { expandSectionsToRun } from "../nodes/mdd-manager.node.js";

describe("normalizeMddEnglishSubheadings", () => {
  it("traduce subtítulos típicos del brief en inglés (§1–§2, §6)", () => {
    const raw = `
## 1. Contexto

**1.1. Project Vision & Objectives:**

Foo.

**1.2. Functional Requirements (EARS Format):**

Bar.

**2.1. Technical Architecture:**

Baz.

## 6. Seguridad**6.2. Identity:**

Qux.
`;
    const out = normalizeMddEnglishSubheadings(raw);
    assert.ok(out.includes("**1.1. Visión y objetivos del producto:**"));
    assert.ok(out.includes("**1.2. Requisitos funcionales (formato EARS):**"));
    assert.ok(out.includes("**2.1. Arquitectura técnica:**"));
    assert.ok(out.includes("**6.2. Identidad:**"));
    assert.ok(!out.includes("**6.2. Identity:**"));
    assert.match(out, /##\s*6\.\s*Seguridad\s*\n+\s*\*\*6\.2\./);
  });
});

describe("sanitizeSeguridadIntegracionRawJson", () => {
  it("descontamina sección Seguridad cuando viene como bullet list con líneas de JSON", () => {
    const contaminated = `
## Seguridad

### Seguridad

 - {
 - "title": "## Seguridad",
 - "content": [
 - {
 - "heading": "1. Autenticación y Autorización",
 - "details": [
 - "**Autenticación de Usuarios**: Se utiliza un sistema de autenticación basado en tokens.",
 - "**Autorización de Acceso**: Los roles y permisos se gestionan a través de la tabla roles."
 - ]
 - },
 - {
 - "heading": "2. Protección de Datos",
 - "details": [
 - "**Cifrado de Contraseñas**: Las contraseñas se almacenan como hashes.",
 - "**Borrados Lógicos**: Se utiliza el campo isActive."
 - ]
 - }
 - ],
 - "conclusion": "Estas medidas protegen el sistema."
 - }
`;

    const result = sanitizeSeguridadIntegracionRawJson(contaminated);

    assert.ok(result.includes("## Seguridad"), "debe conservar ## Seguridad");
    assert.ok(
      result.includes("### 1. Autenticación y Autorización") || result.includes("### Autenticación y Autorización"),
      "debe convertir heading a ###"
    );
    assert.ok(
      result.includes("Autenticación de Usuarios") && result.includes("tokens"),
      "debe incluir viñetas de details"
    );
    assert.ok(result.includes("### 2. Protección de Datos") || result.includes("### Protección de Datos"));
    assert.ok(result.includes("Cifrado de Contraseñas"));
    assert.ok(!result.includes('"title":'), "no debe dejar JSON crudo");
    assert.ok(!result.includes(' - {'), "no debe dejar viñetas con fragmentos JSON");
  });

  it("no modifica sección Seguridad que ya es markdown legible", () => {
    const clean = `
## Seguridad

### 1. Autenticación
- Tokens JWT.
- Argon2 para contraseñas.

### 2. Autorización
- RBAC por roles.
`;

    const result = sanitizeSeguridadIntegracionRawJson(clean);
    assert.strictEqual(result.trim(), clean.trim());
  });

  it("no modifica body que no parece bullet list as JSON", () => {
    const other = `
## Seguridad

(Pendiente de definir.)
`;
    const result = sanitizeSeguridadIntegracionRawJson(other);
    assert.ok(result.includes("(Pendiente de definir.)"));
  });
});

describe("isMddSectionPlaceholderBody", () => {
  it("trata (Pendiente: Arquitecto de Seguridad) como placeholder", () => {
    assert.ok(isMddSectionPlaceholderBody("(Pendiente: Arquitecto de Seguridad)"));
    assert.ok(!isMddSectionPlaceholderBody("### A. Autenticación\n\n- JWT con rotación de claves."));
  });
});

describe("getSectionsToPreserveFromExecutorPlan", () => {
  it("preserva §6 cuando el plan solo incluye architect e integration", () => {
    const agents = expandSectionsToRun(["software_architect", "integration"], { tail: "minimal" });
    assert.deepStrictEqual(agents, ["software_architect", "integration"]);
    const preserve = getSectionsToPreserveFromExecutorPlan(agents);
    assert.ok(preserve.includes(6));
    assert.ok(!preserve.includes(2));
    assert.ok(!preserve.includes(7));
  });
});

describe("preserveUntouchedMddSectionsFromBaseline", () => {
  it("restaura §6 real cuando el arquitecto dejó placeholder", () => {
    const baseline = `# MDD

## 1. Contexto

Contexto largo con alcance del producto y requisitos no funcionales descritos.

## 2. Arquitectura y Stack

Stack original.

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE users ( id UUID PRIMARY KEY );
\`\`\`

## 4. Contratos de API

### GET /api/v1/health

OK.

## 5. Lógica y Edge Cases

Reglas.

## 6. Seguridad

### A. Autenticación

- MFA TOTP obligatorio para administradores.

## 7. Infraestructura

Docker legacy.
`;
    const damaged = baseline.replace(
      /## 6\. Seguridad[\s\S]*?(?=\n## 7\.)/,
      "## 6. Seguridad\n\n(Pendiente: Arquitecto de Seguridad)\n\n",
    );
    const out = preserveUntouchedMddSectionsFromBaseline(
      damaged,
      baseline,
      getSectionsToPreserveFromExecutorPlan(["software_architect", "integration"]),
    );
    assert.match(out, /MFA TOTP obligatorio/);
    assert.doesNotMatch(out, /Pendiente:\s*Arquitecto de Seguridad/);
  });
});

describe("applyDeploymentStackDirectiveToDraft", () => {
  it("reemplaza Docker + Kubernetes por Dokploy en §2", () => {
    const draft = `# Master Design Document

## 1. Contexto

Algo.

## 2. Arquitectura y Stack

### 2.1 Stack Tecnológico

| Capa | Tecnología | Versión | Justificación |
| Contenedores | Docker + Kubernetes | 24 / 1.28 | Orquestación |
`;
    const out = applyDeploymentStackDirectiveToDraft(
      draft,
      "No se usará kubernetes; se usaría dokploy",
    );
    assert.match(out, /Docker \+ Dokploy/i);
    assert.doesNotMatch(out, /Docker \+ Kubernetes/i);
  });
});
