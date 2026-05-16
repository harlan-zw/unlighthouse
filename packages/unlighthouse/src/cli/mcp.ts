// Entry point for `unlighthouse-mcp` (bin) and `unlighthouse mcp` (subcommand).
// Boots a stdio MCP server projecting the command registry.
//
// Storage is the same drizzle+unstorage stack the HTTP host uses, pointed at
// the resolved `outputPath`. That means MCP clients see the user's real scan
// history, cached pack runs, and blob-stored LHRs — not an empty in-memory
// world. Without this, history.list returns [] and pack.run can't be invoked
// because there's no scanId to feed it.

import type { UnlighthouseConfig } from '@unlighthouse/contracts'
import { createUnlighthouseCore, reapStaleScans } from '@unlighthouse/core'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { createStorage } from '@unlighthouse/core/storage'
import { applyMigrations, drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import { startStdioServer } from '@unlighthouse/mcp'
import Database from 'better-sqlite3'
import { createConsola } from 'consola'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'fs-extra'
import { isAbsolute, join, resolve } from 'node:path'
import fsDriver from 'unstorage/drivers/fs'
import { version } from '../../package.json'
import { resolveAuditor } from '../auditor'
import { resolveConfig } from '../config/resolve'
import { computeConfigCacheKey, normaliseHost } from '../util'

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
function parseFlags(argv: string[]): { site?: string, root?: string, debug?: boolean } {
  const out: { site?: string, root?: string, debug?: boolean } = {}
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
    else if (a === '--debug' || a === '-d') {
      out.debug = true
    }
  }
  return out
}

// Module-level flag so the discovery helpers (which are pure but emit
// diagnostics) can stay quiet without threading a logger through every call.
// Set once during boot from --debug; never reassigned at runtime.
let debugMode = false
function diag(msg: string): void {
  if (debugMode)
    process.stderr.write(msg)
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

// Count `scans` rows in a sqlite DB. Opens readonly, returns 0 on any error
// (table missing, locked, malformed). Used for both site-level (--site given)
// and root-level (no --site) discovery scoring.
function countScans(dbPath: string): number {
  let db: InstanceType<typeof Database> | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    return (db.prepare('SELECT count(*) AS c FROM scans').get() as { c: number }).c
  }
  catch {
    return 0
  }
  finally {
    db?.close()
  }
}

// For a given site directory, rank its <cacheKey> subdirs by scan count
// (mtime tiebreak), return the path of the winner. If no subdir has scans,
// mint a fresh cacheKey dir so future writes land somewhere structured.
function pickScanDir(parent: string, hostname: string, config: unknown, version: string): string {
  const siteDir = join(parent, hostname)
  if (!fs.existsSync(siteDir))
    return join(siteDir, computeConfigCacheKey(config, version))
  const candidates = fs.readdirSync(siteDir)
    .map((name) => {
      const dbPath = join(siteDir, name, 'db.sqlite')
      if (!fs.existsSync(dbPath))
        return null
      return { name, mtime: fs.statSync(join(siteDir, name)).mtimeMs, count: countScans(dbPath) }
    })
    .filter((e): e is { name: string, mtime: number, count: number } => e !== null)
    .sort((a, b) => (b.count - a.count) || (b.mtime - a.mtime))
  const withScans = candidates.filter(c => c.count > 0)
  if (withScans.length > 1) {
    diag(
      `[unlighthouse-mcp] ${withScans.length} scan dirs found for ${hostname}; picking ${withScans[0].name} `
      + `(${withScans[0].count} scans). Others: ${withScans.slice(1).map(c => `${c.name}=${c.count}`).join(', ')}\n`,
    )
  }
  if (candidates[0] && candidates[0].count > 0)
    return join(siteDir, candidates[0].name)
  return join(siteDir, computeConfigCacheKey(config, version))
}

