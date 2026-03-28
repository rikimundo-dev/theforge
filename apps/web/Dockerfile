# Build stage — context = repo root
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

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

# Production stage — Nginx
FROM nginx:alpine AS runner

RUN apk add --no-cache wget

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=2s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
