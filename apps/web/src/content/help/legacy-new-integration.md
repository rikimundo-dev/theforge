# Integración Legacy ↔ Proyecto nuevo

Guía operativa cuando **dos sistemas conviven**: un monolito **LEGACY** (documentado en TheForge como proyecto legacy) y un **producto nuevo** (proyecto NEW de alta complejidad) que se conecta a él. Suele trabajar **dos personas distintas** — una en el repo nuevo y otra en pantallas/API del legacy.

> **Idea clave:** no mantienes dos constituciones ni dos backlogs sincronizados a mano. Cada proyecto tiene **su dueño** y **su fuente de verdad**; el puente es un **handoff** explícito con trazabilidad en texto.

---

## Los tres artefactos (no confundir)

| Capa | Proyecto | Dueño | Qué documenta | SSOT para… |
|------|----------|-------|---------------|------------|
| **Contrato AS-IS** | LEGACY — **etapa 1** | Equipo legacy (cerrada) | Sistema **tal como existe hoy** (MDD §3–§5, API, reglas) | Entender el monolito antes de integrar |
| **Handoff de integración** | **NEW** | Persona del producto nuevo | Qué debe cambiar en legacy **por la integración** (`NEW-LEG-*`) | Acordar alcance entre equipos |
| **Delta implementable** | LEGACY — **etapa 2+** | Persona que toca pantallas legacy | MDD de **cambio** + Casos de Uso + H.U. (`LEG-*`) | Implementar y probar en el repo legacy |

El proyecto **NEW** no edita el Workshop legacy. La persona legacy **no implementa** desde las H.U. crudas del NEW: las usa como **entrada** y regenera las suyas desde su MDD de cambio.

---

## Flujo recomendado (vista general)

`Legacy etapa 1 (AS-IS) → NEW (MDD + handoff) → Legacy etapa 2 (MDD cambio + H.U.) → Implementación en paralelo`

```text
┌─────────────────────┐     referencia §4/§5      ┌─────────────────────┐
│  LEGACY  Etapa 1    │ ────────────────────────► │  Proyecto NEW       │
│  MDD AS-IS (cerrado)│                             │  MDD + Spec + H.U.  │
└─────────────────────┘                             │  + NEW-LEG-* handoff│
                                                    └──────────┬──────────┘
                                                               │ handoff (1 vez)
                                                               ▼
                                                    ┌─────────────────────┐
                                                    │  LEGACY  Etapa 2+   │
                                                    │  MDD cambio + LEG-* │
                                                    └─────────────────────┘
```

---

## Paso a paso

### 0. Precondición — Legacy etapa 1 cerrada

En el proyecto **LEGACY**, **etapa 1** (`ordinal === 1`):

1. **MDD Inicial** (doc. partida desde Ariadne) → pestaña *MDD Inicial*.
2. **MDD** canónico AS-IS → `generate-mdd` (no lenguaje de “modificación pendiente”).
3. **Entregables** etapa 1: Spec, Casos de Uso, H.U., Blueprint, API, Flujos, etc.

Esa etapa es la **fotografía del sistema en producción**. El equipo NEW la usa como **dependencia externa** (contratos API, entidades, reglas §5).

---

### 1. Persona NEW — producto nuevo

En el proyecto **NEW** (complejidad alta):

| Paso | Acción en Workshop | Resultado |
|------|-------------------|-----------|
| 1 | MDD §1 — declarar dependencia externa | Texto: “Integración con legacy *{nombre}* — contrato según proyecto `{uuid}` etapa 1” |
| 2 | Cascada habitual | `BRD → To-Be → MDD → Spec → … → H.U.` del **producto nuevo** |
| 3 | Bloque **handoff legacy** al final de Spec o H.U. | Historias etiquetadas **`[Legacy handoff]`** con prefijo `NEW-LEG-01`, `NEW-LEG-02`, … |
| 4 | Entregar handoff al compañero legacy | Copiar markdown, export ZIP o enlace al proyecto NEW |

**Ejemplo de H.U. handoff:**

> **`[Legacy handoff] NEW-LEG-01`** — Como usuario del cotizador legacy, necesito que la pantalla X exponga un token OAuth para el callback del portal nuevo, para completar el login federado.

Esas H.U. describen **intención de integración**, no la implementación final en React/Strapi del legacy.

---

### 2. Handoff — una sola vez (no sync continuo)

La persona NEW entrega:

- Lista `NEW-LEG-*` (alcance de negocio)
- ID del proyecto NEW en TheForge
- 2–3 párrafos de contexto (qué sistema nuevo, qué flujo cruza el límite)

La persona **legacy** crea **etapa 2** en su proyecto LEGACY:

- Botón **Nueva etapa** → modal → etapa con `ordinal === 2`
- En el tab **Modificación**, pegar el handoff en la **descripción del cambio**
- Añadir: *“Origen: integración con proyecto NEW `{uuid}`”*
- Opcional: BRD de la iniciativa en esa etapa

