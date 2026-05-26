# Research Report — Módulo de Costos OBP

| Campo        | Valor                         |
| :----------- | :---------------------------- |
| **Proyecto** | Out-of-Home Bit Planner (OBP) |
| **Fase**     | Discovery — Pre-PRD           |
| **Fecha**    | Mayo 2026                     |
| **Equipo**   | UX/UI · IMJ Media             |
---

### Módulos del proyecto

| #  | Módulo                            | Rol                        | Descripción                                                                          |
| :--- | :-------------------------------- | :------------------------- | :----------------------------------------------------------------------------------- |
| 01 | Catálogo de costos                | Operaciones                | Tipos de costo globales y por medio. Base del módulo 02.                             |
| 02 | Configuración de costos en medios | Gestion de Stock           | Asignación de costos del catálogo a medios y tipos de medio.                         |
| 03 | Costos en cotizador               | Comercial                  | visualización de costos en cotizador sin cantidades y avisos de                      |
| 04 | Captura de costos                 | Operaciones                | Costos por campaña/medio. Auto-actualización desde Odoo OC.                          |
| 05 | Vista de auditoría                | Trade                      | Auditoría de márgenes. Read-only + vistas agregadas + export.                        |
| 06 | Panel de autorizaciones           | Comercial / Gerente        | Solicitud y aprobación de descuentos fuera de margen.                                |
| 07 | Listas de Márgenes Dinámicos**    | Trade / Gerencia Comercial | Configuración de listas de márgenes con % base ajustable por calificación del medio. |

### Hallazgos críticos del discovery ux/ui

🔴 **Crítico #1 — El histórico de costos no existe como sistema:** es un Excel en Drive mantenido por Planes Sr + carpeta en NAS. Una persona (Marisol, Planes Sr de camiones) actúa como curadora informal. El módulo 01 reemplaza completamente esta arquitectura frágil.

🔴 **Crítico #2 — Actualizar costos en OBP hoy requiere intermediación de Data Analyst** con hasta 1 semana de espera. La integración Odoo API del módulo 04 elimina este cuello de botella completamente.

🔴 **Crítico #3 — Los límites de descuento tienen 4 versiones distintas entre 4 comerciales:** 20%, 30%, 35% y esquema variable. La política no está unificada. El módulo 06 requiere una vista de configuración de Dirección como prerequisito.

🔴 **Crítico #4 — No existe un sistema de márgenes dinámico por calidad de inventario:** actualmente OBP tiene Listas de Precios (por tipo de cliente: directo/agencia), pero no existe un mecanismo que vincule el margen mínimo de ganancia con la calidad del medio. OBP ya cuenta con un sistema de calificación de medios (expresado en estrellas), pero esa calificación no impacta hoy ninguna regla de pricing. El módulo 07 crea esta conexión y sistematiza la política de márgenes por calidad de inventario.

🟡 **Hallazgo #5 — Trade NO es una vista de Operaciones en modo lectura.** Los 3 respondentes confirmaron que necesitan vistas analíticas distintas: margen proyectado vs real por comercial/período, benchmark por proveedor/plaza, export para reportes a Dirección.

🟡 **Hallazgo #6 — El error más frecuente en captura de Stock es transposición de dígitos** por falta de separador de miles. Con 30+ medios/semana por persona, un problema de formato genera costos incorrectos en producción de forma sistemática.

🟢 **Validación — El semáforo de margen y el flujo de autorización con botón en OBP fueron validados** por el equipo comercial. Andrea Ramírez: *"un botón dentro de OBP que autorice la negociación… todas las áreas involucradas estaríamos en línea."*

🟢 **Validación — El concepto de margen dinámico por calificación es coherente con la operación comercial:** medios con alta calificación son inventario premium (más demanda, mayor poder de negociación), lo que justifica un piso de margen mayor. Medios con baja calificación requieren precios más competitivos.

---

## Dos objetivos centrales del microservicio

Este microservicio tiene dos objetivos fundamentales que definen toda su arquitectura:

### Objetivo 1: Creación de listas de precios basadas en reglas
- Las listas de precios se construyen aplicando reglas configurables (por tipo de cliente, plaza, calificación de medio, etc.).
- Cada lista puede tener **niveles** (ejemplo: nivel 1, nivel 2, nivel 3).
- En cada nivel se define el **margen de utilidad deseado** (porcentaje).
- El sistema calcula el precio final aplicando la regla + el margen del nivel correspondiente.

**Fórmula de cálculo del Precio de Venta (PV):**

