import type { AliasOptions } from 'vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const r = (p: string) => resolve(__dirname, p)
const escapeRegExp = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function exact(id: string, path: string) {
  return {
    find: new RegExp(`^${escapeRegExp(id)}$`),
    replacement: r(path),
  }
}

// Workspace path aliases for tests. Shared runtime deps (drizzle-orm, h3,
// zod, fs-extra, tinyexec, better-sqlite3) are declared as root devDeps in
// package.json so pnpm resolves them normally. Keep these exact so tests
// fail on package-private deep imports instead of bypassing export maps.
const aliasEntries = [
  ['unlighthouse', './packages/unlighthouse/src/index.ts'],
  ['unlighthouse/cli', './packages/unlighthouse/src/cli/cli.ts'],
  ['unlighthouse/ci', './packages/unlighthouse/src/cli/ci.ts'],
  ['unlighthouse/config', './packages/unlighthouse/config.mjs'],
  ['@unlighthouse/ui', './packages/ui/'],
  ['@unlighthouse/contracts', './packages/contracts/src/index.ts'],
  ['@unlighthouse/contracts/commands', './packages/contracts/src/commands/index.ts'],
  ['@unlighthouse/contracts/config', './packages/contracts/src/config/index.ts'],
  ['@unlighthouse/contracts/drizzle', './packages/contracts/src/drizzle/index.ts'],
  ['@unlighthouse/contracts/errors', './packages/contracts/src/errors/index.ts'],
  ['@unlighthouse/contracts/hooks', './packages/contracts/src/hooks/index.ts'],
  ['@unlighthouse/contracts/logging', './packages/contracts/src/logging/index.ts'],
  ['@unlighthouse/contracts/packs', './packages/contracts/src/packs/index.ts'],
  ['@unlighthouse/contracts/ports', './packages/contracts/src/ports/index.ts'],
  ['@unlighthouse/contracts/types/atoms', './packages/contracts/src/types/atoms.ts'],
  ['@unlighthouse/contracts/types/puppeteer', './packages/contracts/src/types/puppeteer.ts'],
  ['@unlighthouse/core', './packages/core/src/index.ts'],
  ['@unlighthouse/core/report', './packages/core/src/report/index.ts'],
  ['@unlighthouse/core/comparison', './packages/core/src/comparison/index.ts'],
  ['@unlighthouse/core/seeds', './packages/core/src/seeds/index.ts'],
  ['@unlighthouse/core/policies', './packages/core/src/policies/index.ts'],
  ['@unlighthouse/core/crawlers', './packages/core/src/crawlers/index.ts'],
  ['@unlighthouse/core/auditors', './packages/core/src/auditors/index.ts'],
  ['@unlighthouse/core/auditors/mock', './packages/core/src/auditors/mock.ts'],
  ['@unlighthouse/core/auditors/cdp-connect', './packages/core/src/auditors/cdp-connect.ts'],
  ['@unlighthouse/core/auditors/remote-lighthouse', './packages/core/src/auditors/remote-lighthouse.ts'],
  ['@unlighthouse/core/auditors/crux', './packages/core/src/auditors/crux.ts'],
  ['@unlighthouse/core/auditors/dataforseo', './packages/core/src/auditors/dataforseo.ts'],
  ['@unlighthouse/core/auditors/local', './packages/core/src/auditors/local.ts'],
  ['@unlighthouse/core/auditors/psi', './packages/core/src/auditors/psi.ts'],
  ['@unlighthouse/core/auditors/route', './packages/core/src/auditors/route/index.ts'],
  ['@unlighthouse/core/util/path', './packages/core/src/util/path.ts'],
  ['@unlighthouse/core/util/fetch', './packages/core/src/util/fetch.ts'],
  ['@unlighthouse/core/util/filter', './packages/core/src/util/filter.ts'],
  ['@unlighthouse/core/util/progressBox', './packages/core/src/util/progressBox.ts'],
  ['@unlighthouse/core/util/git-meta', './packages/core/src/util/git-meta.ts'],
  ['@unlighthouse/core/storage', './packages/core/src/storage/index.ts'],
  ['@unlighthouse/core/storage/drizzle', './packages/core/src/storage/drizzle/index.ts'],
  ['@unlighthouse/core/storage/memory', './packages/core/src/storage/memory/index.ts'],
  ['@unlighthouse/core/storage/unstorage-blobs', './packages/core/src/storage/unstorage-blobs/index.ts'],
  ['@unlighthouse/core/api', './packages/core/src/api/index.ts'],
  ['@unlighthouse/core/api/client', './packages/core/src/api/client.ts'],
  ['@unlighthouse/core/api/static-client', './packages/core/src/api/static-client.ts'],
  ['@unlighthouse/core/api/http', './packages/core/src/api/http.ts'],
  ['@unlighthouse/core/api/handlers', './packages/core/src/api/handlers/index.ts'],
  ['@unlighthouse/core/api/dashboard', './packages/core/src/api/dashboard.ts'],
  ['@unlighthouse/core/logger', './packages/core/src/logger.ts'],
  ['@unlighthouse/core/packs', './packages/core/src/packs/index.ts'],
  ['@unlighthouse/cloudflare', './packages/cloudflare/src/index.ts'],
  ['@unlighthouse/cloudflare/auditors/browser-rendering', './packages/cloudflare/src/auditors/browser-rendering.ts'],
  ['@unlighthouse/cloudflare-lighthouse/worker', './packages/cloudflare-lighthouse/src/worker-helper.ts'],
  ['@unlighthouse/cloudflare-lighthouse/server', './packages/cloudflare-lighthouse/src/server.ts'],
  ['@unlighthouse/mcp', './packages/mcp/src/index.ts'],
  ['@unlighthouse/vite', './packages/vite-plugin/src/index.ts'],
  // `cloudflare:workers` is a Workers-runtime virtual module. Stub it so
  // tests in Node can import packages (@cloudflare/containers etc.) that
  // depend on it without spinning up miniflare.
  ['cloudflare:workers', './test/stubs/cloudflare-workers.ts'],
] as const

export const alias = aliasEntries.map(([id, path]) => exact(id, path)) satisfies AliasOptions
export const rolldownAlias: Record<string, string> = Object.fromEntries(
  aliasEntries.map(([id, path]) => [id, r(path)]),
)

export default defineConfig({
  test: {
    testTimeout: 3000000,
  },
  resolve: {
    alias,
  },
})
