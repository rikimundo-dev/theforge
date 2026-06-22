# Greenfield — producto nuevo desde cero

**Greenfield** es el flujo para especificar y construir un **producto nuevo** sin código en producción previo. TheForge gobierna la especificación (SDD); el código se deriva de los documentos, no al revés.

> **En una frase:** conversas con la IA → MDD como constitución → semáforo en verde → entregables listos para el repo.

---

## ¿Cuándo usar greenfield?

| Situación | ¿Greenfield? |
|-----------|--------------|
| App, portal o servicio **nuevo** | **Sí** |
| MVP sin legacy que documentar | **Sí** |
| Cambio sobre monolito ya en prod | **No** → brownfield |
| Solo documentar sistema existente | **No** → brownfield etapa 1 |

---

## 1. Crear el proyecto

1. En el panel de proyectos, pulsa **Crear nuevo proyecto**.
2. Elige **Proyecto nuevo** (tipo `NEW`).
3. Asigna un nombre claro (equipo + producto).

No necesitas Ariadne ni repos indexados para empezar.

---

## 2. Complejidad y flujo

TheForge adapta las pestañas según **complejidad** (Baja / Media / Alta):

### Alta complejidad (flujo completo)

`Paso 0 → BRD → To-Be → MDD → Spec → Arquitectura → Casos de uso → Historias → Blueprint → Design System → API → Flujos → Tasks → Infra`

| Fase | Qué haces |
|------|-----------|
| **Paso 0** | Investigación, benchmark, gap analysis (opcional pero recomendado) |
| **BRD / To-Be** | Problema de negocio, KPIs, estado deseado |
| **MDD** | Constitución técnica de 7 secciones — gobierna todo |
| **Entregables** | Tras **semáforo verde + Spec**, generación masiva |

### Media complejidad

Sin MDD explícito en barra; insumo principal Paso 0 / Spec. Entregables acotados: Spec → API → Design System → Tasks.

### Baja complejidad

Flujo mínimo: entrevista → Spec → Tasks.

---

## 3. Workshop — tres zonas

| Zona | Uso |
|------|-----|
| **Chat (izquierda)** | Describe requisitos; la IA delega en agentes (Clarifier, Arquitecto, Seguridad…). Escribe **`/`** para regenerar **solo una sección** del MDD. |
| **Documentos (centro)** | Pestañas: MDD, Spec, Blueprint, etc. Edita y regenera por pestaña. |
| **Semáforo (derecha)** | Conformidad del MDD + estimación MXN por rol. |

---

## 4. Semáforo (regla de oro)

| Color | Significado |
|-------|-------------|
| **Rojo** | Faltan entidades, business core o contratos mínimos |
| **Amarillo** | Hay entidades pero faltan edge cases, tipos o UX |
| **Verde** | Checklist SDD completo — **habilita generación masiva de entregables** |

Sin **verde + Spec** no uses «Generar entregables» como cierre de fase.

---

## 5. Orden recomendado día a día

1. **Entrevista / chat** — no saltes al MDD sin contexto de negocio.
2. **Paso 0 / BRD** — alinea stakeholders antes de modelar datos.
3. **MDD** — itera hasta amarillo/verde; usa **Auditar MDD** si dudas.
4. **Spec** — aclara ambigüedades (`clarify-spec` si aplica).
5. **Entregables** — cascada cuando el semáforo lo permita.
6. **Export** — «Llevar al repo» / bundle spec-kit cuando el paquete esté cerrado.

---

## 6. Etapas (opcional)

Puedes crear **varias etapas** en un mismo proyecto (releases, fases). Cada etapa tiene su MDD y semáforo; el chat es global. Útil para v2, v3 sin mezclar documentación.

---

## 7. Errores frecuentes

| Error | Qué hacer |
|-------|-----------|
| Generar entregables con semáforo rojo | Completar MDD §3–§6 primero |
| Saltarse Spec | Spec es puerta; sin él no hay trazabilidad a código |
| Mezclar requisitos legacy en greenfield | Crea proyecto **Legacy** aparte |
| Editar entregables sin tocar MDD | SDD: el cambio empieza en la especificación |

---

## 8. Referencias en TheForge

- Ayuda del Workshop → **Manual** y **SDD**
- Repo: `docs/notebooklm/THEFORGE-QUE-HACE-EL-PROYECTO.md`
- Entregables: `docs/notebooklm/ENTREGABLES-SDD-VALIDACION.md`
