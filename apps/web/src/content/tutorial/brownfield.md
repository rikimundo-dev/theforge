# Brownfield — legacy y código existente

**Brownfield** es el flujo para **documentar, modificar o integrar** software que **ya existe** en producción. TheForge consulta el **código real** vía **Ariadne** (grafo FalkorDB + MCP) y genera MDD de cambio trazable.

> **En una frase:** indexa el repo en Ariadne → crea proyecto legacy en The Forge → etapa 1 fotografía el AS-IS → etapas 2+ describen solo el delta → converge mantiene el plan al día.

---

## ¿Cuándo usar brownfield?

| Situación | ¿Brownfield? |
|-----------|--------------|
| Monolito / API / front **en prod** | **Sí** |
| Refactor o feature sobre código indexado | **Sí** |
| Producto nuevo sin legacy | **No** → greenfield |
| Puente NEW + legacy (portal + cotizador viejo) | **Sí** + pestaña **Integración** |

---

## 1. Dos UUIDs distintos (no los confundas)

Hay **dos campos con nombres parecidos** en direcciones opuestas:

| Dónde | Campo | Qué UUID guarda |
|-------|--------|-----------------|
| **The Forge** → proyecto legacy | `theforgeProjectId` (nombre histórico) | Proyecto o repo **en Ariadne** (grafo MCP) |
| **Ariadne** → Editar repo → Brownfield converge | `theforge_project_id` | Proyecto **Workshop en The Forge** |

- Para **arrancar el Workshop legacy** no escribes UUIDs a mano: los asigna el wizard al elegir un ítem indexado en Ariadne.
- El hook **Ariadne → converge** solo aplica **después** de crear el proyecto en The Forge (necesitas el UUID del Workshop).

En el header del Workshop legacy verás **`MCP <uuid>`** — ese es el ID de Ariadne guardado en The Forge.

---

## 2. Orden correcto (Workshop legacy)

### Paso A — Ariadne: indexar el código

**UI Ariadne → Repos:**

1. **Nuevo repositorio** — provider (Bitbucket/GitHub), credencial, branch.
2. Tras crear → **Resync** (lista o detalle `/repos/:id`) hasta que el grafo esté listo.
3. *(Opcional)* **Editar repo** → **Webhook secret** + webhook en el remoto (`repo:push` → endpoint Ariadne).

Sin repo indexado, MDD Inicial y converge devuelven evidencia vacía.

### Paso B — The Forge API: conectar con Ariadne

**Env del deploy `theforge-api`** (Dokploy / contenedor — no hay pantalla de usuario para esto):

```bash
THEFORGE_MCP_URL=https://tu-ariadne.ejemplo/mcp
MCP_AUTH_TOKEN=...   # token M2M que Ariadne acepta
```

Sin esto, al crear legacy aparece *«TheForge no está configurado»* y no lista proyectos Ariadne.

**Ajustes → Ariadne** en The Forge es la URL/token **por usuario** (prueba de conexión); **no sustituye** `THEFORGE_MCP_URL` del servidor.

### Paso C — The Forge UI: crear proyecto legacy

1. **Crear nuevo proyecto** → **Proyecto existente** o **Repositorio existente**.
2. Modal **Base de conocimientos** — pestaña **Proyectos** o **Repositorios** (datos de `list_known_projects` vía MCP).
3. Elige el ítem indexado en el paso A → se crea `projectType: LEGACY` con **`theforgeProjectId` = UUID de Ariadne** (automático).

**Auto-wire brownfield converge:** si `THEFORGE_MCP_URL` está activo, la API hace `PATCH` en Ariadne (`/api/repositories/:id`) con el UUID del proyecto Workshop recién creado, modo `incremental` por defecto y `stageId` de la etapa 1. Requiere token MCP (`MCP_AUTH_TOKEN` en el servidor o token Ariadne del usuario en Ajustes). Desactivar: `ARIADNE_BROWNFIELD_CONVERGE_AUTO=0`.

Para **solo documentar** el sistema actual, quédate en **etapa 1**. Para **cambios**, abre **etapa 2+**.

### Paso D — *(Opcional)* Converge automático post-reindex

Solo cuando **ya existe** el proyecto Workshop en The Forge:

**Ariadne → Repos → Editar → Brownfield converge (The Forge):**

- **The Forge project ID** = UUID del proyecto Workshop (header del Workshop o URL).
- Modo `incremental` / `all`, etc.
- Env ingest Ariadne: `THEFORGE_API_URL`, `THEFORGE_SERVICE_JWT`.

Cadena: `push → Ariadne reindex → converge/trigger → webhook (Slack/n8n)`.

---

## 3. Flujo mínimo (sin converge automático)

```text
Ariadne: repo + resync
    ↓
TF API: THEFORGE_MCP_URL
    ↓
TF UI: Crear → Legacy → elegir repo/proyecto Ariadne
    ↓
Workshop: MDD Inicial → MDD → entregables
```

