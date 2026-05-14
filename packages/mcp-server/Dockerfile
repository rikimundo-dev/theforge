# Build stage — context = packages/mcp-server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only what we need
COPY package.json tsconfig.json ./
COPY src ./src

# Install deps and build
RUN npm install
RUN npx tsc

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3100

CMD ["node", "dist/index.js", "--http"]
