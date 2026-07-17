# Container image for the Unlighthouse Lighthouse audit host.
#
# Connects to an externally managed Chrome instance via CDP — no Chromium in
# the image. The Cloudflare preset supplies Browser Run's endpoint and token.
#
# Build context is this directory (the Dockerfile's parent). Wrangler
# builds + pushes the image automatically when `[[containers]]` is
# declared in wrangler.toml.
#
# This image is intentionally self-contained — it does NOT participate
# in the monorepo's pnpm workspace at runtime. The pre-built `dist/`
# artefacts (workspace deps already bundled or externalized per
# build.config.ts) are copied in, and a minimal package.json carrying
# only the external runtime deps (`lighthouse`, `puppeteer-core`, `h3`, plus
# their transitive dependencies) is used to `npm install` them
# fresh inside the image.
#
# Workspace deps (`@unlighthouse/contracts`, `@unlighthouse/core`) are
# also copied in as tarballs and installed by file path — see the
# pre-build step in `scripts/prepare-image.mjs` (run by `pnpm build`).

# node-slim (debian) instead of node-alpine — the alpine variant uses
# musl libc and we suspected a libc-related listener issue inside the
# Cloudflare Container runtime (local docker run worked because of
# emulation, prod runs native amd64 and exposed the problem).
FROM node:24-slim AS deps
WORKDIR /app
ENV NODE_ENV=production

# Artefacts built by `pnpm -F @unlighthouse/lighthouse-container build:image`
# (and the pre-build step that vendors workspace deps).
COPY dist ./dist
COPY package.runtime.json ./package.json
COPY vendor ./vendor

# Install Lighthouse + puppeteer-core + h3 + workspace tarballs.
# `--omit=dev` keeps the layer small; `--no-package-lock` because we don't
# ship a lockfile (lockfile lives in the monorepo and isn't valid for the
# stripped-down image manifest).
RUN npm install --omit=dev --omit=optional --no-package-lock --no-audit --no-fund

# Final stage — same slim base, just the install artefacts. No build
# tools, no apk/apt cache.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app /app

EXPOSE 8080

# Shell-form CMD so node runs under sh (PID 1 = sh, not node). Cloudflare's
# Container launcher seems to need PID 1 to be a shell-like process — direct
# `["node", "dist/entry.mjs"]` doesn't get its port-ready signal picked up
# by the launcher's TCP probe. Verified empirically: shell-wrap → "Port 8080
# is ready" in the DO logs; exec-form node → "container is not listening".
CMD ["sh", "-c", "exec node dist/entry.mjs"]
