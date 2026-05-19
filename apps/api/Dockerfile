# Build stage — context = repo root
FROM node:20-alpine AS builder

ARG BUILD_CACHE_BUST=54
RUN echo "Cache bust key: ${BUILD_CACHE_BUST}"

RUN apk add --no-cache gcompat openssl

WORKDIR /app

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

ENV DATABASE_URL="postgresql://local:local@db:5432/theforge"
RUN npx turbo run build --filter=@theforge/database --filter=@theforge/shared-types --filter=@theforge/business-rules --filter=@theforge/api

# Production stage — layout npm workspaces desde builder
FROM node:20-alpine AS runner

RUN apk add --no-cache wget openssl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app .
COPY apps/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# entrypoint: wait DB → prisma migrate deploy → node (no sobrescribir CMD en Dokploy)

WORKDIR /app/apps/api

EXPOSE 3000

# HEALTHCHECK desactivado: Dokploy no lo soporta correctamente
# HEALTHCHECK NONE

ENTRYPOINT ["/entrypoint.sh"]
