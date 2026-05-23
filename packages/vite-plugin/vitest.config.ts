import { defineConfig } from 'vitest/config'

// Local config so `pnpm --filter @unlighthouse/vite test` works without
// pulling in the root workspace aliases (which depend on better-sqlite3 +
// drizzle being installed in a way that's overkill for shape-only tests).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
