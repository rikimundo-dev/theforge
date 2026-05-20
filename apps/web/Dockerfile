# Build stage — context = repo root
FROM node:20-alpine AS builder

ARG BUILD_CACHE_BUST=73
RUN echo "Cache bust key: ${BUILD_CACHE_BUST}"

WORKDIR /app
RUN apk add --no-cache gcompat

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

# Production stage — Nginx
FROM nginx:alpine AS runner

RUN apk add --no-cache wget

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# HEALTHCHECK desactivado: Dokploy no lo soporta correctamente
# HEALTHCHECK NONE

CMD ["nginx", "-g", "daemon off;"]
