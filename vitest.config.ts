import type { AliasOptions } from 'vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const r = (p: string) => resolve(__dirname, p)

export const alias: AliasOptions = {
  'unlighthouse/cli': r('./packages/unlighthouse/src/cli/cli.ts'),
  'unlighthouse': r('./packages/unlighthouse/src/'),
  '@unlighthouse/ui': r('./packages/ui/'),
  '@unlighthouse/contracts': r('./packages/contracts/src/index.ts'),
  '@unlighthouse/core': r('./packages/core/src/'),
  '@unlighthouse/cloudflare': r('./packages/cloudflare/src/'),
  '@unlighthouse/mcp': r('./packages/mcp/src/'),
  // pnpm install at the root is blocked by an unrelated semver@6.3.1
  // trust-downgrade; pin shared deps used by tests at the workspace store path.
  'zod': r('./node_modules/.pnpm/zod@4.4.3/node_modules/zod'),
  'h3': r('./packages/core/node_modules/h3'),
  'fs-extra': r('./node_modules/.pnpm/fs-extra@11.3.5/node_modules/fs-extra'),
  'tinyexec': r('./node_modules/.pnpm/tinyexec@1.1.2/node_modules/tinyexec'),
  'better-sqlite3': r('./node_modules/.pnpm/better-sqlite3@12.10.0/node_modules/better-sqlite3'),
  'drizzle-orm/better-sqlite3': r('./node_modules/.pnpm/drizzle-orm@0.45.2_@opentelemetry+api@1.9.0_@types+better-sqlite3@7.6.13_@types+pg@8.6.1_better-sqlite3@12.10.0/node_modules/drizzle-orm/better-sqlite3'),
  'drizzle-orm': r('./node_modules/.pnpm/drizzle-orm@0.45.2_@opentelemetry+api@1.9.0_@types+better-sqlite3@7.6.13_@types+pg@8.6.1_better-sqlite3@12.10.0/node_modules/drizzle-orm'),
}

export default defineConfig({
  test: {
    testTimeout: 3000000,
  },
  resolve: {
    alias,
  },
})