Converge manual (Workshop → Tasks → Converge) y webhook CI son capas extra cuando ya hay `tasks.md`.

---

## 4. Etapa 1 — AS-IS (foto del sistema hoy)

Documenta **cómo está**, no cómo debería quedar.

| Paso | Pestaña / acción |
|------|------------------|
| 1 | **MDD Inicial** — `generate-codebase-doc` vía Ariadne (evidencia del grafo) |
| 2 | **MDD** — AS-IS: entidades, APIs, servicios desde código real |
| 3 | Entregables de la etapa (Spec, historias, API…) si los usáis como referencia |
| 4 | **Cerrar etapa 1** antes de promover cambios |

**Regla:** etapa 1 = referencia inmutable del «antes». No mezcles «pendiente de modificar» aquí.

---

## 5. Etapa 2+ — solo el delta

| Paso | Qué |
|------|-----|
| 1 | Tab **Modificación** — describe el cambio; Ariadne propone archivos y preguntas |
| 2 | Responde preguntas → **MDD de cambio** (no copies AS-IS entero) |
| 3 | Genera entregables de la etapa activa |
| 4 | **Gate legacy** — en etapa 2+ algunas acciones exigen `legacyChangeState` acordado |

Al **activar etapa N**, se snapshotea la anterior y el grafo Falkor enlaza `DERIVED_FROM` N→N-1.

---

## 6. Integración NEW ↔ LEGACY

Cuando un **producto nuevo** pide cambios al **monolito**:

| Rol | Dónde |
|-----|--------|
| Proyecto **NEW** | Pestaña **Integración** → handoff `NEW-LEG-01`, `NEW-LEG-02`… |
| Proyecto **LEGACY** | Importar handoff → etapa 2+ → historias `LEG-xx` propias |

Ver ayuda Workshop → **Integración Legacy ↔ Nuevo**.

---

## 7. Converge — drift código vs plan

**Converge** compara `tasks.md` + MDD con el codebase (Ariadne) y propone tareas nuevas.

| Superficie | Uso |
|------------|-----|
| Workshop → Tasks → **Converge** | Manual |
| `POST /projects/:id/converge` | API / scripts |
| `POST /projects/:id/converge/trigger` | CI + webhook saliente |

**The Forge:** Integración → **Webhook converge (CI)** (`convergeWebhookUrl`).

**Ariadne:** Editar repo → **Brownfield converge** — aquí el campo es el **UUID del proyecto Workshop**, no el de Ariadne.

---

## 8. Checklist operativo

### Ariadne (por repo) — antes del Workshop
- [ ] Repo registrado y **Resync** completado
- [ ] *(Opcional)* Webhook Bitbucket/GitHub activo

### The Forge API (una vez por deploy)
- [ ] `THEFORGE_MCP_URL` + `MCP_AUTH_TOKEN` en `theforge-api`

### The Forge (por proyecto legacy)
- [ ] Proyecto creado vía **Proyecto/Repositorio existente** (enlace Ariadne automático)
- [ ] Header Workshop muestra **`MCP <uuid>`** (ID Ariadne)
- [ ] `tasks.md` generado antes de converge
- [ ] *(Opcional)* Webhook converge en Integración

### Ariadne (por repo) — converge automático *(después de crear proyecto TF)*
- [ ] Brownfield converge: **The Forge project ID** (UUID Workshop) + trigger mode
- [ ] `THEFORGE_API_URL` + `THEFORGE_SERVICE_JWT` en ingest

### Equipo
- [ ] Etapa 1 cerrada antes de etapa 2
- [ ] NEW-LEG acordados antes de implementar en legacy

---

## 9. Errores frecuentes

| Síntoma | Causa | Acción |
|---------|-------|--------|
| MDD Inicial vacío | Grafo desactualizado o repo sin resync | Resync en Ariadne |
| «TheForge no está configurado» al crear legacy | Falta `THEFORGE_MCP_URL` en API | Configurar env del deploy |
| Converge sin evidencia | MCP caído o ID Ariadne incorrecto en proyecto | Revisar header `MCP <uuid>` y resync |
| Brownfield converge no dispara | `theforge_project_id` en Ariadne apunta al UUID equivocado | Usar UUID del **proyecto Workshop**, no el de Ariadne |
| Mezclar AS-IS y delta | Mismo MDD para todo | Separar etapas |
| NEW edita legacy directo | Anti-patrón | Solo handoff + import |

---

## 10. Referencias

- Workshop ayuda → **Webhook converge (CI)**, **Integración Legacy ↔ Nuevo**
- `docs/plans/PLAN-LEGACY-STAGE-P0-BROWNFIELD.md`
- `docs/plans/PLAN-BROWNFIELD-P1-P2-P3.md`
- Ariadne: `docs/notebooklm/BROWNFIELD-CONVERGE-THEFORGE.md`
