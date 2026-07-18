import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveScanDirectory } from '../src/cli/scan-directory'
import { computeConfigCacheKey } from '../src/util/config-key'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-scan-directory-'))
  roots.push(root)
  return root
}

function createScanDirectory(root: string, hostname: string, name: string, count: number, mtime = Date.now()): string {
  const path = join(root, hostname, name)
  mkdirSync(path, { recursive: true })
  const db = new Database(join(path, 'db.sqlite'))
  db.exec('CREATE TABLE scans (id TEXT PRIMARY KEY)')
  const insert = db.prepare('INSERT INTO scans (id) VALUES (?)')
  const seed = db.transaction(() => {
    for (let index = 0; index < count; index++)
      insert.run(`scan-${index}`)
  })
  seed()
  db.close()
  const time = new Date(mtime)
  utimesSync(path, time, time)
  return path
}

describe('resolveScanDirectory', () => {
  it('returns a deterministic config fallback without creating it', async () => {
    const root = await tempRoot()
    const config = { site: 'https://example.com', scanner: { device: 'mobile' } }
    const version = '1.2.3'

    const selected = resolveScanDirectory({ outputRoot: root, site: config.site, config, version })

    expect(selected).toMatchObject({ reason: 'config-fallback' })
    expect(selected.path).toBe(join(root, 'example.com', computeConfigCacheKey(config, version)))
    expect(existsSync(selected.path)).toBe(false)
  })

  it('selects the site directory with the most scans', async () => {
    const root = await tempRoot()
    createScanDirectory(root, 'example.com', 'older', 2, 1000)
    const expected = createScanDirectory(root, 'example.com', 'busier', 5, 500)

    const selected = resolveScanDirectory({ outputRoot: root, site: 'https://example.com', config: {}, version: '1' })

    expect(selected.path).toBe(expected)
    expect(selected.reason).toBe('existing-site')
    expect(selected.diagnostics).toHaveLength(1)
    expect(selected.diagnostics[0]).toContain('busier')
  })

  it('uses mtime and then name as deterministic tie breakers', async () => {
    const root = await tempRoot()
    createScanDirectory(root, 'example.com', 'a', 2, 1000)
    const newer = createScanDirectory(root, 'example.com', 'z', 2, 2000)

    expect(resolveScanDirectory({ outputRoot: root, site: 'https://example.com', config: {}, version: '1' }).path).toBe(newer)

    utimesSync(join(root, 'example.com', 'a'), new Date(2000), new Date(2000))
    expect(resolveScanDirectory({ outputRoot: root, site: 'https://example.com', config: {}, version: '1' }).path)
      .toBe(join(root, 'example.com', 'a'))
  })

  it('ignores malformed databases and records the decision', async () => {
    const root = await tempRoot()
    const bad = join(root, 'example.com', 'broken')
    mkdirSync(bad, { recursive: true })
    writeFileSync(join(bad, 'db.sqlite'), 'not sqlite')

    const selected = resolveScanDirectory({ outputRoot: root, site: 'https://example.com', config: {}, version: '1' })

    expect(selected.reason).toBe('config-fallback')
    expect(selected.diagnostics.some(message => message.includes('ignored unreadable scan database'))).toBe(true)
  })

  it('selects the busiest host, then that host\'s busiest directory', async () => {
    const root = await tempRoot()
    const expected = createScanDirectory(root, 'a.example', 'primary', 3, 1000)
    createScanDirectory(root, 'a.example', 'secondary', 2, 2000)
    createScanDirectory(root, 'b.example', 'only', 4, 3000)

    const selected = resolveScanDirectory({ outputRoot: root, config: {}, version: '1' })

    expect(selected.path).toBe(expected)
    expect(selected.reason).toBe('existing-root')
    expect(selected.diagnostics.at(-1)).toContain('a.example')
  })

  it('returns the untouched output root when no history exists', async () => {
    const root = await tempRoot()

    const selected = resolveScanDirectory({ outputRoot: root, config: {}, version: '1' })

    expect(selected).toEqual({ path: root, reason: 'empty-root', diagnostics: [] })
  })
})
