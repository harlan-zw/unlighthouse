import type { AliasOptions } from 'vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const r = (p: string) => resolve(__dirname, p)

// Workspace path aliases for tests. Shared runtime deps (drizzle-orm, h3,
// zod, fs-extra, tinyexec, better-sqlite3) are declared as root devDeps in
// package.json so pnpm resolves them normally — no version-pinned paths.
export const alias: AliasOptions = {
  'unlighthouse/cli': r('./packages/unlighthouse/src/cli/cli.ts'),
  'unlighthouse': r('./packages/unlighthouse/src/'),
  '@unlighthouse/ui': r('./packages/ui/'),
  '@unlighthouse/contracts/drizzle': r('./packages/contracts/src/drizzle/index.ts'),
  '@unlighthouse/contracts': r('./packages/contracts/src/index.ts'),
  '@unlighthouse/core': r('./packages/core/src/'),
  '@unlighthouse/cloudflare': r('./packages/cloudflare/src/'),
  '@unlighthouse/mcp': r('./packages/mcp/src/'),
}

export default defineConfig({
  test: {
    testTimeout: 3000000,
  },
  resolve: {
    alias,
  },
})
