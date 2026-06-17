# Integración entre sistema viejo y producto nuevo

A veces construyes un **producto nuevo** y, al mismo tiempo, hay que **cambiar pantallas o APIs del sistema que ya está en producción** (el “legacy”). Normalmente lo hacen **dos personas**: una en el proyecto nuevo y otra en el sistema viejo.

TheForge te ayuda a **no perder el hilo** entre ambos: qué pidió el equipo nuevo, qué debe hacer el equipo legacy y cómo va quedando cada cosa.

> **En una frase:** cada proyecto tiene su documentación; el enlace entre ellos es la pestaña **Integración** del Workshop y una lista clara de “lo que el viejo debe cambiar por el nuevo”.

---

## ¿Para qué sirve esto?

Imagina que el **portal nuevo** necesita que el **cotizador viejo** muestre un botón o devuelva un dato por API. El equipo del portal sabe *qué* necesita; el equipo del cotizador sabe *cómo* tocar su código.

Sin un puente, acaban dos Word distintos, dos listas de tareas y nadie sabe si `NEW-LEG-03` ya está hecho en legacy.

Con este flujo:

- El **proyecto nuevo** describe qué cambios pide al legacy (lista **NEW-LEG-01**, **NEW-LEG-02**, …).
- El **proyecto legacy** documenta solo el **cambio** (etapa 2 en adelante) y genera sus propias historias (**LEG-07**, etc.).
- La **matriz de trazabilidad** une cada petición del nuevo con la historia del viejo.

---

## Tres documentos, tres roles (no mezclar)

| Qué es | Dónde | Quién lo cuida | Para qué sirve |
|--------|-------|----------------|----------------|
| **Foto del sistema hoy** | Legacy — **etapa 1** | Equipo legacy (cuando ya está cerrada) | Saber cómo funciona el viejo *antes* de tocar nada |
| **Lista de cambios pedidos** | Proyecto **nuevo** — pestaña **Integración** | Quien diseña el producto nuevo | Acordar con legacy *qué* hay que modificar |
| **Plan de cambio en el viejo** | Legacy — **etapa 2 o más** | Quien modifica pantallas/API legacy | Trabajar e implementar en el repo real |

**Regla simple:** el nuevo **no edita** el Workshop del legacy. El legacy **no copia a ciegas** las historias del nuevo: las **importa**, genera su MDD de cambio y sus historias propias.

---

## Cómo se ve el flujo (de punta a punta)

`Sistema viejo documentado (etapa 1) → Proyecto nuevo + lista de cambios → Legacy etapa 2 implementa`

```text
  ┌──────────────────┐         consulta cómo está hoy
  │  Legacy etapa 1  │ ─────────────────────────────────►  Proyecto nuevo
  │  (sistema actual)│                                      + lista NEW-LEG
  └──────────────────┘
           ▲
           │ importar lista y generar cambio
           │
  ┌──────────────────┐
  │  Legacy etapa 2+ │
  │  (solo el delta) │
  └──────────────────┘
```

---

## Paso a paso en el Workshop

### Antes de empezar (equipo legacy)

En el proyecto **Legacy**, **etapa 1** debe estar lista:

1. Pestaña **MDD Inicial** — documentación de partida del código.
2. Pestaña **MDD** — descripción del sistema **tal como está hoy** (sin “pendiente de modificar”).
3. Resto de entregables de esa etapa si los usáis (Spec, historias, API, etc.).

Eso es la **referencia**: el equipo del producto nuevo la usa para saber qué APIs y pantallas existen hoy.

---

### Equipo del producto nuevo

1. Abrí el Workshop del proyecto **nuevo**.
2. Entrá a la pestaña **Integración**.
3. **Enlazá** el proyecto Legacy correspondiente (botón *Enlazar proyecto*).
4. Añadí ítems en **Handoff NEW-LEG-*** — cada uno es un cambio concreto que el viejo debe hacer.  
   Ejemplo: *“La pantalla de cotización debe devolver un token para que el portal nuevo complete el login.”*
5. Cuando la lista esté acordada, pulsá **Enviar al legacy**.

Opcional: seguí el flujo habitual del proyecto nuevo (MDD, Spec, historias del producto nuevo). La pestaña Integración no sustituye eso; complementa el puente con legacy.

---

### Equipo legacy (sistema viejo)