**No** hace falta duplicar el MDD AS-IS ni editar las H.U. de la etapa 1.

---

### 3. Persona legacy — pantallas y API del monolito

En **LEGACY etapa 2+**:

| Paso | Acción | Resultado |
|------|--------|-----------|
| 1 | `generate-mdd` | MDD de **cambio** (línea base = etapa anterior; preámbulo BRD si aplica) |
| 2 | §1 del MDD | Debe citar proyecto NEW + handoff: *“Implementa integración con NEW `{id}`; satisface NEW-LEG-01..05”* |
| 3 | `generate-deliverables` o regeneración individual | Casos de Uso + **H.U. `LEG-*`** desde el MDD de cambio |
| 4 | Trazabilidad en cada `LEG-*` | Campo o nota: *“Satisface NEW-LEG-03”* |

Las **`LEG-*`** son la **lista de trabajo real** del dev legacy (rutas, componentes y permisos del repo indexado en Ariadne).

Regeneración en legacy etapa 2+: las H.U. usan el pipeline estándar de **cambio** (solo el delta del MDD), no el modo AS-IS de etapa 1.

---

### 4. Trabajo en paralelo

| Semana | Persona NEW | Persona legacy |
|--------|-------------|------------------|
| 1 | MDD NEW + H.U. `NEW-*` + handoff `NEW-LEG-*` | Abre etapa 2; absorbe handoff en Modificación |
| 2 | Implementa app nueva contra §4 AS-IS + contrato acordado | `generate-mdd` + H.U. `LEG-*` |
| 3+ | Consume legacy ya modificado | Implementa `LEG-*` en el repo |

El cuello de botella suele ser **acordar contrato** (API/pantalla), no mantener dos Word en sync.

---

## Matriz de trazabilidad (recomendada)

Mantenla fuera del MDD o como tabla al final del Spec NEW — una sola fila por ítem de integración:

| NEW-LEG | LEG | Pantalla / endpoint | Estado |
|---------|-----|---------------------|--------|
| NEW-LEG-01 | LEG-07 | `/cotizador` — token OAuth | En progreso |
| NEW-LEG-02 | LEG-08 | `POST /api/...` header Y | Hecho |

Cuando el alcance NEW cambie: la persona NEW actualiza el handoff → legacy abre **etapa 3** si el delta es grande, o actualiza la etapa 2 y regenera MDD/H.U.

---

## Qué evitar

| ❌ Anti-patrón | ✅ En su lugar |
|----------------|----------------|
| Dos personas editando `userStoriesContent` en ambos proyectos como la misma lista | Handoff NEW → MDD cambio legacy → H.U. `LEG-*` propias |
| H.U. de integración en **legacy etapa 1** (AS-IS) | Etapa 1 = producto en uso; integración en **etapa 2+** |
| Implementar legacy desde H.U. `NEW-LEG-*` sin regenerar | Regenerar H.U. desde MDD de cambio en legacy |
| Reescribir todo el AS-IS en etapa 2 | Solo **delta** en MDD de cambio |
| Esperar un documento único “cross-project” automático | Trazabilidad manual en §1 + matriz (hoy) |

---

## Qué hace TheForge hoy (y qué no)

| Disponible | Limitación actual |
|------------|-------------------|
| Proyectos LEGACY con **etapas** (`DERIVED_FROM` en Falkor) | No hay enlace automático `linkedLegacyProjectId` entre NEW y LEGACY |
| Etapa 1 AS-IS vs etapa 2+ **MDD de cambio** | No importa handoff NEW al crear etapa 2 |
| Tab **Modificación** + AriadneSpecs en legacy | `parentProjectId` (suite) es organizacional, no sincroniza docs |
| H.U. con prompt de **solo delta** en MDD de cambio | Copy/paste del handoff sigue siendo manual |

**Workaround operativo:** descripción etapa 2 + §1 MDD + matriz NEW-LEG ↔ LEG. Futuro posible: campo de enlace entre proyectos y bloque auto en §1 al generar MDD.

---

## Referencia rápida por rol

| Rol | Proyecto | Etapa | Documentos que toca |
|-----|----------|-------|---------------------|
| Arquitecto / dev **NEW** | NEW | — | MDD, Spec, H.U. (`NEW-*` + `NEW-LEG-*`) |
| Dev **legacy** | LEGACY | 1 (solo lectura tras cierre) | MDD AS-IS como contrato |
| Dev **legacy** | LEGACY | 2+ | Modificación → MDD cambio → CU → H.U. `LEG-*` |

---

## Más documentación en el repositorio

- `docs/notebooklm/LEGACY-FLOW-AS-IS-MDD.md` — etapa 1 AS-IS y etapas 2+ cambio
- `docs/notebooklm/THEFORGE-INDEX.md` — índice general del producto
- `apps/api/src/modules/legacy-flow/README.md` — API legacy (`generate-mdd`, `generate-deliverables`)