export async function runMcp(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  debugMode = flags.debug === true
  const rootDir = flags.root ? sanitiseRoot(flags.root) : undefined
  const { config } = await resolveConfig({
    overrides: flags.site ? { site: flags.site } : undefined,
    cwd: rootDir,
  })

  // D-018: host owns the concrete consola; tagged children pass into each
  // adapter. MCP routes consola → stderr only (stdout is the JSON-RPC channel).
  // --debug raises consola to verbose so the user sees migration / drizzle /
  // storage chatter alongside the discover diagnostics.
  const logger = createConsola({ defaults: { level: debugMode ? 4 : 1 } }).withTag('unlighthouse-mcp')

  // Resolve the on-disk scan directory. The CLI writes to
  // `.unlighthouse/<hostname>/<configCacheKey>/` where `configCacheKey` is a
  // 4-char hash of the *raw* userConfig at scan time. Computing the same hash
  // from MCP's resolved config doesn't always match (c12 layering / defaults
  // differ), so we discover instead — pick the subdir whose `scans` table has
  // the most rows, breaking ties by mtime. If none exists, mint a fresh hash
  // dir so future writes don't pollute the site root.
  //
  // When --site is absent, walk `.unlighthouse/<*>/` to find any hostname with
  // scans on disk. The agent gets to enumerate sites without the user having
  // to know the URL in advance.
  let outputPath = config.outputPath as string
  if (config.site) {
    const site = normaliseHost(config.site)
    outputPath = pickScanDir(outputPath, site.hostname.replace(':', '꞉'), config, version)
  }
  else {
    const rootDir = outputPath
    if (fs.existsSync(rootDir)) {
      const hostDirs = fs.readdirSync(rootDir)
        .filter(name => fs.statSync(join(rootDir, name)).isDirectory())
        .map((hostname) => {
          // Score each hostname by total scans across all <cacheKey> subdirs.
          const hostDir = join(rootDir, hostname)
          let total = 0
          let mtime = 0
          for (const sub of fs.readdirSync(hostDir)) {
            const dbPath = join(hostDir, sub, 'db.sqlite')
            if (!fs.existsSync(dbPath))
              continue
            const c = countScans(dbPath)
            total += c
            const m = fs.statSync(join(hostDir, sub)).mtimeMs
            if (m > mtime)
              mtime = m
          }
          return { hostname, total, mtime }
        })
        .filter(h => h.total > 0)
        .sort((a, b) => (b.total - a.total) || (b.mtime - a.mtime))
      if (hostDirs.length > 0) {
        const pick = hostDirs[0]
        if (hostDirs.length > 1) {
          diag(
            `[unlighthouse-mcp] no --site provided; ${hostDirs.length} sites have scans on disk; picking ${pick.hostname} `
            + `(${pick.total} scans). Others: ${hostDirs.slice(1).map(h => `${h.hostname}=${h.total}`).join(', ')}\n`,
          )
        }
        else {
          diag(`[unlighthouse-mcp] no --site provided; defaulting to ${pick.hostname} (${pick.total} scans)\n`)
        }
        outputPath = pickScanDir(rootDir, pick.hostname, config, version)
      }
      // No scans anywhere → leave outputPath at the bare root and history
      // will be empty. Better than guessing a hostname.
    }
  }
  fs.ensureDirSync(outputPath)
  // Diagnostic to stderr (stdout is the JSON-RPC channel and must stay clean).
  // Gated by --debug so production agents don't see internal paths by default.
  diag(`[unlighthouse-mcp] outputPath=${outputPath}\n`)

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
  // Runtime upgrades for databases that pre-date a schema bump (D-029
  // device column, etc.). Same code path host.ts uses.
  applyMigrations(sqliteDb, {
    onApply: id => logger.info?.(`[storage] applied migration: ${id}`),
  })
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

  // Sweep zombies left by a prior process. MCP often opens an existing DB
  // written by the CLI; "starting" rows from a Ctrl+C'd CLI run would
  // otherwise stay forever in agent's history_list output.
  reapStaleScans(storage, logger).catch(() => {})

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
