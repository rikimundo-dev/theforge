# ========== CACHE-BUST: 2026-05-01 ==========
# ========== Build API ==========
FROM node:20-alpine AS api-builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json turbo.json .npmrc ./
COPY packages/database/package.json packages/database/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/business-rules/package.json packages/business-rules/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN npm install
COPY packages/database packages/database
COPY packages/shared-types packages/shared-types
COPY packages/business-rules packages/business-rules
COPY packages/config packages/config
COPY apps/api apps/api
COPY scripts/rotate-master-key.ts scripts/rotate-master-key.ts
ENV DATABASE_URL="postgresql://theforge:theforge@localhost:5432/theforge"
RUN npx turbo run build --filter=@theforge/database --filter=@theforge/shared-types --filter=@theforge/business-rules --filter=@theforge/api

# ========== Build Web ==========
FROM node:20-alpine AS web-builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json turbo.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/business-rules/package.json packages/business-rules/
COPY apps/web/package.json apps/web/
RUN npm install
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY packages/business-rules packages/business-rules
COPY apps/web apps/web
RUN npx turbo run build --filter=@theforge/web

# ========== Contenedor único: Postgres + API + Nginx (para Dokploy) ==========
FROM postgres:15-alpine

RUN apk add --no-cache nodejs npm nginx

ENV POSTGRES_USER=theforge
ENV POSTGRES_PASSWORD=theforge
ENV POSTGRES_DB=theforge
ENV DATABASE_URL="postgresql://theforge:theforge@localhost:5432/theforge"
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copiar app (API ya compilada + node_modules necesarios desde api-builder)
COPY --from=api-builder /app /app
COPY --from=web-builder /app/apps/web/dist /usr/share/nginx/html

# Nginx: SPA + /assets sin fallback a index.html + proxy /api -> localhost:3000
COPY docker/nginx-fullstack.conf /etc/nginx/http.d/default.conf

COPY docker/entrypoint-full.sh /entrypoint-full.sh
RUN chmod +x /entrypoint-full.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint-full.sh"]
