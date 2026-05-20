import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isCorruptedSecurityLlmText,
  isCorruptedSeguridadSlice,
  isPlaceholderSeguridad,
  parseSecurityLlmResponse,
  sanitizeSeguridadItems,
  seguridadItemsFromDraftSection6,
} from "./mdd-security-parse.js";
import { getSection6Or7Range, replaceSection6Or7InDraft, seguridadItemsToSection6Markdown } from "./mdd-sanitize.js";

describe("parseSecurityLlmResponse", () => {
  it("parsea JSON estructurado válido", () => {
    const text = JSON.stringify({
      seguridad: [
        {
          title: "Autenticación y Autorización",
          content: ["Argon2id para contraseñas.", "JWT con rotación de refresh tokens."],
        },
        {
          title: "Protección de Datos",
          content: ["Cifrado en tránsito con TLS 1.3."],
        },
      ],
    });
    const items = parseSecurityLlmResponse(text);
    assert.ok(items, "debe parsear JSON estructurado válido");
    assert.strictEqual(items!.length, 2);
    assert.ok(items![0]!.content[0]!.includes("Argon2id"));
    const md = seguridadItemsToSection6Markdown(items!);
    assert.ok(md.startsWith("## 6. Seguridad"));
    assert.ok(md.includes("Autenticación"));
    assert.ok(!md.includes('"seguridad"'));
  });

  it("rechaza salida corrupta con placeholder, thinking y JSON a medias", () => {
    const corrupted = `## 6. Seguridad
{
  "placeholder": true,
  "note": "Will rewrite this section later"
}
<thinking>
Let me draft the security section...
</thinking>
- "title": "## Seguridad",
- "content": [
- { "heading": "1. Auth"`;
    assert.ok(isCorruptedSecurityLlmText(corrupted));
    assert.strictEqual(parseSecurityLlmResponse(corrupted), null);
  });

  it("rechaza slice con contenido mayormente JSON", () => {
    const slice = [
      {
        title: "Seguridad",
        content: ['{', '"title": "Auth",', '"details": [', "- fragment"],
      },
    ];
    assert.ok(isCorruptedSeguridadSlice(slice));
    assert.strictEqual(sanitizeSeguridadItems(slice), null);
  });
});

describe("seguridadItemsFromDraftSection6", () => {
  it("extrae §6 canónica ## 6. Seguridad del borrador", () => {
    const draft = `# MDD

## 1. Contexto

Texto.

## 6. Seguridad

- **Auth:** JWT y Argon2id.

## 7. Infraestructura

K8s.
`;
    assert.ok(getSection6Or7Range(draft.trim(), 6), "debe localizar ## 6. Seguridad en el borrador");
    const items = seguridadItemsFromDraftSection6(draft);
    assert.ok(items && items.length > 0, `seguridadItemsFromDraftSection6 devolvió ${String(items)}`);
    const combined = items!.map((i) => `${i.title} ${(i.content ?? []).join(" ")}`).join(" ");
    assert.ok(combined.includes("Argon2id"), `contenido extraído: ${combined.slice(0, 200)}`);
    assert.ok(!isPlaceholderSeguridad(items));
  });

  it("replaceSection6Or7 preserva §1 al actualizar desde items del draft", () => {
    const draft = `# MDD

## 1. Contexto

Contenido importante de contexto que no debe perderse.

## 6. Seguridad

- **Auth:** tokens.

## 7. Infra

Cloud.
`;
    const items = seguridadItemsFromDraftSection6(draft);
    assert.ok(items && items.length > 0, "debe extraer items de §6 antes de reemplazar");
    const updated = replaceSection6Or7InDraft(draft, 6, seguridadItemsToSection6Markdown(items));
    assert.ok(updated.includes("Contenido importante de contexto"));
    assert.ok(updated.includes("Cloud."));
  });
});

describe("seguridadItemsToSection6Markdown", () => {
  it("genera markdown canónico para items normales", () => {
    const md = seguridadItemsToSection6Markdown([
      {
        title: "Autenticación",
        content: ["MFA TOTP obligatorio para administradores.", "Bloqueo tras 5 intentos fallidos."],
      },
    ]);
    assert.match(md, /^## 6\. Seguridad/);
    assert.ok(md.includes("Autenticación"));
    assert.ok(md.includes("MFA TOTP"));
    assert.ok(!md.includes("{"));
  });
});
