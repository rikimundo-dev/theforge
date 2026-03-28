# ========== Build API ==========
FROM node:20-alpine AS api-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/database/package.json packages/database/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/business-rules/package.json packages/business-rules/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN pnpm install
COPY packages/database packages/database
COPY packages/shared-types packages/shared-types
COPY packages/business-rules packages/business-rules
COPY packages/config packages/config
COPY apps/api apps/api
ENV DATABASE_URL="postgresql://theforge:theforge@localhost:5432/theforge"
RUN pnpm run build --filter=@theforge/database --filter=@theforge/shared-types --filter=@theforge/business-rules --filter=@theforge/api

# ========== Build Web ==========
FROM node:20-alpine AS web-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
ENV PNPM_HOME="/pnpm" PATH="$PNPM_HOME:$PATH"
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/business-rules/package.json packages/business-rules/
COPY apps/web/package.json apps/web/
RUN pnpm install
COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY packages/business-rules packages/business-rules
COPY apps/web apps/web
RUN pnpm run build --filter=@theforge/web

# ========== Contenedor único: Postgres + API + Nginx (para Dokploy) ==========
FROM postgres:15-alpine

RUN apk add --no-cache nodejs npm nginx

# Node 20 (Alpine tiene versión antigua)
RUN apk add --no-cache nodejs-current 2>/dev/null || true
RUN corepack enable 2>/dev/null && corepack prepare pnpm@9.14.2 --activate 2>/dev/null || npm install -g pnpm 2>/dev/null || true

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

# Nginx: SPA + proxy /api -> localhost:3000
RUN echo 'server{listen 80;root /usr/share/nginx/html;index index.html;location /{try_files $uri $uri/ /index.html;}location /api/{proxy_pass http://127.0.0.1:3000/;proxy_http_version 1.1;proxy_set_header Host $host;proxy_set_header X-Real-IP $remote_addr;}}' > /etc/nginx/http.d/default.conf

COPY docker/entrypoint-full.sh /entrypoint-full.sh
RUN chmod +x /entrypoint-full.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint-full.sh"]