1. En el Workshop **Legacy**, pestaña **Integración**, **enlazá** el proyecto nuevo (si no quedó enlazado al revés).
2. Creá **etapa 2** (botón *Nueva etapa* arriba a la derecha) — cada etapa grande de cambio puede ser una etapa nueva.
3. Con la **etapa 2** seleccionada, en **Integración** pulsá **Importar handoff**.  
   Eso copia la lista del nuevo a **Modificación** y deja constancia de cuándo se importó.
4. Generá el **MDD de cambio** (pestaña MDD → Regenerar) — solo describe **qué cambia**, no todo el sistema otra vez.
5. Generá **historias de usuario** y el resto de entregables de esa etapa como siempre.

En las historias del legacy conviene indicar de qué petición del nuevo vienen, por ejemplo: *Satisface: NEW-LEG-01*.

---

### Trabajar en paralelo (ejemplo de calendario)

| Cuándo | Producto nuevo | Sistema legacy |
|--------|----------------|----------------|
| Semana 1 | Enlazar legacy + armar lista NEW-LEG + enviar | Crear etapa 2 + importar handoff |
| Semana 2 | Avanzar el producto nuevo usando la doc de etapa 1 como referencia | Generar MDD de cambio + historias LEG-* |
| Semana 3+ | Probar contra el legacy ya modificado | Implementar en código las historias LEG-* |

Lo que suele frenar no es la herramienta, sino **acordar** pantalla o API exacta — por eso la lista NEW-LEG y la matriz ayudan.

---

## Pestaña Integración — qué encontrás

| Sección | Qué hace |
|---------|----------|
| **Proyecto enlazado** | Une el Workshop nuevo con el legacy (y viceversa) |
| **Handoff NEW-LEG-*** (solo en proyecto nuevo) | Crear, editar y enviar la lista de cambios pedidos al viejo |
| **Importar handoff** (legacy, etapa 2+) | Traer esa lista a Modificación de una vez |
| **Extracto AS-IS** (proyecto nuevo) | Vista de cómo está hoy el legacy (contexto y APIs) sin abrir el otro proyecto |
| **Matriz de trazabilidad** | Tabla NEW-LEG ↔ LEG para ver qué está hecho |
| **Avisos** (tarjetas amarillas) | Te recuerdan pasos que faltan (enlazar, enviar, importar, etc.) |

---

## Matriz de seguimiento

En la misma pestaña **Integración** ves una tabla como esta:

| NEW-LEG | LEG | Pantalla o API | Estado |
|---------|-----|----------------|--------|
| NEW-LEG-01 | LEG-07 | Cotizador — login | En progreso |
| NEW-LEG-02 | LEG-08 | API de guardado | Hecho |

Si el producto nuevo cambia el alcance: actualizá la lista, volvé a **Enviar al legacy** y, si el cambio es grande, abrí **etapa 3** en legacy en lugar de mezclar todo en la misma etapa.

---

## Errores habituales (y qué hacer)

| Evitá | Mejor |
|-------|-------|
| Dos personas editando las mismas historias en ambos proyectos | Cada uno en su proyecto; el puente es Integración |
| Meter integración en **legacy etapa 1** (sistema “como está”) | Integración solo en **etapa 2+** |
| Programar en legacy leyendo solo la lista del nuevo sin regenerar doc | Importar handoff → MDD de cambio → historias LEG-* |
| Reescribir todo el sistema en etapa 2 | Solo lo que **cambia** |
| Olvidar enlazar proyectos antes de enviar/importar | Siempre **Enlazar** primero en Integración |

---

## Glosario mínimo

| Término | Significado en plata llana |
|---------|----------------------------|
| **Legacy** | Proyecto en TheForge ligado a un sistema **ya existente** |
| **Etapa 1** | Documentación del sistema **hoy**, sin cambios pendientes |
| **Etapa 2+** | Un **cambio concreto** (por ejemplo, por una integración) |
| **Handoff** | La lista de cambios que el **nuevo** pide al **viejo** |
| **NEW-LEG-XX** | Código de cada ítem de esa lista (lado producto nuevo) |
| **LEG-XX** | Historia de usuario generada en el legacy para implementar |
| **MDD** | Documento maestro que ordena el resto de la documentación del proyecto |

---

## Más detalle técnico (opcional)

Si necesitás profundizar en etapas AS-IS, APIs o el motor legacy:

- `docs/notebooklm/LEGACY-FLOW-AS-IS-MDD.md`
- `docs/plans/PLAN-LEGACY-NEW-INTEGRATION.md`
