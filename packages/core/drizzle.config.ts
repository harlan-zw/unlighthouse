import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: '../contracts/src/drizzle/sqlite.ts',
  out: './migrations/sqlite',
  verbose: true,
  strict: true,
})
