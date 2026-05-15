// Entry point for `unlighthouse-mcp` (bin) and `unlighthouse mcp` (subcommand).
// Boots a stdio MCP server projecting the command registry.
//
// Storage is the same drizzle+unstorage stack the HTTP host uses, pointed at
// the resolved `outputPath`. That means MCP clients see the user's real scan
// history, cached pack runs, and blob-stored LHRs — not an empty in-memory
// world. Without this, history.list returns [] and pack.run can't be invoked
// because there's no scanId to feed it.

import type { UnlighthouseConfig } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { createStorage } from '@unlighthouse/core/storage'
import { drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import { startStdioServer } from '@unlighthouse/mcp'
import Database from 'better-sqlite3'
import { createConsola } from 'consola'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'fs-extra'
import { isAbsolute, join, resolve } from 'node:path'
import objectHash from 'object-hash'
import fsDriver from 'unstorage/drivers/fs'
import { version } from '../../package.json'
import { resolveAuditor } from '../auditor'
import { resolveConfig } from '../config/resolve'
import { normaliseHost } from '../util'

function resolveManualUrls(urls: UnlighthouseConfig['urls']): string[] | (() => string[] | Promise<string[]>) {
  if (typeof urls === 'function') {
    return async () => {
      const result = await urls()
      return Array.isArray(result) ? result.filter((url): url is string => typeof url === 'string') : []
    }
  }
  return urls ?? []
}

// Minimal flag parsing — keep this dependency-free so the stdio entrypoint
// boots fast. The CLI's full citty surface is overkill here; we only need to
// know which site (= which `.unlighthouse/<site>/<hash>/` to point at).
//
// Throws via process.exit on malformed input — `unlighthouse-mcp --site` with
// no value used to silently land on the bare outputPath and return an empty
// history, which is much harder to diagnose than a "missing value" error.
function parseFlags(argv: string[]): { site?: string, root?: string } {
  const out: { site?: string, root?: string } = {}
  const needsValue = (name: string, next: string | undefined): string => {
    if (next == null || next.startsWith('--') || next.startsWith('-')) {
      process.stderr.write(`[unlighthouse-mcp] missing value for ${name}\n`)
      process.exit(2)
    }
    return next
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--site' || a === '-s') {
      out.site = needsValue(a, argv[++i])
    }
    else if (a.startsWith('--site=')) {
      const v = a.slice('--site='.length)
      if (!v) {
        process.stderr.write(`[unlighthouse-mcp] missing value for --site\n`)
        process.exit(2)
      }
      out.site = v
    }
    else if (a === '--root' || a === '-r') {
      out.root = needsValue(a, argv[++i])
    }
    else if (a.startsWith('--root=')) {
      const v = a.slice('--root='.length)
      if (!v) {
        process.stderr.write(`[unlighthouse-mcp] missing value for --root\n`)
        process.exit(2)
      }
      out.root = v
    }
  }
  return out
}

// Resolve --root to an absolute path under CWD. Prevents `--root ../../../`
// from silently relocating `.unlighthouse` outside the project. If a user
// genuinely needs an absolute path elsewhere, they can pass one — we honour
// absolutes verbatim but refuse relatives that escape CWD.
function sanitiseRoot(raw: string): string {
  const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  const cwd = process.cwd()
  if (!isAbsolute(raw) && !abs.startsWith(`${cwd}/`) && abs !== cwd) {
    process.stderr.write(`[unlighthouse-mcp] --root resolves outside CWD: ${abs}\n`)
    process.exit(2)
  }
  return abs
}

