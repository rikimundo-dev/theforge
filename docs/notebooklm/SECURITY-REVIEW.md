# Revisión de seguridad — TheForge

**Fecha:** 2025-01-29 · **Nota 2026:** Los hallazgos siguen siendo útiles como lista de verificación; valida en código si ya hay SSO/guards (p. ej. variables `SSO_*` en `.env.example`) antes de asumir que C1 sigue igual.

**Alcance:** API NestJS, web Vite/React, módulos ai-analysis, scraper, sesiones, proyectos.

---

## 1. Resumen ejecutivo

| Severidad | Cantidad | Riesgo global                                             |
| --------- | -------- | --------------------------------------------------------- |
| Crítica   | 1        | **Alto** — API sin autenticación ni autorización          |
| Alta      | 2        | CORS abierto; dependencia glob (dev)                      |
| Media     | 2        | Posible SSRF en scraper; exposición de datos por proyecto |
| Baja      | 2        | tmp (dev); secretos solo en env                           |

**Conclusión:** El proyecto está bien en validación de entradas (Zod), uso de Prisma (sin SQL crudo) y gestión de secretos (.env en .gitignore). El riesgo principal es que **toda la API es pública**: cualquiera puede listar, ver, editar y borrar proyectos y sesiones si conoce o adivina los IDs.

---

## 2. Hallazgos

### Crítico

#### C1. Sin autenticación ni autorización

- **Dónde:** Toda la API (projects, sessions, ai-orchestrator, ai-analysis).
- **Qué pasa:** No hay login, JWT ni guards. Cualquiera puede:
  - `GET /projects` — listar todos los proyectos.
  - `GET /projects/:id`, `PATCH /projects/:id`, `DELETE /projects/:id` — ver/editar/borrar cualquier proyecto.
  - `POST /ai-orchestrator/chat`, `welcome`, `clear-chat` — usar chat y sesiones de cualquier proyecto.
  - `POST /ai-analysis/stream`, `start` — lanzar análisis con cualquier `projectId`.
- **Remedación:** Añadir autenticación (JWT, sesiones, OAuth, etc.) y autorización por recurso (p. ej. que el usuario solo acceda a sus proyectos/sesiones). Guards en controladores o a nivel global.

---

### Alto

#### A1. CORS con `origin: true`

- **Dónde:** `apps/api/src/main.ts`: `app.enableCors({ origin: true })`.
- **Qué pasa:** Cualquier origen puede llamar al API desde el navegador.
- **Remedación:** En producción restringir a orígenes conocidos, p. ej. `origin: process.env.CORS_ORIGINS?.split(',') ?? false`.

#### A2. Dependencia `glob` vulnerable (solo dev)

- **Dónde:** `apps/api > @nestjs/cli > glob@10.4.5` (cadena de dev).
- **Problema:** CVE-2025-64756 — inyección de comandos en la **CLI** de glob (`-c/--cmd`). La librería usada por Nest/otros no está afectada.
- **Impacto:** Bajo en runtime (no se usa la CLI en producción). Riesgo en máquinas de desarrollo si se ejecuta la CLI de glob sobre contenido no confiable.
- **Remedación:** Actualizar `@nestjs/cli` cuando incluya `glob@>=10.5.0` o, si aplica, fijar resolución de `glob` a versión parcheada.

---

### Medio

#### M1. Posible SSRF en scraper

- **Dónde:** `apps/api/src/modules/ai-analysis/tools/scrape-cheerio.tool.ts` y flujo que construye la URL (p. ej. desde idea/urls o desde el LLM).
- **Qué pasa:** El servidor hace `fetch(url)`. Si la URL apunta a red interna (p. ej. `http://169.254.169.254/`, `http://localhost:6379`), se puede filtrar información o atacar servicios internos.
- **Mitigación actual:** Validación de esquema (solo `http`/`https`) y longitud en `url-utils`; no se valida contra IPs privadas/localhost.
- **Remedación:** Rechazar URLs que resuelvan a localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 169.254.0.0/16, 192.168.0.0/16 (o usar lista de bloqueo/allowlist según diseño). Resolver DNS y comprobar la IP antes de hacer el fetch.

#### M2. Datos sensibles por proyecto sin control de acceso

- **Dónde:** Proyectos y sesiones contienen MDD, benchmark, chat, preferencias.
- **Qué pasa:** Sin autorización, quien tenga el ID puede leer o modificar todo el contenido del proyecto.
- **Remedación:** Inextricable de C1: hace falta modelo de usuarios/roles y comprobar que el usuario autenticado tenga permiso sobre el `projectId` (y `sessionId`) en cada endpoint.

---

### Bajo

#### B1. Dependencia `tmp` (dev)

- **Dónde:** Transitiva vía `@nestjs/cli > inquirer > external-editor > tmp@0.0.33`.
- **Problema:** CVE-2025-54798 — escritura de ficheros temporales fuera del tmpdir vía symlinks (severidad baja).
- **Impacto:** Solo en entorno de desarrollo/build, no en API en producción.
- **Remedación:** Seguir actualizaciones de Nest CLI; cuando el árbol use `tmp@>=0.2.4`, el aviso debería resolverse.

#### B2. Secretos y env

- **Estado:** Correcto. `.env` está en `.gitignore`; `.env.example` no contiene valores reales; claves (OPENAI, TAVILY, etc.) se leen de `process.env`.
- **Recomendación:** No subir nunca `.env` ni volcados con secretos; en producción usar variables de entorno o un vault.

---

## 3. Lo que está bien

- **Validación de entrada:** Zod en controllers/servicios (`createProjectSchema`, `updateProjectSchema`, `appendChatSchema`, etc.).
- **Base de datos:** Prisma sin `$executeRawUnsafe`; consultas parametrizadas; bajo riesgo de inyección SQL.
- **URLs:** Validación de esquema (http/https) y longitud; límite de URLs por petición (`MAX_URLS`).
- **Frontend:** No se encontró `dangerouslySetInnerHTML`, `eval` ni patrones típicos de XSS en el código revisado.
- **Consistencia sesión–proyecto:** En ai-orchestrator se comprueba `session.projectId === projectId` cuando se pasa `sessionId`.
- **Timeouts y límites:** Scraper con timeout y límite de tamaño de body.

---

## 4. Recomendaciones prioritarias

1. **Implementar autenticación y autorización** (mitiga C1 y M2).
2. **Restringir CORS en producción** (mitiga A1).
3. **Bloquear IPs privadas/localhost en el scraper** (mitiga M1).
4. **Actualizar dependencias** cuando haya parches para glob/tmp en el árbol de Nest (reduce A2 y B1).

---

## 5. Referencias

- OWASP Top 10
- CWE-59 (Improper Link Resolution), CWE-78 (OS Command Injection), CWE-918 (SSRF)
- CVE-2025-54798 (tmp), CVE-2025-64756 (glob CLI)
