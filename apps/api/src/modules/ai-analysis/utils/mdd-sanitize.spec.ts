import { describe, it } from "node:test";
import assert from "node:assert";
import {
  applyCrossConsistencyPatches,
  applyDeploymentStackDirectiveToDraft,
  applyDeterministicCrossConsistencyFixes,
  deduplicateAndReorderMddSections,
  detectCrossConsistencyIssues,
  detectDuplicateOutboxTables,
  deduplicateOutboxTablesInDraft,
  draftHasRequestIdDualApprovalApi,
  ensureOutboxTableInDraft,
  ensureSection6WhenSection7Present,
  getSection6Or7Range,
  mddHasDuplicateSectionHeadings,
  stripTrailingDuplicateMddSections,
  fixDeterministicMddCoherence,
  finalizeMddDeliverable,
  fixDualApprovalSchemaInDraft,
  getSectionsToPreserveFromExecutorPlan,
  stripMeshDirectivesFromDraft,
  isMddSectionPlaceholderBody,
  normalizeMddFormat,
  normalizeMddEnglishSubheadings,
  parseCrossConsistencyPatches,
  preserveUntouchedMddSectionsFromBaseline,
  sanitizeSeguridadIntegracionRawJson,
  sanitizeSqlBrokenCommentsAndProse,
  validateMddStructure,
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

describe("normalizeMddFormat §6 bullets", () => {
  it("conserva viñetas bajo ## 6. Seguridad (no las confunde con 6. Seguridad- pegado)", () => {
    const draft = `# Master Design Document

## 5. Lógica y Edge Cases

Lógica.

## 6. Seguridad

- Autenticación:
    - JWT validado vía JWKS.

## 7. Infraestructura

Docker.
`;
    const out = normalizeMddFormat(draft);
    assert.ok(out.includes("JWT validado vía JWKS."));
  });
});

describe("ensureSection6WhenSection7Present", () => {
  it("inserta §6 placeholder cuando el documento salta de §5 a §7", () => {
    const draft = `# Master Design Document

## 5. Lógica y Edge Cases

Reglas de negocio y middleware JWT.

## 7. Infraestructura

Docker y SSO.
`;
    const fixed = ensureSection6WhenSection7Present(draft);
    assert.ok(fixed.includes("## 6. Seguridad"));
    assert.ok(fixed.indexOf("## 5.") < fixed.indexOf("## 6. Seguridad"));
    assert.ok(fixed.indexOf("## 6. Seguridad") < fixed.indexOf("## 7. Infraestructura"));
    const normalized = deduplicateAndReorderMddSections(fixed);
    assert.ok(normalized.includes("## 6. Seguridad"), "deduplicate debe conservar §6");
    assert.ok(normalized.includes("Pendiente: Arquitecto de Seguridad"));
  });

  it("no altera el documento si §6 ya existe", () => {
    const draft = `## 5. Lógica y Edge Cases

Lógica.

## 6. Seguridad

JWT.

## 7. Infraestructura

K8s.
`;
    assert.strictEqual(ensureSection6WhenSection7Present(draft), draft);
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

describe("sanitizeSqlBrokenCommentsAndProse", () => {
  it("fusiona tokens huérfanos tras comentario SQL partido (enum)", () => {
    const broken = `CREATE TABLE access_policies (
  permission VARCHAR(50) NOT NULL,            -- read, use, rotate, export, revoke,
  manage
  effect VARCHAR(10) NOT NULL DEFAULT 'allow', -- allow,
  deny
);`;
    const out = sanitizeSqlBrokenCommentsAndProse(broken);
    assert.ok(out.includes("revoke, manage"));
    assert.ok(out.includes("allow, deny"));
    assert.ok(!/^\s*manage\s*$/m.test(out));
    assert.ok(!/^\s*deny\s*$/m.test(out));
  });

  it("cierra CREATE INDEX con paréntesis partidos en varias líneas", () => {
    const broken = `CREATE TABLE audit_events (id UUID PRIMARY KEY);
  CREATE INDEX idx_audit_occurred_at ON audit_events(occurred_at
);
  CREATE INDEX idx_audit_resource ON audit_events(resource_type,
  resource_id
);`;
    const out = sanitizeSqlBrokenCommentsAndProse(broken);
    assert.ok(out.includes("ON audit_events(occurred_at);"));
    assert.ok(out.includes("resource_type, resource_id);"));
    assert.ok(!/occurred_at\n\)/.test(out));
  });

  it("repara prosa suelta tras comentario SQL roto (audit_events)", () => {
    const broken = `CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  actor_id UUID,                           -- user_id,
  application_id o NULL para system
);`;
    const out = sanitizeSqlBrokenCommentsAndProse(broken);
    assert.ok(!out.includes("application_id o NULL para system"));
    assert.ok(out.includes("application_id UUID"));
    assert.ok(out.includes("-- NULL for system"));
  });

  it("convierte línea de prosa huérfana en comentario SQL", () => {
    const broken = `CREATE TABLE foo (
  id UUID PRIMARY KEY,
  esto no es SQL válido para una columna
);`;
    const out = sanitizeSqlBrokenCommentsAndProse(broken);
    assert.ok(out.includes("-- esto no es SQL válido para una columna"));
  });
});

describe("fixDeterministicMddCoherence", () => {
  it("alinea §7 con monolito modular (no microservicios internos)", () => {
    const draft = `## 2. Arquitectura y Stack

Monolito modular con única unidad de despliegue NestJS.

## 7. Infraestructura

TLS entre microservicios y PostgreSQL.
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("módulos internos"));
    assert.ok(!/entre microservicios/i.test(out));
  });

  it("promueve rutas /api/* a /api/v1/* cuando el manifest declara v1", () => {
    const draft = `## 4. Contratos de API

| POST | /api/auth/login |
| GET | /api/keys |

## 7. Infraestructura

\`\`\`json
{ "integration_metadata": { "api_prefix": "/api/v1" } }
\`\`\`
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("| POST | /api/v1/auth/login |") || out.includes("| POST | /api/v1/auth/login"));
    assert.ok(out.includes("/api/v1/keys"));
    assert.ok(out.includes('"api_prefix": "/api/v1"'));
  });

  it("sustituye eliminar particiones por archivado cuando auditoría es inmutable", () => {
    const draft = `## 5. Lógica y Edge Cases

- Retención inmutable 5 años.
- Job mensual elimina particiones completas anteriores a 5 años.
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("archiva particiones"));
    assert.ok(!out.includes("elimina particiones"));
  });

  it("corrige dropea/purga de particiones cuando auditoría es inmutable (español)", () => {
    const draft = `## 5. Lógica y Edge Cases

- **Retención de auditoría**: los eventos en eventos_auditoria no pueden ser modificados ni eliminados.
- Después de 5 años, un job automático dropea la partición correspondiente previa exportación a backup frío.

## 6. Seguridad

- Los eventos solo se purgan automáticamente al cumplir 5 años mediante job de drop de partición.
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("archiva"));
    assert.ok(!/dropea la partición/i.test(out));
    assert.ok(out.includes("Los eventos solo se archivan a cold storage inmutable"));
    assert.ok(!/purgan automáticamente/i.test(out));
    assert.ok(!/job de drop de partición/i.test(out));
  });

  it("corrige retención inmutable también en §6", () => {
    const draft = `## 6. Seguridad

- Auditoría append-only con retención inmutable.
- pg_cron elimina particiones con más de 5 años.
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("archiva particiones"));
    assert.ok(!out.includes("elimina particiones"));
  });

  it('corrige "elimina de audit_events" cuando auditoría es inmutable', () => {
    const draft = `## 5. Lógica y Edge Cases

- Retención inmutable 5 años en audit_events.
- Tras exportación, el job elimina de audit_events los registros con más de 5 años.

## 6. Seguridad

- Auditoría append-only.
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("archiva registros de audit_events"));
    assert.ok(!/elimina de audit_events/i.test(out));
  });

  it("corrige manifest bcrypt → Argon2id cuando §6 documenta Argon2 (sin LDAP)", () => {
    const draft = `## 6. Seguridad

- Las contraseñas locales se almacenan con Argon2id (memoria 64 MB, tiempo 3).
- MFA TOTP para administradores.

## 7. Infraestructura

\`\`\`json
{
  "stack": {
    "security": {
      "hashing_algorithm": "bcrypt",
      "hashing_rounds": 12,
      "mfa_strategy": "TOTP"
    }
  }
}
\`\`\`
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes('"hashing_algorithm": "Argon2id"'));
    assert.ok(out.includes('"hashing_scope": "local_passwords_and_bootstrap"'));
    assert.ok(!/"hashing_algorithm"\s*:\s*"bcrypt"/i.test(out));
    const issues = detectCrossConsistencyIssues(out);
    assert.ok(!issues.some((i) => i.includes("bcrypt") && i.includes("Argon2")));
  });

  it("corrige §6 y manifest cuando LDAP es auth principal", () => {
    const draft = `## 2. Arquitectura y Stack

Passport.js (LDAP/AD) + JWT.

## 6. Seguridad

### Autenticación
- Los usuarios humanos se autentican contra LDAP/AD.
- Las contraseñas de los usuarios se almacenan hasheadas con Argon2id (parámetros: memoria 64 MB).
- El hashing de contraseñas usa Argon2id con sales aleatorias de 16 bytes.

## 7. Infraestructura

\`\`\`json
{
  "stack": {
    "security": {
      "hashing_algorithm": "bcrypt",
      "hashing_rounds": 12,
      "mfa_strategy": "TOTP"
    }
  }
}
\`\`\`
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("no almacenan contraseña local"));
    assert.ok(out.includes('"auth_provider": "LDAP/AD"'));
    assert.ok(out.includes('"hashing_algorithm": "Argon2id"'));
    assert.ok(out.includes("bootstrap_and_service_secrets_only"));
    assert.ok(out.includes("MFA obligatorio"));
  });

  it("antepone /api/v1 a rutas §4 cuando manifest lo declara y rutas son bare", () => {
    const draft = `## 4. Contratos de API

| POST | /auth/login | Login | JWT |
| GET | /keys | Listar | JWT |

## 7. Infraestructura

\`\`\`json
{ "integration_metadata": { "api_prefix": "/api/v1" } }
\`\`\`
`;
    const out = fixDeterministicMddCoherence(draft);
    assert.ok(out.includes("| POST | /api/v1/auth/login |"));
    assert.ok(out.includes("| GET | /api/v1/keys |"));
    assert.ok(out.includes('"api_prefix": "/api/v1"'));
  });
});

describe("normalizeMddFormat §6 heading", () => {
  it("despega subtítulo pegado al H2 de Seguridad", () => {
    const draft = `# Master Design Document

## 6. Seguridad. Autenticación:

- JWT con rotación.

## 7. Infraestructura

K8s.
`;
    const out = normalizeMddFormat(draft);
    assert.ok(out.includes("## 6. Seguridad"));
    assert.ok(out.includes("### Autenticación"));
    assert.ok(!/## 6\. Seguridad\. Autenticación/i.test(out));
  });

  it("despega SeguridadGestión sin espacio (heading pegado del LLM)", () => {
    const draft = `# Master Design Document

## 5. Lógica y Edge Cases

Reglas.

## 6. SeguridadGestión de Identidad y Autenticación:
    - JWT RS256.

## 7. Infraestructura

K8s.
`;
    const out = normalizeMddFormat(draft);
    assert.ok(out.includes("## 6. Seguridad"));
    assert.ok(out.includes("### Gestión de Identidad y Autenticación"));
    assert.ok(!/## 6\. SeguridadGestión/i.test(out));
    assert.ok(getSection6Or7Range(out, 6) != null, "getSection6Or7Range debe localizar §6");
    assert.strictEqual(mddHasDuplicateSectionHeadings(out), false);
  });
});

describe("stripMeshDirectivesFromDraft", () => {
  it("elimina [DIRECTIVE: nodo] del markdown entregable", () => {
    const draft = `## 6. Seguridad

- MFA:
    - [DIRECTIVE: software_architect] Añadir totp_secret BYTEA en users.
    - TOTP obligatorio para admins.
`;
    const out = stripMeshDirectivesFromDraft(draft);
    assert.ok(!out.includes("[DIRECTIVE:"));
    assert.ok(out.includes("totp_secret BYTEA"));
    assert.ok(out.includes("TOTP obligatorio"));
  });
});

describe("finalizeMddDeliverable", () => {
  it("limpia duplicados y directivas mesh preservando UI/UX al final", () => {
    const core = `# Master Design Document

## 5. Lógica y Edge Cases

UAT.

## 6. Seguridad

JWT.

## 7. Infraestructura

K8s.
`;
    const corrupted = `${core}
---
## 5. Lógica y Edge Cases

Duplicado.

## UI/UX Design Intent

Tabla users → DataTable.
`;
    const out = finalizeMddDeliverable(corrupted);
    assert.ok(!out.includes("Duplicado."));
    assert.ok(out.includes("## UI/UX Design Intent"));
    assert.ok(out.includes("DataTable"));
    assert.strictEqual((out.match(/^##\s+5\./gm) ?? []).length, 1);
  });
});

describe("stripTrailingDuplicateMddSections / deduplicate anti-bucle", () => {
  it("elimina cola duplicada §5/§6/§7 tras la primera §7 completa", () => {
    const core = `# Master Design Document

## 1. Contexto

Alcance KMS.

## 5. Lógica y Edge Cases

UAT y edge cases.

## 6. Seguridad

JWT y MFA.

## 7. Infraestructura

### Manifest

\`\`\`json
{"stack": {}}
\`\`\`
`;
    const corrupted =
      core +
      `
---
## 6. Seguridad(Pendiente: Arquitecto de Seguridad)
---
## 7. Infraestructura

(Pendiente: Ingeniero de Integración)

---
## 5. Lógica y Edge Cases

### 5.1 Reglas de negocio

Duplicado.
`;
    assert.ok(mddHasDuplicateSectionHeadings(corrupted));
    const stripped = stripTrailingDuplicateMddSections(corrupted);
    assert.ok(!stripped.includes("Duplicado."), "debe truncar la cola repetida");
    assert.ok(stripped.includes("JWT y MFA."));
    const deduped = deduplicateAndReorderMddSections(corrupted);
    assert.strictEqual(mddHasDuplicateSectionHeadings(deduped), false);
    assert.ok((deduped.match(/^##\s+5\./gm) ?? []).length <= 1);
    assert.ok((deduped.match(/^##\s+6\./gm) ?? []).length <= 1);
    assert.ok((deduped.match(/^##\s+7\./gm) ?? []).length <= 1);
  });
});

describe("fixDualApprovalSchemaInDraft", () => {
  it("divide endpoint único export/approve en approve-first y approve-second", () => {
    const draft = `## 1. Contexto

Aprobación dual para exportación de claves.

## 4. Contratos de API

| POST | \`/api/keys/:keyId/export/approve\` | Aprobar exportación (dual) | JWT (admin_security) |

#### POST /api/keys/:keyId/export/approve

Aprueba solicitud. Primer aprobador → first_approved; segundo → approved.
`;
    const out = fixDualApprovalSchemaInDraft(draft);
    assert.ok(out.includes("approve-first"));
    assert.ok(out.includes("approve-second"));
    assert.ok(out.includes("| POST | `/api/keys/:keyId/export/approve-first` | Primera aprobación"));
    assert.ok(!/\|\s*POST\s*\|[^|\n]*\/export\/approve(?!-first|-second)/i.test(out));
  });

  it("no divide approve cuando el patrón :requestId/approve + execute ya está documentado", () => {
    const draft = `## 1. Contexto

Aprobación dual para exportación de claves.

## 4. Contratos de API

| POST | /api/v1/keys/:id/export/:requestId/approve | Aprobar (1.ª o 2.ª) | JWT |
| POST | /api/v1/keys/:id/export/:requestId/execute | Ejecutar exportación | JWT |
| POST | /api/v1/keys/:id/export/:requestId/reject | Rechazar | JWT |
`;
    assert.ok(draftHasRequestIdDualApprovalApi(draft));
    const out = fixDualApprovalSchemaInDraft(draft);
    assert.ok(!out.includes("approve-first"));
    assert.ok(out.includes("/:requestId/approve"));
    assert.ok(out.includes("/:requestId/execute"));
  });

  it("convierte approved_by en first_approver_id + second_approver_id", () => {
    const draft = `## 1. Contexto

Aprobación dual para exportación de claves.

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY,
  requested_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);
\`\`\`
`;
    const out = fixDualApprovalSchemaInDraft(draft);
    assert.ok(out.includes("first_approver_id"));
    assert.ok(out.includes("second_approver_id"));
    assert.ok(!/\bapproved_by\b/i.test(out));
    assert.ok(out.includes("first_approved"));
  });
});

describe("applyDeterministicCrossConsistencyFixes", () => {
  it("combina SQL, dual approval y coherencia monolito", () => {
    const draft = `## 1. Contexto

Aprobación dual obligatoria.

## 2. Arquitectura y Stack

Monolito modular con única unidad de despliegue.

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY,
  approved_by UUID REFERENCES users(id)
);
\`\`\`

## 7. Infraestructura

TLS entre microservicios.
`;
    const out = applyDeterministicCrossConsistencyFixes(draft);
    assert.ok(out.includes("second_approver_id"));
    assert.ok(out.includes("módulos internos"));
    assert.ok(!/entre microservicios/i.test(out));
  });
});

describe("ensureOutboxTableInDraft", () => {
  it("añade CREATE TABLE outbox cuando §7 la menciona y falta en §3", () => {
    const draft = `## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE eventos_auditoria (
  id UUID PRIMARY KEY
);
\`\`\`

## 7. Infraestructura

Un worker lee los eventos no publicados de la tabla outbox y los envía a RabbitMQ.
`;
    const out = ensureOutboxTableInDraft(draft);
    assert.ok(/CREATE\s+TABLE\s+outbox\b/i.test(out));
    assert.ok(out.includes("idx_outbox_unpublished"));
  });

  it("no inyecta outbox cuando §3 ya define outbox_events", () => {
    const draft = `## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ
);
\`\`\`

## 7. Infraestructura

Un worker lee los eventos no publicados de la tabla outbox_events y los envía a RabbitMQ.
`;
    const out = ensureOutboxTableInDraft(draft);
    assert.ok(/CREATE\s+TABLE\s+outbox_events\b/i.test(out));
    assert.ok(!/CREATE\s+TABLE\s+outbox\s*\(/i.test(out));
  });
});

describe("detectDuplicateOutboxTables", () => {
  it("detecta outbox y outbox_events duplicados en §3", () => {
    const draft = `## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY
);
CREATE TABLE outbox (
  id UUID PRIMARY KEY
);
\`\`\`
`;
    assert.ok(detectDuplicateOutboxTables(draft));
    const issues = detectCrossConsistencyIssues(draft);
    assert.ok(issues.some((i) => i.includes("outbox duplicadas")));
  });
});


describe("deduplicateOutboxTablesInDraft", () => {
  it("elimina CREATE TABLE outbox cuando §3 ya tiene outbox_events y §7 lo nombra", () => {
    const draft = `## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ
);
CREATE TABLE outbox (
  id UUID PRIMARY KEY
);
\`\`\`

## 7. Infraestructura

El worker publica eventos desde la tabla outbox_events hacia RabbitMQ.
`;
    const out = deduplicateOutboxTablesInDraft(draft);
    assert.ok(/CREATE\s+TABLE\s+outbox_events\b/i.test(out));
    assert.ok(!/CREATE\s+TABLE\s+outbox\s*\(/i.test(out));
    assert.strictEqual(detectDuplicateOutboxTables(out), false);
  });

  it("se aplica en applyDeterministicCrossConsistencyFixes tras inyección errónea", () => {
    const draft = `## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY
);
CREATE TABLE outbox (
  id UUID PRIMARY KEY
);
\`\`\`

## 7. Infraestructura

Lee eventos de outbox_events.
`;
    const out = applyDeterministicCrossConsistencyFixes(draft);
    assert.strictEqual(detectDuplicateOutboxTables(out), false);
  });
});

describe("validateMddStructure §6", () => {
  it("marca 6. Seguridad como sección faltante cuando el documento salta de §5 a §7", () => {
    const draft = `## 1. Contexto
Alcance.

## 2. Arquitectura y Stack
Stack.

## 3. Modelo de Datos
\`\`\`sql
CREATE TABLE t (id UUID PRIMARY KEY);
\`\`\`
TechnicalMetadata [high_security]

## 4. Contratos de API
| GET | /api/v1/health | OK | — |
| POST | /api/v1/items | Crear | JWT |
\`\`\`json
{"ok": true}
\`\`\`
\`\`\`json
{"id": "1"}
\`\`\`

## 5. Lógica y Edge Cases
Reglas.

## 7. Infraestructura
Deploy.
`;
    const structure = validateMddStructure(draft);
    assert.ok(structure.missingSections.includes("6. Seguridad"));
  });
});

describe("detectCrossConsistencyIssues", () => {
  it("no exige approve-first cuando hay patrón :requestId/approve + execute", () => {
    const draft = `## 1. Contexto

Aprobación dual para exportación.

## 4. Contratos de API

| POST | /api/v1/keys/:id/export/:requestId/approve | Aprobar | JWT |
| POST | /api/v1/keys/:id/export/:requestId/execute | Ejecutar | JWT |
`;
    const issues = detectCrossConsistencyIssues(draft);
    assert.ok(!issues.some((i) => i.includes("approve-first")));
  });

  it("detecta approved_by sin second_approver cuando hay dual approval", () => {
    const draft = `## 1. Contexto

Aprobación dual para exportación.

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY,
  approved_by UUID REFERENCES users(id)
);
\`\`\`
`;
    const issues = detectCrossConsistencyIssues(draft);
    assert.ok(issues.some((i) => i.includes("second_approver_id")));
  });
});

describe("applyCrossConsistencyPatches", () => {
  it("aplica parche cuando find es único", () => {
    const draft = "foo UNIQUE_BAR baz";
    const out = applyCrossConsistencyPatches(draft, [
      { find: "UNIQUE_BAR", replace: "UNIQUE_BAZ" },
    ]);
    assert.equal(out, "foo UNIQUE_BAZ baz");
  });

  it("ignora parche cuando find aparece más de una vez", () => {
    const draft = "X foo X";
    const out = applyCrossConsistencyPatches(draft, [{ find: "X", replace: "Y" }]);
    assert.equal(out, "X foo X");
  });
});

describe("parseCrossConsistencyPatches", () => {
  it("extrae JSON de bloque fenced", () => {
    const text = `Corrección:
\`\`\`json
[{"find":"old","replace":"new"}]
\`\`\``;
    const patches = parseCrossConsistencyPatches(text);
    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.find, "old");
  });
});

describe("normalizeMddFormat SQL sanitization", () => {
  it("limpia prosa en bloque sql de §3 vía pipeline", () => {
    const draft = `# Master Design Document

## 3. Modelo de Datos

\`\`\`sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  actor_id UUID,                           -- user_id,
  application_id o NULL para system
);
\`\`\`

## 4. Contratos de API

Tabla.
`;
    const out = normalizeMddFormat(draft);
    assert.ok(!out.includes("application_id o NULL para system"));
    assert.ok(out.includes("application_id UUID"));
  });
});
