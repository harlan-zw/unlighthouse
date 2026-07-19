import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { computeConfigCacheKey, normaliseHost } from '../util'

export interface ResolveScanDirectoryOptions {
  outputRoot: string
  site?: string | null
  config: unknown
  version: string
}

export interface ScanDirectorySelection {
  path: string
  reason: 'existing-site' | 'existing-root' | 'config-fallback' | 'empty-root'
  diagnostics: readonly string[]
}

interface ScanDirectoryCandidate {
  name: string
  path: string
  count: number
  mtime: number
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function directoryNames(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  }
  catch (error) {
    if (isMissingPath(error))
      return []
    throw error
  }
}

function scanCount(dbPath: string, diagnostics: string[]): number {
  if (!existsSync(dbPath))
    return 0

  let db: InstanceType<typeof Database> | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    const row = db.prepare('SELECT count(*) AS count FROM scans').get()
    if (!row || typeof row !== 'object' || !('count' in row) || typeof row.count !== 'number')
      throw new TypeError('Expected a numeric scan count from SQLite.')
    return row.count
  }
  catch (error) {
    diagnostics.push(`ignored unreadable scan database ${dbPath}: ${errorMessage(error)}`)
    return 0
  }
  finally {
    db?.close()
  }
}

function scanDirectories(siteDirectory: string, diagnostics: string[]): ScanDirectoryCandidate[] {
  const candidates: ScanDirectoryCandidate[] = []
  for (const name of directoryNames(siteDirectory)) {
    const path = join(siteDirectory, name)
    let mtime: number
    try {
      mtime = statSync(path).mtimeMs
    }
    catch (error) {
      if (isMissingPath(error))
        continue
      throw error
    }
    candidates.push({
      name,
      path,
      count: scanCount(join(path, 'db.sqlite'), diagnostics),
      mtime,
    })
  }
  return candidates.sort((a, b) =>
    (b.count - a.count)
    || (b.mtime - a.mtime)
    || a.name.localeCompare(b.name),
  )
}

function existingCandidate(candidates: ScanDirectoryCandidate[]): ScanDirectoryCandidate | undefined {
  return candidates.find(candidate => candidate.count > 0)
}

function describeAlternatives(candidates: ScanDirectoryCandidate[]): string {
  return candidates
    .filter(candidate => candidate.count > 0)
    .map(candidate => `${candidate.name}=${candidate.count}`)
    .join(', ')
}

/**
 * Select the existing local scan directory shared by projected CLI commands
 * and MCP. Discovery is read-only; writable initialization stays in
 * createLocalRuntime.
 */
export function resolveScanDirectory(options: ResolveScanDirectoryOptions): ScanDirectorySelection {
  const diagnostics: string[] = []

  if (options.site) {
    const hostname = normaliseHost(options.site).hostname.replace(':', '꞉')
    const siteDirectory = join(options.outputRoot, hostname)
    const candidates = scanDirectories(siteDirectory, diagnostics)
    const selected = existingCandidate(candidates)
    const alternatives = candidates.filter(candidate => candidate.count > 0)
    if (selected) {
      if (alternatives.length > 1) {
        diagnostics.push(
          `${alternatives.length} scan directories found for ${hostname}; selected ${selected.name} `
          + `(${selected.count} scans). Candidates: ${describeAlternatives(candidates)}`,
        )
      }
      return { path: selected.path, reason: 'existing-site', diagnostics }
    }
    return {
      path: join(siteDirectory, computeConfigCacheKey(options.config, options.version)),
      reason: 'config-fallback',
      diagnostics,
    }
  }

  const hosts = directoryNames(options.outputRoot)
    .map((hostname) => {
      const candidates = scanDirectories(join(options.outputRoot, hostname), diagnostics)
      const active = candidates.filter(candidate => candidate.count > 0)
      return {
        hostname,
        candidates,
        total: active.reduce((sum, candidate) => sum + candidate.count, 0),
        mtime: active.reduce((latest, candidate) => Math.max(latest, candidate.mtime), 0),
      }
    })
    .filter(host => host.total > 0)
    .sort((a, b) =>
      (b.total - a.total)
      || (b.mtime - a.mtime)
      || a.hostname.localeCompare(b.hostname),
    )

  const selectedHost = hosts[0]
  const selected = selectedHost ? existingCandidate(selectedHost.candidates) : undefined
  if (!selectedHost || !selected)
    return { path: options.outputRoot, reason: 'empty-root', diagnostics }

  if (hosts.length > 1) {
    diagnostics.push(
      `no site provided; selected ${selectedHost.hostname} (${selectedHost.total} scans). `
      + `Hosts: ${hosts.map(host => `${host.hostname}=${host.total}`).join(', ')}`,
    )
  }
  else {
    diagnostics.push(`no site provided; selected ${selectedHost.hostname} (${selectedHost.total} scans)`)
  }
  return { path: selected.path, reason: 'existing-root', diagnostics }
}
