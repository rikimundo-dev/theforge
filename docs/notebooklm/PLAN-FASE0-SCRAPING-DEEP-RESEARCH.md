# Plan: Fase 0 — URLs, Scraping (Cheerio), Markdown y Deep Research

**Objetivo:** En Paso 0 (Benchmark & Gap Analysis), permitir que el usuario pase una o más URLs; detectarlas, hacer scraping, convertir a markdown, usar esa información en lo solicitado y realizar deep research con el LLM para emitir un documento de resumen en markdown.

**Fuera de alcance (para más adelante, no decidido):** integración con Backstage.

---

## 1. Alcance por capas

| Capa                          | Responsabilidad                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **URL detection**             | Extraer URLs del input (idea del usuario y/o campo `urls`) y normalizarlas.                                                                       |
| **Scraping**                  | Descargar HTML por URL, extraer contenido semántico (títulos, párrafos, listas).                                                                  |
| **HTML → Markdown**           | Convertir el contenido extraído a markdown para uso posterior.                                                                                    |
| **Integración con Benchmark** | Pasar el markdown scrapeado + idea al flujo actual de DBGA.                                                                                       |
| **Deep research (LLM)**       | A partir de la petición del usuario y del contenido scrapeado, hacer “investigación profunda” y producir un **documento de resumen** en markdown. |

---

## 2. Dependencias

- **cheerio** — parseo HTML y extracción de nodos (sin headless).
- **turndown** (opcional) — HTML → Markdown de calidad. Alternativa: reglas propias con Cheerio (solo h1–h6, p, ul, ol, pre, a) para mantener el plan simple y sin deps extra al inicio.
- **fetch** nativo (Node 18+) para GET; timeout y límite de tamaño en el servicio.

No añadir Puppeteer/Playwright en esta fase (YAGNI).

---

## 3. Detección de URLs

**Ubicación:** Utilidad reutilizable, p.ej. `apps/api/src/modules/scraper/url-utils.ts` (o dentro del mismo módulo scraper).

- **Input:** string (idea del usuario) y/o array `urls` del body.
- **Lógica:**
  - Regex para `https?://[^\s<>"']+` (o librería tipo `get-urls` si se añade).
  - Normalizar: trim, quitar fragmento `#...` si no se quiere para scraping.
  - Validar esquema `http` | `https` y longitud razonable.
  - Límite configurable (ej. máx. 5–10 URLs por petición) para evitar abuso y tiempo de respuesta.
- **Salida:** `string[]` únicas y válidas.

Si el controller recibe `urls?: string[]`, usarlas como fuente principal; si no, extraer solo del texto de `userIdea`.

---

## 4. Módulo Scraper (Cheerio + HTML → Markdown)

**Módulo nuevo:** `apps/api/src/modules/scraper/`

### 4.1 Estructura propuesta

```
scraper/
  scraper.module.ts
  scraper.service.ts     # fetch + Cheerio + extracción
  html-to-markdown.ts   # conversión HTML → markdown (reglas simples)
  url-utils.ts          # detección y normalización de URLs
  constants.ts          # MAX_URLS, TIMEOUT_MS, MAX_BODY_KB
```

### 4.2 ScraperService

- **Método:** `scrapeUrls(urls: string[]): Promise<ScrapedPage[]>`.
- Por cada URL:
  - `fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })`.
  - Leer body hasta `MAX_BODY_KB` (evitar páginas gigantes).
  - Parsear con Cheerio; extraer en orden: `h1–h6`, `p`, `ul/ol`, `pre`, `article`, `main`; quitar `script`, `style`, `nav` agresivo.
  - Pasar el HTML extraído a `htmlToMarkdown(html)`.
- **Tipos:** `ScrapedPage = { url: string; markdown: string; error?: string }`. Si una URL falla (timeout, 403, etc.), devolver `{ url, markdown: '', error }` y no romper el flujo.
- **Headers:** User-Agent razonable (ej. "TheForge-Scraper/1.0") para no ser bloqueado por algunos sitios.

### 4.3 html-to-markdown

- Entrada: string HTML (fragmento ya limpiado por Cheerio).
- Reglas mínimas: `h1`→`# `, `h2`→`## `, …; `p`→ párrafo; `ul/ol`→ listas; `a`→ `[text](href)`; `pre`/`code` preservar.
- Salida: string en markdown. No es necesario cubrir todos los elementos HTML; priorizar lo que aporta al benchmark y al resumen (texto, listas, encabezados).

---

## 5. Integración con generate-benchmark (Paso 0)

**Archivos a tocar:**

- **Controller:** `apps/api/src/modules/projects/projects.controller.ts`
  - Body: `{ userIdea?: string; urls?: string[] }`.
  - Si hay `urls`, pasarlas a ProjectsService; si no, extraer URLs de `userIdea` con `url-utils` y pasarlas también (opcional: solo si se quiere detección automática).

- **ProjectsService:** `apps/api/src/modules/projects/projects.service.ts`
  - `generateBenchmark(projectId: string, userIdea: string, urls?: string[])`.
  - Si hay URLs: llamar a `ScraperService.scrapeUrls(urls)` → obtener `ScrapedPage[]`.
  - Construir string de contexto: por cada página, bloque tipo `## Referencia: <url>\n\n<markdown>\n\n`.
  - Llamar a `DiscoveryService.generateBenchmark(userIdea, scrapedContext?)`.

- **DiscoveryService:** `apps/api/src/modules/ai/discovery.service.ts`
  - Firma: `generateBenchmark(userIdea: string, scrapedContext?: string): Promise<string>`.
  - Si hay `scrapedContext`, añadirlo al prompt: "Contenido obtenido de las referencias (URLs) proporcionadas:\n---\n{scrapedContext}\n---\nÚsalo para enriquecer el Benchmark (líderes, estándares, checklist, brechas).".

