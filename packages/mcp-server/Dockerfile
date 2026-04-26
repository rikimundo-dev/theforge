# Build stage — context = repo root
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY packages/mcp-server/package.json packages/mcp-server/

# Install only mcp-server deps
RUN pnpm install --filter @theforge/mcp-server

# Copy source
COPY packages/mcp-server packages/mcp-server

# Build
RUN pnpm run build --filter=@theforge/mcp-server

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3100

# Copy mcp-server build + node_modules
COPY --from=builder /app/packages/mcp-server /app/packages/mcp-server
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/mcp-server/node_modules /app/packages/mcp-server/node_modules

EXPOSE 3100

CMD ["node", "--experimental-network-imports", "packages/mcp-server/dist/index.js", "--http"]