Para obtener el Precio de Venta a partir del Costo (C) y el Margen deseado (M) expresado en decimal (ej: 30% → 0.30), se utiliza la siguiente fórmula:

PV = C / (1 - M)

Donde:

    C = Costo total del medio (suma de renta + costos asociados).
    M = Margen de utilidad deseado en decimal (valor entre 0 y 1).
    PV = Precio de Venta final que se presenta en el cotizador.

Ejemplo: Si el costo de un medio es $10,000 MXN y se desea un margen del 25% (0.25), el precio de venta será:

PV = 10,000 / (1 - 0.25) = 10,000 / 0.75 = $13,333.33 MXN

### Objetivo 2: Recepción de costos reales desde Odoo
- Odoo envía los costos reales de las órdenes de compra (OC) una vez que se generan.
- El microservicio expone un **endpoint específico** para que Odoo envíe estos datos.
- Al recibir un costo real, el sistema actualiza automáticamente el margen de la campaña y el semáforo correspondiente.

---

## Arquitectura del microservicio

### Multi-tenancy lógico

El microservicio es **multi-tenant lógico**: cada aplicación origen (OBP, OBP4MO, futuras) se identifica con un `tenant_id` único. **Todas las tablas del microservicio** (catálogo de costos, configuraciones, campañas, márgenes, autorizaciones, etc.) incluyen el campo `tenant_id` como discriminante.

- El `tenant_id` se asigna en el momento de alta de la aplicación en el microservicio.
- Todas las consultas CRUD filtran por `tenant_id` para garantizar aislamiento de datos entre aplicaciones.
- Las tablas espejo también incluyen `tenant_id` para identificar el sistema origen.

### Catálogo de costos alimentado desde aplicaciones origen

El **Módulo 01 (Catálogo de costos)** no se gestiona directamente en el microservicio, sino que **se alimenta desde las aplicaciones que dan mantenimiento** (OBP, OBP4MO, etc.). Cada aplicación tiene su propio catálogo de costos. Cuando una aplicación crea, modifica o elimina un tipo de costo o tarifa, el cambio se refleja en el microservicio mediante **webhooks** y se almacena en una tabla espejo con `tenant_id`.

**Flujo:**
1. El usuario gestiona tipos de costo y tarifas en su aplicación (OBP, OBP4MO, etc.).
2. La aplicación dispara un webhook hacia el microservicio.
3. El microservicio recibe el payload con `tenant_id` y actualiza su tabla espejo de catálogo.
4. El microservicio utiliza esos datos para los cálculos de márgenes y costos en campañas.

### Tablas espejo multi-tenant

Las tablas espejo del microservicio incluyen `tenant_id` como clave de partición lógica. Ejemplo para la tabla de costos del catálogo:

