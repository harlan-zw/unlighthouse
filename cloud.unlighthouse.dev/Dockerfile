# Dockerfile for production deployment
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Build stage
FROM base AS build

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build application
RUN pnpm build

# Production stage
FROM base AS production

WORKDIR /app

# Copy built application
COPY --from=build /app/.output /app/.output
COPY --from=build /app/package.json /app/package.json

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R node:node /app/data

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV DATABASE_DIR=/app/data
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", ".output/server/index.mjs"]
