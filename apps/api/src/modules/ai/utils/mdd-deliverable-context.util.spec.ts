import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildMddContextForUseCases,
  buildMddContextForUserStories,
  buildMddContextForBlueprint,
  buildMddContextForApiContracts,
  buildMddContextForTasks,
  buildLogicFlowsDiagramHint,
  MDD_DELIVERABLE_BUDGET,
} from "./mdd-deliverable-context.util.js";

const SAMPLE_MDD = (filler: string) => `## 1. Contexto y alcance

### Capacidades funcionales del producto (MVP)

- **Onboarding con IA:** Chat que genera pipeline.
- **Facturación SaaS vía Stripe:** Membresías de tenant.

### Usuarios y casos de uso clave

1. **Administrador de negocio** → Configuración inicial instantánea.
2. **Comercial** → Pipeline kanban.

### Criterios de aceptación (UAT)

1. **Onboarding Zero-Form:** Pipeline de 4+ etapas.
2. **Seguridad MFA:** Usuario sin MFA recibe 403.

## 3. Modelo de datos

### tenants
### users
### leads
### tickets

CREATE TABLE tenants (id uuid);
CREATE TABLE users (id uuid);

## 4. Contratos de API

| Método | Ruta | Descripción |
| GET | \`/api/v1/auth/login\` | Login |
| POST | \`/api/v1/leads\` | Crear lead |

## 6. Seguridad

MFA TOTP obligatorio.

## 99. Ruido de prueba

${filler}`;

describe("buildMddContextForDeliverable", () => {
  it("devuelve el MDD íntegro si cabe en el presupuesto", () => {
    const mdd = "## 1. Contexto\n\nCorto.";
    assert.equal(buildMddContextForUserStories(mdd), mdd);
    assert.equal(buildMddContextForUseCases(mdd), mdd);
  });

  it("prioriza checklist para historias de usuario", () => {
    const filler = "x".repeat(MDD_DELIVERABLE_BUDGET + 5000);
    const out = buildMddContextForUserStories(SAMPLE_MDD(filler));
    assert.ok(out.length <= MDD_DELIVERABLE_BUDGET);
    assert.ok(out.includes("HU o Tarea técnica"));
    assert.ok(out.includes("Onboarding con IA"));
    assert.ok(!out.includes(filler.slice(0, 200)));
  });

  it("prioriza checklist para casos de uso", () => {
    const filler = "x".repeat(MDD_DELIVERABLE_BUDGET + 5000);
    const out = buildMddContextForUseCases(SAMPLE_MDD(filler));
    assert.ok(out.length <= MDD_DELIVERABLE_BUDGET);
    assert.ok(out.includes("Caso de uso"));
    assert.ok(out.includes("MFA TOTP"));
    assert.ok(!out.includes(filler.slice(0, 200)));
  });

  it("prioriza entidades §3 para blueprint", () => {
    const filler = "x".repeat(MDD_DELIVERABLE_BUDGET + 5000);
    const out = buildMddContextForBlueprint(SAMPLE_MDD(filler));
    assert.ok(out.includes("tenants"));
    assert.ok(out.includes("tickets"));
    assert.ok(out.includes("Entrada en §2 Persistencia"));
  });

  it("prioriza rutas §4 para api-contracts", () => {
    const filler = "x".repeat(MDD_DELIVERABLE_BUDGET + 5000);
    const out = buildMddContextForApiContracts(SAMPLE_MDD(filler));
    assert.ok(out.includes("GET /api/v1/auth/login"));
    assert.ok(out.includes("Fila en tabla de endpoints"));
  });

  it("prioriza checklist §3/§4/§6/§7 para tasks", () => {
    const mdd = `${SAMPLE_MDD("")}
## 5. Lógica y edge cases

- **Timeout en webhook Stripe:** Reintentos con backoff.

## 7. Infraestructura

- **Postgres 16** en Docker.
`;
    const filler = "z".repeat(MDD_DELIVERABLE_BUDGET + 5000);
    const out = buildMddContextForTasks(mdd + filler);
    assert.ok(out.includes("Tarea comprobable"));
    assert.ok(out.includes("tenants"));
    assert.ok(out.includes("GET /api/v1/auth/login"));
    assert.ok(out.includes("Timeout en webhook Stripe"));
    assert.ok(out.includes("Postgres 16"));
  });

  it("devuelve MDD íntegro en etapa 1 AS-IS aunque supere presupuesto estándar", () => {
    const filler = "y".repeat(MDD_DELIVERABLE_BUDGET + 5000);
    const mdd = SAMPLE_MDD(filler);
    const prev = process.env.LEGACY_BASELINE_FULL_DETAIL;
    process.env.LEGACY_BASELINE_FULL_DETAIL = "1";
    try {
      const out = buildMddContextForBlueprint(mdd, { legacyBaselineStage: true });
      assert.equal(out, mdd);
      assert.ok(out.includes(filler.slice(0, 200)));
    } finally {
      if (prev === undefined) delete process.env.LEGACY_BASELINE_FULL_DETAIL;
      else process.env.LEGACY_BASELINE_FULL_DETAIL = prev;
    }
  });

  it("buildLogicFlowsDiagramHint cuando §5 menciona flowchart", () => {
    const mdd = `${SAMPLE_MDD("")}

## 5. Lógica y edge cases

Usar flowchart para onboarding.
`;
    const hint = buildLogicFlowsDiagramHint(mdd);
    assert.ok(hint.includes("flowchart"));
  });
});
