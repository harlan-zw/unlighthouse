import { resolve } from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(resolve(import.meta.dirname, '../../packages/core/migrations/sqlite')),
        },
      },
    })),
  ],
  test: {
    include: ['./test/**/*.workerd.ts'],
  },
})
