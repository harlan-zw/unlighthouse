import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import * as schema from './schema'

let db: ReturnType<typeof drizzle> | null = null

/**
 * Get or create the database connection
 */
export async function getDatabase() {
  if (db) {
    return db
  }

  // Ensure data directory exists
  const dataDir = process.env.DATABASE_DIR || join(process.cwd(), 'data')
  await mkdir(dataDir, { recursive: true })

  const dbPath = join(dataDir, 'lighthouse.db')

  // Create SQLite connection
  const sqlite = new Database(dbPath)

  // Enable WAL mode for better concurrent performance
  sqlite.pragma('journal_mode = WAL')

  // Create Drizzle instance
  db = drizzle(sqlite, { schema })

  return db
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (db) {
    // Better-sqlite3 doesn't have a close method on the drizzle instance
    // The connection will be closed when the process exits
    db = null
  }
}

// Re-export schema for convenience
export { schema }
