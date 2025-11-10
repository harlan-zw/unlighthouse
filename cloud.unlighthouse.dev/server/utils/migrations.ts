import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import Database from 'better-sqlite3'

/**
 * Run database migrations automatically on startup
 */
export async function runMigrations() {
  const dataDir = process.env.DATABASE_DIR || join(process.cwd(), 'data')
  const dbPath = process.env.DATABASE_URL || join(dataDir, 'lighthouse.db')

  console.log('[DB] Running migrations...')

  // Ensure database exists
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  // Create migrations table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at INTEGER DEFAULT (unixepoch()) NOT NULL
    )
  `)

  // Get list of executed migrations
  const executedMigrations = sqlite
    .prepare('SELECT name FROM _migrations')
    .all() as Array<{ name: string }>
  const executedNames = new Set(executedMigrations.map(m => m.name))

  // Get migration files
  const migrationsDir = join(process.cwd(), 'server/database/migrations')
  if (!existsSync(migrationsDir)) {
    console.log('[DB] No migrations directory found, skipping')
    sqlite.close()
    return
  }

  const files = await readdir(migrationsDir)
  const sqlFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort() // Ensure order

  // Run pending migrations
  let migrated = 0
  for (const file of sqlFiles) {
    if (executedNames.has(file)) {
      continue
    }

    console.log(`[DB] Running migration: ${file}`)

    const sql = await import('node:fs/promises').then(fs =>
      fs.readFile(join(migrationsDir, file), 'utf-8'),
    )

    try {
      sqlite.exec(sql)
      sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file)
      migrated++
      console.log(`[DB] ✓ ${file}`)
    }
    catch (error) {
      console.error(`[DB] ✗ Failed to run migration ${file}:`, error)
      throw error
    }
  }

  sqlite.close()

  if (migrated > 0) {
    console.log(`[DB] Ran ${migrated} migration(s)`)
  }
  else {
    console.log('[DB] All migrations up to date')
  }
}
