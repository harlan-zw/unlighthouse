# Cloudflare Container image for the unlighthouse Lighthouse host.
#
# Connects to Cloudflare Browser Run remotely via CDP — no Chromium in
# the image. Final size ≈ 250-300 MB.
#
# Build context is this directory (the Dockerfile's parent). Wrangler
# builds + pushes the image automatically when `[[containers]]` is
# declared in wrangler.toml.
#
# This image is intentionally self-contained — it does NOT participate
# in the monorepo's pnpm workspace at runtime. The pre-built `dist/`
# artefacts (workspace deps already bundled or externalized per
# build.config.ts) are copied in, and a minimal package.json carrying
# only the external runtime deps (`lighthouse`, `puppeteer-core`,
# `ofetch`, `h3`, plus their transitive) is used to `npm install` them
# fresh inside the image.
#
# Workspace deps (`@unlighthouse/contracts`, `@unlighthouse/core`) are
# also copied in as tarballs and installed by file path — see the
# pre-build step in `scripts/prepare-image.mjs` (run by `pnpm build`).

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Artefacts published by `pnpm -F @unlighthouse/cloudflare-lighthouse build`
# (and the pre-build step that vendors workspace deps).
COPY dist ./dist
COPY package.runtime.json ./package.json
COPY vendor ./vendor

# Install Lighthouse + puppeteer-core + ofetch + h3 + workspace tarballs.
# `--omit=dev` keeps the layer small; `--no-package-lock` because we don't
# ship a lockfile (lockfile lives in the monorepo and isn't valid for the
# stripped-down image manifest).
RUN npm install --omit=dev --omit=optional --no-package-lock --no-audit --no-fund

EXPOSE 8080
# Split node + script into ENTRYPOINT + CMD so Cloudflare Container's
# launcher invokes both correctly. The node-alpine base image's default
# entrypoint (`docker-entrypoint.sh`) gets dropped, which is what we want
# — the launcher runs the exec form directly.
ENTRYPOINT ["node"]
CMD ["dist/server.mjs"]
