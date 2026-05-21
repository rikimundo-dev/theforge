import { describe, it } from "node:test";
import assert from "node:assert";
import { prepareMddForOutput, shouldPreferDraftOverStructured } from "./mdd-prepare-output.js";
import { getSection6Or7Range, replaceSection6Or7InDraft, seguridadItemsToSection6Markdown } from "./mdd-sanitize.js";
import { mddSeguridadItemSchema } from "../state/mdd-structured.schema.js";

const FULL_MDD_PREFIX = `# Master Design Document

## 1. Contexto

Contexto extenso con visión del producto y requisitos funcionales en formato EARS para validar que no se pierde al regenerar secciones posteriores del documento.

## 2. Arquitectura y Stack

NestJS con PostgreSQL y Redis para colas. Patrón modular por dominio.

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE users (id UUID PRIMARY KEY, email TEXT NOT NULL);
CREATE TABLE roles (id UUID PRIMARY KEY, name TEXT NOT NULL);
\`\`\`

## 4. Contratos de API

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /auth/login | Inicio de sesión |

## 5. Lógica y Edge Cases

Dado un usuario autenticado cuando solicita recurso entonces se valida ownership.

`;

const EXISTING_SECTION6 = `## 6. Seguridad

- **Autenticación:**
    - Argon2id para contraseñas.
    - JWT con refresh rotativo.

## 7. Infraestructura

Kubernetes con despliegue blue-green.
`;

describe("shouldPreferDraftOverStructured", () => {
  it("prefiere borrador multi-sección aunque structured solo tenga seguridad placeholder", () => {
    const draft = FULL_MDD_PREFIX + EXISTING_SECTION6;
    const structured = {
      seguridad: [mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] })],
    };
    assert.ok(shouldPreferDraftOverStructured(draft, structured));
  });
});

describe("prepareMddForOutput", () => {
  it("conserva §1–§5 del draft cuando structured es parcial tras fallo de §6", () => {
    const draft = FULL_MDD_PREFIX + EXISTING_SECTION6;
    const structured = {
      seguridad: [mddSeguridadItemSchema.parse({ title: "Seguridad", content: ["(Pendiente de definir.)"] })],
    };
    const out = prepareMddForOutput({ mddDraft: draft, mddStructured: structured });
    assert.ok(out.includes("## 1. Contexto"), "debe conservar §1");
    assert.ok(out.includes("CREATE TABLE users"), "debe conservar §3");
    assert.ok(out.includes("Argon2id"), "debe conservar §6 previa, no Pendiente");
    assert.ok(!/## 1\. Contexto[\s\S]*\(Pendiente\)[\s\S]*## 2\./.test(out), "§2 no debe ser solo Pendiente");
  });
});

describe("getSection6Or7Range", () => {
  it("encuentra §6 tras §5 sin exigir salto de línea extra en el patrón", () => {
    const draft = "## 5. Lógica\n\nx\n## 6. Seguridad\n\nviejo";
    const range = getSection6Or7Range(draft, 6);
    assert.ok(range);
    assert.match(range!.heading, /Seguridad/i);
  });
});

describe("replaceSection6Or7InDraft", () => {
  it("reemplaza solo §6 preservando §1–§5 y §7", () => {
    const draft = FULL_MDD_PREFIX + EXISTING_SECTION6;
    const newSec6 = seguridadItemsToSection6Markdown([
      {
        title: "Autenticación",
        content: ["OAuth2 con PKCE.", "MFA TOTP para admins."],
      },
    ]);
    const updated = replaceSection6Or7InDraft(draft, 6, newSec6);
    assert.ok(updated.includes("CREATE TABLE users"), "§3 intacto");
    assert.ok(updated.includes("OAuth2 con PKCE"), "§6 actualizado");
    assert.ok(updated.includes("Kubernetes"), "§7 intacto");
    const sec6Count = (updated.match(/##\s*6\.\s*Seguridad/gi) ?? []).length;
    assert.strictEqual(sec6Count, 1, "no debe duplicar heading §6");
  });
});
