# Brownfield — legacy y código existente

**Brownfield** es el flujo para **documentar, modificar o integrar** software que **ya existe** en producción. TheForge consulta el **código real** vía **Ariadne** (grafo FalkorDB + MCP) y genera MDD de cambio trazable.

> **En una frase:** indexa el repo → etapa 1 fotografía el AS-IS → etapas 2+ describen solo el delta → converge mantiene el plan al día.

---

## ¿Cuándo usar brownfield?

| Situación | ¿Brownfield? |
|-----------|--------------|
| Monolito / API / front **en prod** | **Sí** |
| Refactor o feature sobre código indexado | **Sí** |
| Producto nuevo sin legacy | **No** → greenfield |
| Puente NEW + legacy (portal + cotizador viejo) | **Sí** + pestaña **Integración** |

---

## 1. Prerrequisitos (Ariadne)

Antes del Workshop legacy:

1. **Repo indexado** en Ariadne (sync o webhook Bitbucket/GitHub).
2. **`theforgeProjectId`** en la etapa — UUID del proyecto o `roots[].id` en multi-root (`list_known_projects` en MCP).
3. **THEFORGE_MCP_URL** configurado en el deploy de The Forge.

Sin grafo fresco, MDD Inicial y converge dan evidencia vacía.

---

## 2. Crear el proyecto

1. **Crear nuevo proyecto** → **Proyecto existente** (ya indexado en Ariadne) **o** **Repositorio existente**.
2. Tipo `LEGACY` en el proyecto.
3. Enlaza el workspace Ariadne en configuración / etapa.

Para **solo documentar** el sistema actual, quédate en **etapa 1**. Para **cambios**, abre **etapa 2+**.

---

## 3. Etapa 1 — AS-IS (foto del sistema hoy)

Documenta **cómo está**, no cómo debería quedar.

| Paso | Pestaña / acción |
|------|------------------|
| 1 | **MDD Inicial** — `generate-codebase-doc` vía Ariadne (evidencia del grafo) |
| 2 | **MDD** — AS-IS: entidades, APIs, servicios desde código real |
| 3 | Entregables de la etapa (Spec, historias, API…) si los usáis como referencia |
| 4 | **Cerrar etapa 1** antes de promover cambios |

**Regla:** etapa 1 = referencia inmutable del «antes». No mezcles «pendiente de modificar» aquí.

---

## 4. Etapa 2+ — solo el delta

| Paso | Qué |
|------|-----|
| 1 | Tab **Modificación** — describe el cambio; Ariadne propone archivos y preguntas |
| 2 | Responde preguntas → **MDD de cambio** (no copies AS-IS entero) |
| 3 | Genera entregables de la etapa activa |
| 4 | **Gate legacy** — en etapa 2+ algunas acciones exigen `legacyChangeState` acordado |

Al **activar etapa N**, se snapshotea la anterior y el grafo Falkor enlaza `DERIVED_FROM` N→N-1.

---

## 5. Integración NEW ↔ LEGACY

Cuando un **producto nuevo** pide cambios al **monolito**:

| Rol | Dónde |
|-----|--------|
| Proyecto **NEW** | Pestaña **Integración** → handoff `NEW-LEG-01`, `NEW-LEG-02`… |
| Proyecto **LEGACY** | Importar handoff → etapa 2+ → historias `LEG-xx` propias |

Ver ayuda Workshop → **Integración Legacy ↔ Nuevo**.

---

## 6. Converge — drift código vs plan

**Converge** compara `tasks.md` + MDD con el codebase (Ariadne) y propone tareas nuevas.

| Superficie | Uso |
|------------|-----|
| Workshop → Tasks → **Converge** | Manual |
| `POST /projects/:id/converge` | API / scripts |
| `POST /projects/:id/converge/trigger` | CI + webhook saliente |

### Cadena automática (recomendada)

```text
push → Ariadne reindex → converge/trigger → webhook (Slack/n8n)
```

**The Forge:** Integración → **Webhook converge (CI)** (`convergeWebhookUrl`).

**Ariadne:** Editar repo → **Brownfield converge** (`theforgeProjectId`, modo `incremental` o `all`).

Env Ariadne ingest: `THEFORGE_API_URL`, `THEFORGE_SERVICE_JWT`.

---

## 7. Checklist operativo

### Ariadne (por repo)
- [ ] Webhook Bitbucket/GitHub activo
- [ ] Brownfield converge: project ID + trigger mode
- [ ] `THEFORGE_API_URL` en ingest

### The Forge (por proyecto legacy)
- [ ] `theforgeProjectId` en etapa
- [ ] `tasks.md` generado antes de converge
- [ ] Webhook converge (opcional) para downstream

### Equipo
- [ ] Etapa 1 cerrada antes de etapa 2
- [ ] NEW-LEG acordados antes de implementar en legacy

---

## 8. Errores frecuentes

| Síntoma | Causa | Acción |
|---------|-------|--------|
| MDD Inicial vacío | Grafo desactualizado | Resync Ariadne |
| Converge sin evidencia | Sin MCP / mal `theforgeProjectId` | Revisar config etapa |
| Mezclar AS-IS y delta | Mismo MDD para todo | Separar etapas |
| NEW edita legacy directo | Anti-patrón | Solo handoff + import |

---

## 9. Referencias

- Workshop ayuda → **Webhook converge (CI)**, **Integración Legacy ↔ Nuevo**
- `docs/plans/PLAN-LEGACY-STAGE-P0-BROWNFIELD.md`
- `docs/plans/PLAN-BROWNFIELD-P1-P2-P3.md`
- Ariadne: `docs/notebooklm/BROWNFIELD-CONVERGE-THEFORGE.md`
