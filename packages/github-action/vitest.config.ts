import { defineConfig } from 'vitest/config'

// Local config so `pnpm --filter @unlighthouse/github-action test` works
// without pulling root workspace aliases — these tests only exercise the
// shell-command builder and the PR-comment poster shape, no `unlighthouse`
// runtime is loaded.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
