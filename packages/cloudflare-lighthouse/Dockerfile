# Cloudflare Container image for unlighthouse Lighthouse host.
#
# Connects to Cloudflare Browser Run remotely via CDP — no Chromium in
# the image. Final size ≈ 250-300 MB.
#
# Build context: monorepo root (so we can `pnpm install` properly with
# workspace links). Wrangler's `wrangler deploy` builds + pushes this
# image automatically when `[[containers]]` is declared in wrangler.toml.

FROM node:22-alpine AS deps
WORKDIR /workspace
# Manifest layer — cached unless deps change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/cloudflare-lighthouse/package.json packages/cloudflare-lighthouse/
COPY packages/core/package.json packages/core/
COPY packages/contracts/package.json packages/contracts/
COPY packages/audit-pool/package.json packages/audit-pool/
RUN corepack enable && \
    pnpm install --frozen-lockfile --prod \
      --filter @unlighthouse/cloudflare-lighthouse...

FROM node:22-alpine AS build
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/packages/cloudflare-lighthouse/node_modules ./packages/cloudflare-lighthouse/node_modules
COPY packages/cloudflare-lighthouse/dist packages/cloudflare-lighthouse/dist
COPY packages/cloudflare-lighthouse/package.json packages/cloudflare-lighthouse/

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Only the cloudflare-lighthouse package + its deps need to land in /app.
COPY --from=build /workspace/packages/cloudflare-lighthouse ./
COPY --from=build /workspace/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/server.mjs"]