export async function runMcp(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const rootDir = flags.root ? sanitiseRoot(flags.root) : undefined
  const { config } = await resolveConfig({
    overrides: flags.site ? { site: flags.site } : undefined,
    cwd: rootDir,
  })

  // D-018: host owns the concrete consola; tagged children pass into each
  // adapter. MCP routes consola → stderr only (stdout is the JSON-RPC channel).
  const logger = createConsola({ defaults: { level: 1 } }).withTag('unlighthouse-mcp')

  // Resolve the on-disk scan directory. The CLI writes to
  // `.unlighthouse/<hostname>/<configCacheKey>/` where `configCacheKey` is a
  // 4-char hash of the *raw* userConfig at scan time. Computing the same hash
  // from MCP's resolved config doesn't generally match (different layering:
  // c12 + flags + defaults), so we discover instead — pick the subdir whose
  // `scans` table has the most rows, breaking ties by mtime. If none exists,
  // mint a fresh hash dir so future writes don't pollute the site root.
  let outputPath = config.outputPath as string
  if (config.site) {
    const site = normaliseHost(config.site)
    const siteDir = join(outputPath, site.hostname.replace(':', '꞉'))
    if (fs.existsSync(siteDir)) {
      const candidates = fs.readdirSync(siteDir)
        .map((name) => {
          const dbPath = join(siteDir, name, 'db.sqlite')
          if (!fs.existsSync(dbPath))
            return null
          // Open readonly to probe the scans table. The `scans` SELECT can
          // throw if the table doesn't exist (malformed/uninitialised DB);
          // wrap close() in `finally` so the file descriptor is always
          // released — better-sqlite3 doesn't auto-close on GC.
          let count = 0
          let db: InstanceType<typeof Database> | null = null
          try {
            db = new Database(dbPath, { readonly: true })
            count = (db.prepare('SELECT count(*) AS c FROM scans').get() as { c: number }).c
          }
          catch {}
          finally {
            db?.close()
          }
          return { name, mtime: fs.statSync(join(siteDir, name)).mtimeMs, count }
        })
        .filter((e): e is { name: string, mtime: number, count: number } => e !== null)
        .sort((a, b) => (b.count - a.count) || (b.mtime - a.mtime))
      // Surface ambiguity: if more than one candidate dir holds scans, the
      // "most rows wins" heuristic might route to the wrong config variant
      // (e.g. mobile vs desktop ran under different cacheKeys). Emit a
      // stderr line so users can diagnose without reading source.
      const withScans = candidates.filter(c => c.count > 0)
      if (withScans.length > 1) {
        process.stderr.write(
          `[unlighthouse-mcp] ${withScans.length} scan dirs found for ${site.hostname}; picking ${withScans[0].name} `
          + `(${withScans[0].count} scans). Others: ${withScans.slice(1).map(c => `${c.name}=${c.count}`).join(', ')}\n`,
        )
      }
      if (candidates[0] && candidates[0].count > 0) {
        outputPath = join(siteDir, candidates[0].name)
      }
      else {
        const cacheKey = objectHash({ ...config, version }).substring(0, 4)
        outputPath = join(siteDir, cacheKey)
      }
    }
    else {
      const cacheKey = objectHash({ ...config, version }).substring(0, 4)
      outputPath = join(siteDir, cacheKey)
    }
  }
  fs.ensureDirSync(outputPath)
  // Diagnostic to stderr (stdout is the JSON-RPC channel and must stay clean).
  process.stderr.write(`[unlighthouse-mcp] outputPath=${outputPath}\n`)

  const sqliteDb = new Database(join(outputPath, 'db.sqlite'))
  // Idempotent migration: `CREATE TABLE IF NOT EXISTS` is safe to re-run.
  // Bare `ALTER TABLE ADD COLUMN` errors with "duplicate column name" on
  // second pass — swallow that one; surface everything else as a warning.
  for (const stmt of INIT_SQL_STATEMENTS) {
    try { sqliteDb.exec(stmt) }
    catch (err) {
      const msg = (err as Error).message
      if (!/duplicate column name/i.test(msg))
        logger.warn?.(`Migration stmt skipped: ${msg}`)
    }
  }
  const drizzleDb = drizzle(sqliteDb)
  const drizzleAdapter = drizzleStorage({
    driver: drizzleDb,
    logger: (logger as any).withTag('storage/drizzle'),
  })
  const storage = createStorage({
    rows: { ...drizzleAdapter, db: drizzleAdapter.db },
    blobs: unstorageBlobs({
      driver: fsDriver({ base: join(outputPath, 'blobs') }),
    }),
  })

  const auditor = resolveAuditor({ config, logger })
  const crawler = crawleeCrawler({ logger: logger.withTag('crawler/crawlee') as never })
  const seeds = fuseSeeds([
    manualSeeds({ urls: resolveManualUrls(config.urls), logger: logger.withTag('seeds/manual') as never }),
  ])
  const core = createUnlighthouseCore({
    config,
    auditor,
    seeds,
    crawler,
    storage,
    logger,
  })

  await startStdioServer({
    handlers: createHandlers(),
    ctx: {
      core,
      auditor,
      storage,
      config,
      version,
    },
    identity: { name: 'unlighthouse', version },
  })
}

// Auto-run when invoked as the bin entry.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('unlighthouse-mcp.mjs')) {
  runMcp().catch((err) => {
    process.stderr.write(`[unlighthouse-mcp] ${err?.message ?? err}\n`)
    process.exit(1)
  })
}
