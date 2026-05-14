<div align="center">
  <img src="docs/assets/theforge-logo.png" alt="TheForge" width="128" height="128" />
  <h3>TheForge</h3>
  <p>Monorepo NestJS + React (Vite) + Prisma con motor LLM, semáforo MDD y estimación MXN.<br/>Despliegue Dokploy-ready con Docker.</p>
</div>

<div align="center">

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat&colorA=0a0a0a)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-0a0a0a.svg?style=flat&colorA=0a0a0a)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/%E2%9C%88-TypeScript-0a0a0a.svg?style=flat&colorA=0a0a0a)](https://www.typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/%E2%9C%94-PRs%20Welcome-0a0a0a.svg?style=flat&colorA=0a0a0a)](./CONTRIBUTING.md)

</div>

<br/>

> **TheForge** es un motor de estimación y documentación para proyectos de software. Analiza codebases con LLM vía OpenRouter, genera MDD con semáforo de complejidad y produce entregables estructurados — todo en MXN.

<br/>

<div align="center">

**[Arquitectura](./docs/notebooklm/THEFORGE-INDEX.md)** · **[Blueprint](./blueprint.md)** · **[Contribuir](./CONTRIBUTING.md)** · **[Changelog](./CHANGELOG.md)**

</div>

<br/>

---

## Estructura del Monorepo

```
theforge/
├── apps/
│   ├── api/          — NestJS: proyectos, sesiones, AI (OpenRouter), engine
│   └── web/          — React (Vite) + Tailwind
├── packages/
│   ├── database/     — Prisma schema y client
│   ├── shared-types/ — DTOs e interfaces (Zod)
│   └── config/       — TS, ESLint, Tailwind base
└── docker/
```

---

## Desarrollo

Clona el repositorio e instala dependencias:

```bash
git clone https://github.com/kreodevs/theforge.git
cd theforge
npm install
```

Configura la base de datos:

```bash
# Renombra .env.example a .env y ajusta DATABASE_URL
npm run db:generate
npm run db:push
npm run dev
```

| Servicio | URL                     |
|----------|-------------------------|
| API      | http://localhost:3000   |
| Web      | http://localhost:5173   |

---

## Docker (Dokploy)

Un solo contenedor con Postgres + API + Web (Nginx):

```bash
docker compose up --build
```

- **Puerto:** `80` — Web + proxy `/api` → API
- **Volumen:** `theforge_db_data`
- **Conexión interna:** `postgresql://theforge:theforge@localhost:5432/theforge`

> Variables obligatorias en producción: `JWT_SECRET`, `DATABASE_URL`, `OPENROUTER_API_KEY`, `SMTP_HOST/USER/PASS` y `CORS_ORIGINS`. Todo lo demás tiene defaults funcionales. Ver referencia completa en [`.env.example`](./.env.example).

---

## Variables de Entorno

<details>
<summary><b>Core</b></summary>

| Variable | Default | Qué hace |
|---|---|---|
| `NODE_ENV` | `development` | Modo Node/Nest |
| `PORT` | `3000` | Puerto HTTP del API |
| `DATABASE_URL` | — | PostgreSQL (Prisma) |
| `JWT_SECRET` | — | **Obligatorio en prod.** Firma JWT |
| `JWT_EXPIRES_IN` | `7d` | Caducidad del token |
| `CORS_ORIGINS` | — | Orígenes CORS permitidos |

</details>

<details>
<summary><b>OpenRouter / LLM</b></summary>

| Variable | Default | Qué hace |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Clave principal |
| `OPENROUTER_CHAT_MODEL` | `nousresearch/hermes-3-llama-3.1-405b` | Modelo de chat |
| `OPENROUTER_EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Modelo de embeddings |
| `TAVILY_API_KEY` | — | Búsqueda web Scout (opcional) |

</details>

<details>
<summary><b>MCP AriadneSpecs, Cache, FalkorDB, Deliverables y más</b></summary>

Ver referencia completa en [`.env.example`](./.env.example).

</details>

---

## Documentación

- [CONTRIBUTING.md](./CONTRIBUTING.md) — Guía de contribución, PRs y tests
- [docs/JSDOC.md](./docs/JSDOC.md) — Convenciones de documentación
- [Índice de arquitectura](./docs/notebooklm/THEFORGE-INDEX.md)
- [Blueprint](./blueprint.md) · [MDD](./mdd.md)

---

## Contribución

- Reporta bugs o propone features en [Issues](https://github.com/kreodevs/theforge/issues)
- Abre un PR siguiendo la guía en [CONTRIBUTING.md](./CONTRIBUTING.md)
- Comparte el proyecto si te ha sido útil

## Gracias a todos los colaboradores ❤

[![Contributors](https://contrib.rocks/image?repo=kreodevs/theforge)](https://github.com/kreodevs/theforge/graphs/contributors)

---

**Licencia:** [Apache License 2.0](./LICENSE) · **Aviso:** [NOTICE](./NOTICE) · **Autores:** [AUTHORS.md](./AUTHORS.md)