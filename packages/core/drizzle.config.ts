import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/storage/drizzle/schema/sqlite.ts',
  out: './migrations/sqlite',
  verbose: true,
  strict: true,
})
