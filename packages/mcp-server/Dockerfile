# Build stage — context = repo root (necesario para resolver @theforge/shared-types workspace)
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS builder

ARG BUILD_CACHE_BUST=93
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

# Production stage — copia COMPLETA del builder (pnpm necesita 
# node_modules hoisted con estructura de workspaces intacta)
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app .

EXPOSE 3000

CMD ["node", "packages/mcp-server/dist/index.js", "--http"]
