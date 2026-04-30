# 🔧 Reporte: Análisis de Puertos y Configuracion de Red — TheForge

## Fecha y Contexto
- **Fecha**: 2026-04-30
- **Solicitado por**: Jorge Correa (@kreodevs)
- **Motivo**: Se detectó que el MCP server y el backend podrían estar compartiendo el mismo puerto, lo cual causaría conflicto en producción con Dokploy.

---

## ✅ Veredicto: NO hay conflicto de puertos de escucha

**El problema real era mas sutil:** el MCP server escucha en el puerto correcto (`3100`), pero su **valor por defecto de `API_BASE`** —la URL a la cual se conecta internamente— apuntaba a `http://localhost:3000`. En Docker, `localhost` es el propio contenedor, no el contenedor de la API. O sea, el MCP intentaba hablar consigo mismo en vez de con la API NestJS.

---

## 📋 Tabla de Puertos por Servicio

| Servicio | Contenedor | Puerto Listen | Puerto expuesto | Protocolo |
|----------|-----------|---------------|-----------------|-----------|
| **PostgreSQL** | `theforge-db` | `5432` (interno) | Ninguno (solo red interna) | TCP |
| **Redis Queue** | `theforge-redis-queue` | `6379` (interno) | Ninguno (solo red interna) | TCP |
| **FalkorDB SDD** | `theforge-falkor-sdd` | `6379` (interno) | `6380:6379` | TCP |
| **API NestJS** | `theforge-api` | `3000` | `3000` (expose) | HTTP |
| **Web (frontend)** | `theforge-web` | `80` | `80` (nginx) | HTTP |
| **MCP Server** | `theforge-mcp` | `3100` | Ninguno (solo red interna) | HTTP |

**Routing externo (Traefik en Dokploy):**
| Ruta externa | Servicio interno |
|--------------|-----------------|
| `/` | `theforge-web:80` (statics/SPA) |
| `/api` → strip path | `theforge-api:3000` |

El MCP está en la red `dokploy-network` pero no tiene reverse proxy público — se accede solo internamente.

---

## 🚨 Problemas Encontrados y Fixes

### 1. MCP — `API_BASE` apuntando a `localhost` (CRÍTICO) ✅ CORREGIDO
**Archivo**: `packages/mcp-server/src/index.ts:29`
```diff
- const API_BASE = process.env.THEFORGE_API_URL ?? "http://localhost:3000";
+ const API_BASE = process.env.THEFORGE_API_URL ?? "http://theforge-api:3000";
```
**Efecto**: Sin este fix, si no se configuraba `THEFORGE_API_URL` como env var, el MCP intentaba llamar a sí mismo en el puerto 3000 del contenedor MCP, donde no hay nada. La llamada fallaba silenciosamente con timeout.

### 2. MCP — `.env.example` con API_URL comentada (ALTO) ✅ CORREGIDO
**Archivo**: `.env.example:133`
```diff
- # THEFORGE_API_URL=http://localhost:3000
+ THEFORGE_API_URL=http://theforge-api:3000
```
**Efecto**: El ejemplo de env no activaba la variable, dejando caer al default erroneo de `localhost:3000`.

### 3. Documentacion desactualizada (MEDIO) ⚠️ PENDIENTE DE REVISAR
Varios archivos de documentacion siguen mencionando `localhost:3000` como default:
- `docs/notebooklm/THEFORGE-MCP-SERVER.md:17` — dice default `localhost:3000`
- `docs/notebooklm/THEFORGE-MCP-SERVER.md:67` — ejemplo de export `localhost:3000`
- `docs/notebooklm/integracion-theforge/Llamadas-HTTPS-MCP-AriadneSpecs.md:67` — referencia legacy
- `packages/mcp-server/src/mcp-tools.doc.ts:4` — JSDoc con default incorrecto
- `README.md:30` — `http://localhost:3000` (esto es **para desarrollo local**, está OK)

**Nota**: Algunos son válidos para desarrollo local, pero otros (especialmente `mcp-tools.doc.ts` y los docs de producción) deberian actualizarse para evitar confusion.

### 4. Docker Compose — MCP no tiene `ports` ni dependencias (BAJO) ℹ️ INFORMATIVO
El servicio `theforge-mcp` en `docker-compose.yml` no tiene:
- `ports:` mapeados (correcto — es servicio interno)
- `depends_on: theforge-api` (deberia tenerlo para asegurar orden de arranque)
- `expose:` (podria agregarlo para documentación)

**Recomendacion**: Agregar `depends_on` al MCP para que espere a que la API esté lista.

---

## ✅ Flujo de Comunicaciones Final (Corregido)

```
                    Traefik (Dokploy)
                   /                 \
                  /                   \
            / → web:80          /api → api:3000
              (SPA static)       (NestJS API)
                                     ↑
                                     │ THEFORGE_API_URL
                                     │ http://theforge-api:3000
                                     │
                              mcp:3100 (MCP Server)
```

**Comunicaciones internas correctas:**
- `mcp → api`: `THEFORGE_API_URL=http://theforge-api:3000` ✅
- `api → db`: `DATABASE_URL=postgresql://theforge@theforge-db:5432` ✅
- `api → redis`: `REDIS_URL=redis://theforge-redis-queue:6379` ✅
- `api → falkor`: `FALKORDB_SDD_URL=redis://theforge-falkor-sdd:6379` ✅
- `web → api`: Traefik rutea `/api` (ya no necesita proxy local) ✅

---

## 📦 Checklist de Verificacion para Dokploy

- [x] MCP `API_BASE` apunta a `http://theforge-api:3000` (no `localhost`)
- [x] `THEFORGE_API_URL` descomentado y activo en `.env.example`
- [ ] Agregar `depends_on: theforge-api` al servicio `theforge-mcp` en docker-compose.yml
- [ ] Actualizar JSDoc `mcp-tools.doc.ts` con el nuevo default
- [ ] Revisar docs de `notebooklm/` si son relevantes para producción
- [ ] Verificar que `MCP_M2M_SECRET` esté configurado en Dokploy (requerido para auth)
- [ ] Verificar que `THEFORGE_MCP_URL` esté en env del servicio API (la API necesita saber dónde está el MCP)

---

## 🔍 Archivos Modificados

| Archivo | Línea | Cambio |
|---------|-------|--------|
| `packages/mcp-server/src/index.ts` | 29 | Default `API_BASE`: `localhost:3000` → `theforge-api:3000` |
| `.env.example` | 133 | `THEFORGE_API_URL` descomentado con valor correcto |

---

## 💡 Lecciones Aprendidas

1. **No confundir puerto de escucha con URL de conexión** — El MCP escucha en `3100` pero intentaba conectar a la API en `localhost:3000`. Son cosas diferentes.
2. **En Docker, `localhost` = propio contenedor** — Si el servicio A necesita hablar con B, usar nombres de red de Docker (`theforge-api`), no `localhost`.
3. **Los defaults en código son la fuente silenciosa de bugs de infra** — Parece inocente, pero sin la env var definida, todo colapsa silenciosamente.
