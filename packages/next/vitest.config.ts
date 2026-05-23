import { defineConfig } from 'vitest/config'

// Local config so `pnpm --filter @unlighthouse/next test` works without
// pulling in the root workspace aliases. Mirrors the @unlighthouse/vite
// sibling scaffold.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
