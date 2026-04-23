# Módulo Scraper (Paso 0)

Scraping de URLs para Fase 0 (Benchmark & Gap Analysis): detección de URLs, descarga con `fetch`, extracción con Cheerio y conversión a markdown.

- **constants.ts** — Límites (MAX_URLS, TIMEOUT_MS, MAX_BODY_KB) y User-Agent.
- **url-utils.ts** — Extracción y normalización de URLs desde texto o array; `resolveUrls(explicitUrls, text)`.
- **html-to-markdown.ts** — Conversión de fragmento HTML a markdown (h1–h6, p, listas, enlaces, pre/code).
- **scraper.service.ts** — `scrapeUrls(urls): Promise<ScrapedPage[]>`; usa Cheerio para extraer contenido de body/article/main.
- **scraper.module.ts** — Exporta `ScraperService` para uso en `ProjectsModule`.

Ver `docs/notebooklm/PLAN-FASE0-SCRAPING-DEEP-RESEARCH.md`.
