import type { Config } from 'drizzle-kit'
import { join } from 'node:path'

export default {
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || join(process.cwd(), 'data/lighthouse.db'),
  },
} satisfies Config
