# Build stage — context = repo root
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS builder

ARG BUILD_CACHE_BUST=93
RUN echo "Cache bust key: ${BUILD_CACHE_BUST}"

WORKDIR /app
RUN apk add --no-cache gcompat

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/business-rules/package.json packages/business-rules/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/config packages/config
COPY packages/shared-types packages/shared-types
COPY packages/business-rules packages/business-rules
COPY apps/web apps/web

RUN pnpm exec turbo run build --filter=@theforge/web

# Production stage — Nginx
ARG NGINX_IMAGE=public.ecr.aws/docker/library/nginx:alpine
FROM ${NGINX_IMAGE} AS runner

RUN apk add --no-cache wget

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Healthcheck en docker-compose.yml (wget → http://theforge-web:80/). No usar 127.0.0.1 en Dokploy UI.

CMD ["nginx", "-g", "daemon off;"]
