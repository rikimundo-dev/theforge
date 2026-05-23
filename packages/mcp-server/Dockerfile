# Build stage — context = repo root (necesario para resolver @theforge/shared-types workspace)
FROM node:20-alpine AS builder

ARG BUILD_CACHE_BUST=84
RUN echo "Cache bust key: ${BUILD_CACHE_BUST}"

WORKDIR /app

RUN corepack enable

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
COPY packages/mcp-server/package.json packages/mcp-server/

RUN pnpm install --frozen-lockfile

# Copy all source code
COPY packages/shared-types packages/shared-types
COPY packages/config packages/config
COPY packages/mcp-server packages/mcp-server

# Build: compila shared-types y config primero, luego mcp-server
RUN pnpm exec turbo run build --filter=@theforge/config --filter=@theforge/shared-types --filter=@theforge/mcp-server

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Root package.json para que pnpm resuelva @theforge/*
COPY --from=builder /app/package.json ./
# node_modules raíz (hoisted; NO confiar en node_modules dentro de packages/*/)
COPY --from=builder /app/node_modules ./node_modules
# shared-types compilado (lo necesita @theforge/shared-types vía workspace symlink)
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/packages/config ./packages/config

# mcp-server compilado
COPY --from=builder /app/packages/mcp-server/dist ./dist
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/

EXPOSE 3100

CMD ["node", "dist/index.js", "--http"]