```sql
CREATE TABLE catalog_costos (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,            -- Identifica la aplicación origen
  nombre VARCHAR(255) NOT NULL,
  etiquetas TEXT[],
  tipo_costo VARCHAR(50),             -- 'GLOBAL', 'POR_MEDIO'
  tipo_valor VARCHAR(50),             -- 'MONTO_FIJO', 'PORCENTAJE'
  valor DECIMAL(15, 2),
  moneda VARCHAR(3) DEFAULT 'MXN',
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, nombre)           -- Un nombre de costo por tenant
);

CREATE INDEX idx_catalog_costos_tenant ON catalog_costos(tenant_id);

Todas las tablas del microservicio (costos en medios, campañas, márgenes, autorizaciones, etc.) seguirán el mismo patrón: incluir tenant_id en el PK o como campo obligatorio, con índices para filtrado eficiente.
Arquitectura de integración: tablas espejo desde OBP y OBP4MO
Contexto

El microservicio compartirá base de datos con OBP, pero para agilizar los cálculos de márgenes y evitar saturar de consultas REST innecesarias, se mantendrán tablas espejo sincronizadas desde los sistemas origen mediante webhooks. Se trabajará con dos sistemas externos:

    OBP4MO: Plataforma con estructura de datos normalizada (relaciones País → Estado → Ciudad).
    OBP: Plataforma actual donde la información geográfica no está normalizada (todo en una sola entidad Ubicación con atributos combinados).

Estrategia de espejo

Se crean tablas espejo para ambos sistemas, permitiendo que el microservicio realice cálculos localmente sin depender de consultas REST en tiempo real. Mientras OBP no se normalice, coexistirán dos estructuras:
Sistema	Estructura	Tablas espejo
OBP4MO	Normalizada (País → Estado → Ciudad)	paises, estados, ciudades, formatos_medio, medios
OBP	Desnormalizada (Ubicación única)	ubicaciones_obp, medios_obp, formatos_medio_obp
Entidades espejo
Para OBP4MO (estructura normalizada)
Tabla espejo	Sistema origen	Descripción
paises	OBP4MO	Lista de países con siglas, moneda, etc.
estados	OBP4MO	Estados/provincias, cada uno con relación pais_id
ciudades	OBP4MO	Ciudades, cada una con relación estado_id
formatos_medio	OBP4MO	Formatos de medios (ej: espectacular, outdoor, indoor). Se asocian a país (pais_id).
medios	OBP4MO	Medios publicitarios concretos. Se asocian a ciudad_id y formato_medio_id.
Para OBP (estructura desnormalizada — pendiente de normalizar)
Tabla espejo	Sistema origen	Descripción
ubicaciones_obp	OBP	Entidad única con todos los datos geográficos (nombre, siglas, audiencia, geolocalización). No hay separación País/Estado/Ciudad.
medios_obp	OBP	Medios publicitarios. Asociados a ubicacion_id.
formatos_medio_obp	OBP	Formatos de medios. Asociados a ubicacion_id o directamente a país según el caso.
Relaciones entre entidades

OBP4MO (normalizado):

pais ──┬── estado ──┬── ciudad ──┬── medio
       │             │             │
       │             └── medio (indoor, outdoor, camión)
       │
       └── formato_medio ──┐
                           │
                    medio ─┘

OBP (desnormalizado):

ubicacion ──┬── medio (indoor, outdoor, camión)
            │
            └── formato_medio

Donde:

    De Ciudad (OBP4MO) y Ubicación (OBP) se desprenden los medios (Indoors, Outdoor, Camiones).
    De País se desprenden los formatos de los medios (ej: vallas, espectaculares, parabus, etc.), que a su vez se asocian con los medios concretos.

Esquema SQL para tablas espejo (OBP4MO) con tenant_id

-- Tabla espejo de países (desde OBP4MO)
CREATE TABLE paises (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  siglas VARCHAR(10),
  moneda VARCHAR(3) DEFAULT 'MXN',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla espejo de estados (desde OBP4MO)
CREATE TABLE estados (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  pais_id UUID NOT NULL REFERENCES paises(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  siglas VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla espejo de ciudades (desde OBP4MO)
CREATE TABLE ciudades (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  estado_id UUID NOT NULL REFERENCES estados(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  siglas VARCHAR(10),
  audiencia BIGINT,
  geolocalizacion JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla espejo de formatos de medio (desde OBP4MO)
CREATE TABLE formatos_medio (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  pais_id UUID NOT NULL REFERENCES paises(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  siglas VARCHAR(10),
  descripcion TEXT,
  tipo VARCHAR(50), -- 'INDOOR', 'OUTDOOR', 'CAMION'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla espejo de medios (desde OBP4MO)
CREATE TABLE medios (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ciudad_id UUID NOT NULL REFERENCES ciudades(id) ON DELETE CASCADE,
  formato_medio_id UUID NOT NULL REFERENCES formatos_medio(id) ON DELETE CASCADE,
  clave VARCHAR(100) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  audiencia BIGINT,
  geolocalizacion JSONB,
  flags JSONB,
  activo BOOLEAN DEFAULT TRUE,
  calificacion INTEGER CHECK (calificacion >= 1 AND calificacion <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes en cálculo de márgenes
CREATE INDEX idx_medios_ciudad ON medios(ciudad_id);
CREATE INDEX idx_medios_formato ON medios(formato_medio_id);
CREATE INDEX idx_ciudades_estado ON ciudades(estado_id);
CREATE INDEX idx_estados_pais ON estados(pais_id);
CREATE INDEX idx_formatos_medio_pais ON formatos_medio(pais_id);
CREATE INDEX idx_paises_tenant ON paises(tenant_id);
CREATE INDEX idx_estados_tenant ON estados(tenant_id);
CREATE INDEX idx_ciudades_tenant ON ciudades(tenant_id);
CREATE INDEX idx_formatos_medio_tenant ON formatos_medio(tenant_id);
CREATE INDEX idx_medios_tenant ON medios(tenant_id);

Esquema SQL para tablas espejo (OBP — estructura desnormalizada) con tenant_id

-- Tabla espejo de ubicaciones (desde OBP — estructura plana)
CREATE TABLE ubicaciones_obp (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  siglas VARCHAR(10),
  audiencia BIGINT,
  geolocalizacion JSONB,
  tipo VARCHAR(50), -- 'PAIS', 'ESTADO', 'CIUDAD' (se infiere del contexto)
  pais_referencia VARCHAR(255),
  estado_referencia VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla espejo de formatos de medio (desde OBP)
CREATE TABLE formatos_medio_obp (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  siglas VARCHAR(10),
  descripcion TEXT,
  ubicacion_id UUID REFERENCES ubicaciones_obp(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla espejo de medios (desde OBP)
CREATE TABLE medios_obp (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  ubicacion_id UUID NOT NULL REFERENCES ubicaciones_obp(id) ON DELETE CASCADE,
  formato_medio_id UUID REFERENCES formatos_medio_obp(id),
  clave VARCHAR(100) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  audiencia BIGINT,
  geolocalizacion JSONB,
  flags JSONB,
  activo BOOLEAN DEFAULT TRUE,
  calificacion INTEGER CHECK (calificacion >= 1 AND calificacion <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ubicaciones_obp_tenant ON ubicaciones_obp(tenant_id);
CREATE INDEX idx_formatos_medio_obp_tenant ON formatos_medio_obp(tenant_id);
CREATE INDEX idx_medios_obp_tenant ON medios_obp(tenant_id);

Flujo de sincronización vía webhooks

    Evento en sistema origen: Cuando se crea, actualiza o elimina un registro en OBP4MO u OBP (país, estado, ciudad, ubicación, formato, medio, costo), el sistema origen dispara un webhook.
    Endpoint receptor: El microservicio expone un endpoint genérico /api/v1/webhooks/{sistema}/{entidad} que recibe el payload e incluye el tenant_id.
    Procesamiento: El microservicio actualiza (upsert) la tabla espejo correspondiente, siempre usando el tenant_id del payload.
    Reintentos: Si el webhook falla, se reintenta hasta 3 veces con backoff exponencial (1min, 5min, 15min).
    Sincronización inicial: Al deployar el microservicio, se ejecuta una carga inicial completa desde ambos sistemas mediante REST API, asignando el tenant_id correspondiente.

Endpoint receptor de webhooks

POST /api/v1/webhooks/:sistema/:entidad

Recibe eventos de creación/actualización/eliminación de entidades desde OBP4MO u OBP.

Request body (ejemplo para ciudad desde OBP4MO):

{
  "event": "created",
  "timestamp": "2026-05-20T10:00:00Z",
  "tenant_id": "uuid-del-tenant",
  "data": {
    "id": "uuid",
    "nombre": "Ciudad de México",
    "siglas": "CDMX",
    "estado_id": "uuid-del-estado",
    "audiencia": 9200000,
    "geolocalizacion": {
      "lat": 19.4326,
      "lng": -99.1332
    }
  }
}

Response 200:

{
  "status": "ok",
  "entity": "ciudades",
  "action": "upserted"
}

Beneficios de las tablas espejo

    Rendimiento: Los cálculos de márgenes y listas de precios se ejecutan contra tablas locales, sin REST calls a OBP4MO/OBP.
    Disponibilidad: Si el sistema origen está caído, el microservicio sigue funcionando con los datos espejo.
    Trazabilidad: Se mantiene un log de sincronización para auditoría.
    Flexibilidad: Mientras OBP no se normalice, ambas estructuras coexisten. Cuando OBP se normalice, se migran los datos y se eliminan las tablas _obp.

Riesgos y mitigaciones
Riesgo	Mitigación
Desincronización entre espejo y origen	Webhook + sincronización batch diaria de reconciliación
Payload malformado desde origen	Validación estricta del payload + log de errores + cola de reintentos
Volumen alto de eventos	Procesamiento asíncrono con cola (Bull/RabbitMQ) + rate limiting
OBP no normalizado genera ambigüedad	Tablas separadas _obp + documentación del mapeo manual
Mezcla de datos entre tenants	Filtro obligatorio por tenant_id en todas las consultas
Feature candidates por módulo
Módulo 01 — Catálogo de costos

Contexto: Este módulo será una tabla muy simple con tabs para los medios que muestren columnas definidas con la única acción de modificar el costo de un medio. El catálogo se alimenta desde las aplicaciones origen (OBP, OBP4MO, etc.) mediante webhooks. Cada aplicación es un tenant y sus costos se almacenan con su tenant_id. El microservicio solo consume y actualiza los datos espejo.
Must Have	Should Have
Tabs con diferentes tipos de medio: Sitios fijos, indoors, camiones, vallas móviles, brand riders.	Poder eliminar costos con todas las implicaciones que conlleva.
Buscador por nombre o tipo de costo.	Separador de miles en campo de costo + formato visual al escribir
Tabla con los datos agregados y con las columnas de: Nombre de costo, Etiquetas, Tipo de costo, Tipo de valor, Valor	Alerta no-bloqueante cuando costo se sale del rango histórico.
Poder editar los montos de los valores.	
Sincronización automática desde las aplicaciones origen vía webhook.	
Filtro por tenant (cada aplicación ve solo su catálogo).	
Módulo 02 — Configuración de costos en medios

Contexto: En la tabla de OBP data editor se va a agregar una columna que sea costos asociados. Será una celda de tipo select autocomplete que despliegue un dropdown list con los costos. Se podrán agregar todos con un botón de select all, o cada uno granularmente. La sumatoria de todos estos costos más la renta nos da el costo global. Para acciones masivas, al seleccionar varios medios aparecerá un botón en el toolbar de "Agregar costos asociados" que abrirá un modal con la lista de costos disponibles.
Must Have	Should Have
Asignación de costos del catálogo a medios y tipos de medio.	
Columna de costos asociados con badges en la celda y un popover para ver los datos completos.	
Acciones masivas de asignación de costo.	
Asociación individual por medio.	
Poder agregar o quitar costos a un medio por checkbox en list.	
Módulo 03 — Costos en cotizador

Contexto: En el cotizador, al seleccionar un medio, específicamente en la parte de renta, se va a agregar un icono que al hacer hover muestre el listado de todos los costos asociados que incluye ese medio sin mostrar montos.
Must Have	Should Have
Un icono con hover que muestre el listado de los costos que tiene asociado el medio.	
Solo debe mostrar el nombre del costo más no cantidades.	
Banner de alertamiento al llegar a topar con el margen mínimo para la campaña.	
Modal en donde se solicite la autorización para un descuento.	
El sistema bloqueará "cerrado ganado" si no hay una autorización aceptada cuando el margen está abajo del mínimo.	
Módulo 04 — Captura de costos

Contexto: Una vez cerrada ganada la campaña, se podrá visualizar desde el módulo de captura de costos. Aparecerá la campaña con sus medios y todos los costos asociados por medio. Estos costos tendrán de inicio los máximos históricos. Se podrán modificar los costos o, en caso de que ya estén generadas las órdenes de pago de Odoo, se actualizarán los costos con los valores reales marcando claramente la diferencia. Cada medio mostrará un avance de llenado de costos y la campaña mostrará su progreso general.
Must Have	Should Have
Costos del medio precargados al agregar a campaña (renta exacta + costos con máximo histórico).	Estado de cada costo: estimado / confirmado Odoo / editado manualmente.
Vista campaña → tipo de medio → medio → listado de costos.	
Actualización automática del semáforo en pauta cuando llegan costos reales de Odoo.	
Diferenciación visual: costo Odoo (real) vs costo máximo histórico (estimado).	
Auto-actualización de costos desde OC de Odoo vía API.	
Log automático de cambios: quién, cuándo, de cuánto a cuánto, motivo.	
Edición manual de costos (solo Planes Sr y superiores).	
Posibilidad de cambio manual después de Odoo, antes de facturación.	
Módulo 05 — Vista de auditoría

Contexto: El módulo de auditoría es para que el departamento de Trade pueda hacer auditorías sobre las campañas y auditar diferentes datos, costos, etc.
Must Have	Should Have
Listado de campañas, con el listado de medios de la campaña y sus costos a vista general.	Vista agregada: comparativo de márgenes por comercial.
Vista de margen proyectado vs real por campaña.	Alerta automática cuando campaña tiene desviación de margen >10 pts.
Filtros por: comercial, período, tipo de costo, proveedor, formato/medio	Benchmark de costos por tipo/plaza/proveedor.
Historial de cambios de costos (quién, cuándo, de cuánto a cuánto).	Historial de alertas emitidas por pauta/campaña.
Diferenciación Odoo vs estimado por costo.	Alerta temprana desde etapa de pauta (dependencia de módulo de pauta).
Export a Excel/CSV de los datos filtrados.	
Modo solo lectura — sin posibilidad de edición.	
Módulo 06 — Panel de autorizaciones

Contexto: Esta será la vista en donde el gerente comercial podrá revisar sus solicitudes de autorizaciones de descuentos en campañas.
Must Have	Should Have
Botón de solicitud de autorización en cotizador cuando descuento supera límite o margen cae por debajo del mínimo efectivo del medio.	Notificación multicanal: OBP + Teams automático + correo
Panel del gerente con solicitudes pendientes.	Estado visible de solicitud en campaña del cotizador (pendiente/aprobada/rechazada).
Tarjeta de solicitud: cliente, monto, % descuento solicitado, margen resultante vs margen mínimo efectivo del medio.	
Aprobar / rechazar con campo de comentario opcional.	
Notificación al comercial del resultado.	
Historial de autorizaciones (aprobadas y rechazadas).	
Módulo 07 — Listas de Márgenes Dinámicos (con niveles)

Contexto: El objetivo de este módulo es tener dadas de alta todas las listas de márgenes con sus reglas y niveles. Cada lista tiene un % base y una tabla de ajuste por calificación del medio (1-5 estrellas). Además, cada lista puede tener niveles (ej: nivel 1, nivel 2, nivel 3) y en cada nivel se define el margen de utilidad deseado.

Nota técnica — Fórmula de cálculo: Para cada nivel de margen, el sistema calculará el Precio de Venta (PV) a partir del Costo (C) y el Margen deseado (M) expresado en decimal usando la fórmula:
PV = C / (1 - M)
Donde C es el costo total del medio (renta + costos asociados) y M es el margen de utilidad deseado en el nivel correspondiente.
Must Have	Should Have
CRUD de listas de márgenes (nombre, descripción, % base de margen, tipo de regla).	Vista comparativa entre listas activas.
CRUD de niveles dentro de cada lista (nombre del nivel, margen de utilidad deseado en %).	Historial de versiones de una lista (para auditoría retrospectiva).
Configuración de la tabla de ajuste por calificación editable (por cada nivel).	Duplicar lista existente como punto de partida para nueva configuración.
Visualización del margen mínimo efectivo por nivel + calificación.	
Log de cambios de configuración: quién modificó, cuándo, de qué valor a qué valor.	
Endpoint de recepción de costos reales desde Odoo
Contexto

Odoo genera órdenes de compra (OC) con los costos reales de los medios. El microservicio expone un endpoint específico para que Odoo envíe estos datos. Al recibir un costo real, el sistema actualiza automáticamente el margen de la campaña y el semáforo correspondiente.
Contrato del endpoint

PUT /api/v1/odoo/costos-reales

Headers:

Content-Type: application/json
X-Odoo-API-Key: <api-key-compartida>

Request body:

{
  "orden_compra_id": "string",
  "campaign_id": "uuid",
  "media_id": "uuid",
  "cost_type": "RENTA",
  "actual_amount": 15000.50,
  "currency": "MXN",
  "odoo_timestamp": "2026-05-20T10:00:00Z",
  "justification": "Costo real según OC #12345"
}

Response 200 (actualización exitosa):

{
  "status": "ok",
  "campaign_id": "uuid",
  "media_id": "uuid",
  "previous_estimated_amount": 18000.00,
  "new_actual_amount": 15000.50,
  "margin_updated": true,
  "new_margin_status": "GREEN"
}

Response 409 (campaña no encontrada):

{
  "status": "error",
  "code": "CAMPAIGN_NOT_FOUND",
  "message": "No se encontró la campaña asociada a la OC"
}

Flujo de procesamiento

flowchart TD
  A["1. Odoo genera una OC con costos reales."]
  B["2. Odoo envía el payload al endpoint /api/v1/odoo/costos-reales"]
  C["3. El microservicio valida el API key."]
  D["4. Busca el registro en campaign_media_costs"]
  E{"5. ¿Registro existe?"}
  F["6a. Actualiza actual_amount con el valor recibido."]
  G["6b. Calcula el nuevo margen y actualiza margin_status"]
  H["6c. Registra el cambio en audit_logs"]
  I["6d. Si el margen cambia de estado, dispara notificaciones"]
  J["7a. Crea un nuevo registro en campaign_media_costs"]
  K["7b. Marca odoo_sync_status = 'SYNCED'"]
  L["8. Responde con el resultado"]

  A --> B
  B --> C
  C --> D
  D --> E
  E -->|Sí| F
  F --> G
  G --> H
  H --> I
  I --> L
  E -->|No| J
  J --> K
  K --> L

Seguridad

    API Key compartida entre Odoo y el microservicio (rotación periódica).
    Validación de origen (whitelist de IPs de Odoo).
    Log de todos los intentos fallidos de sincronización.