- **Prompt:** `apps/api/src/modules/ai/prompts/discovery-benchmark-prompt.md`
  - Añadir instrucción: cuando se proporcione contenido de referencias (URLs), usarlo como fuente para Referencia de Industria, Checklist y Gap Detection; citar o resumir, no copiar literalmente.

Con esto, lo que el usuario pide en fase 0 (idea + URLs) se trabaja con el contenido scrapeado convertido a markdown y se usa en el DBGA actual.

---

## 6. Deep Research y documento de resumen en Markdown

**Objetivo:** A partir de la petición del usuario en fase 0 y del contenido scrapeado (y opcionalmente del DBGA ya generado), que el LLM haga “deep research” y emita un **documento de resumen** en markdown.

### 6.1 Opciones de diseño

- **A) Dentro del mismo flujo de generate-benchmark:** Tras generar el DBGA, una segunda llamada al LLM con prompt “Deep Research”: inputs = idea + scraped markdown (+ DBGA recién generado); output = documento de resumen en markdown. Ese resumen se podría guardar en un nuevo campo (ej. `Project.phase0SummaryContent` o reutilizar/ampliar algo existente).
- **B) Endpoint separado:** `POST /projects/:id/phase0-deep-research` con body `{ userIdea?, urls?, includeBenchmark?: boolean }`. El backend hace scraping (si hay URLs), luego una sola llamada “deep research” al LLM y devuelve (y opcionalmente persiste) el documento de resumen.

Recomendación inicial: **B** (endpoint separado) para no alargar el tiempo de `generate-benchmark` y permitir que el usuario decida cuándo lanzar el deep research (por ejemplo, después de revisar el benchmark).

### 6.2 Contenido del “Deep Research”

- Entrada al LLM: idea del usuario + (opcional) URLs ya scrapeadas en markdown + (opcional) DBGA actual.
- Prompt: instruir al modelo a actuar como investigador: sintetizar hallazgos, comparar con estándares, riesgos, oportunidades y generar un **documento de resumen** en markdown (secciones sugeridas: Resumen ejecutivo, Hallazgos clave, Referencias utilizadas, Recomendaciones, Riesgos/consideraciones).
- Salida: string markdown. Persistir en `Project.phase0SummaryContent` (nuevo campo en Prisma) o en un campo existente si se prefiere no ampliar el schema aún (por ejemplo guardar en `dbgaContent` como segundo documento; no recomendado para no mezclar).

### 6.3 Schema y API

- **Prisma:** Añadir `phase0SummaryContent String? @db.Text` a `Project` (migración).
- **shared-types:** DTO para body de deep-research (userIdea, urls, includeBenchmark).
- **Controller:** `POST /projects/:id/phase0-deep-research` → ProjectsService o un Phase0DeepResearchService.
- **Servicio:** Orquestar: detección de URLs → scraping → markdown; luego `AiService.generateResponse` con un prompt dedicado (cargado desde `prompts/phase0-deep-research-prompt.md`). Escribir resultado en `Project.phase0SummaryContent`.

---

## 7. Flujo de datos resumido

```
Usuario (Paso 0)
  │
  ├─ idea (texto) + opcionalmente urls[]
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1) Detección URLs (userIdea y/o body.urls) → url[]               │
│ 2) ScraperService.scrapeUrls(urls) → ScrapedPage[] (markdown)    │
│ 3) generate-benchmark: DiscoveryService.generateBenchmark(      │
│      userIdea, scrapedContext ) → dbgaContent                     │
│ 4) (Opcional) phase0-deep-research:                              │
│      idea + scraped markdown + [dbgaContent] → LLM               │
│      → phase0SummaryContent (documento resumen markdown)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Orden de implementación sugerido

1. **URL utils** — `url-utils.ts` + tests opcionales (extracción, límite, validación).
2. **Scraper** — `ScraperService` + `html-to-markdown.ts`, constants; inyectar en un `ScraperModule`.
3. **Integración benchmark** — Controller/ProjectsService/DiscoveryService + prompt; body con `urls` opcional y uso de contexto scrapeado en el DBGA.
4. **Deep research** — Prompt `phase0-deep-research-prompt.md`, servicio (o método en ProjectsService), nuevo endpoint; campo `phase0SummaryContent` en Prisma y DTO en shared-types.
5. **Frontend (Paso 0)** — Campo opcional “Referencias (URLs)” y/o detección en el texto; botón/acción “Generar Deep Research” que llame a `phase0-deep-research` y muestre el resumen (vista o descarga markdown).

---

## 9. Consideraciones

- **Timeouts y límites:** Por URL ej. 10 s, 512 KB de body; máx. 5 URLs por request para no bloquear.
- **Errores:** Si todas las URLs fallan, seguir con solo `userIdea` en benchmark y deep research; log de fallos.
- **Seguridad:** Validar esquema y host; no seguir redirects a file:// o a IPs privadas si se permite redirect (o desactivar redirect por defecto y solo permitir mismo host).
- **Legal/ToS:** Uso interno; no redistribuir contenido crudo; documentar en README o términos.

Con este plan se cubre: Cheerio, detección de URLs, scraping, conversión a markdown, uso en lo solicitado en fase 0 y deep research con LLM con documento de resumen en markdown.

---

*Corpus «The Forge - by Kreo» — NotebookLM sync 2026-05-22 (pnpm). Rutas relativas al monorepo `theforge`.*
