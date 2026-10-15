import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CliDeps } from '../src/cli.ts'
import { main } from '../src/cli.ts'
import { createFakePool } from './fixtures/fake-pool.ts'
import { servePages } from './fixtures/pages.ts'

const site = servePages(['/', '/about', '/contact'])
const empty = servePages([])

let dir: string
let performance = 0.8

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-cli-'))
  performance = 0.8
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

afterAll(() => {
  site.stop()
  empty.stop()
})

async function run(argv: string[], env: Record<string, string> = {}) {
  let stdout = ''
  let stderr = ''
  const deps: CliDeps = {
    createPool: createFakePool({ performance: () => performance }).createPool,
    cwd: dir,
    env,
    handleSignals: false,
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stderr += text) },
  }
  const code = await main(argv, deps)
  return { code, stdout, stderr }
}

describe('cli', () => {
  test('prints help and version, and rejects unknown commands and flags', async () => {
    expect((await run(['--help'])).stdout).toContain('Usage: unlighthouse')
    expect((await run(['--version'])).stdout.trim()).toBe('0.1.0')
    expect((await run(['explode'])).code).toBe(2)
    const bad = await run(['scan', site.origin, '--nope'])
    expect(bad.code).toBe(2)
    expect(bad.stderr).toContain('--nope')
    expect((await run(['scan', site.origin, '--samples', 'two'])).code).toBe(2)
  })

  test('scan prints a summary and plain progress lines when not on a TTY', async () => {
    const result = await run(['scan', site.origin, '--device', 'mobile,desktop'])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(`Unlighthouse · ${site.origin}`)
    expect(result.stdout).toContain('3 page(s) found, 3 audited')
    expect(result.stdout).toMatch(/mobile {2}Performance 80/)
    expect(result.stderr).toContain('discovering')
    expect(result.stderr).toContain('done  desktop /contact')
    expect(existsSync(join(dir, '.unlighthouse', 'unlighthouse.db'))).toBe(true)

    const json = await run(['scan', site.origin, '--json', '--url', '/about'])
    const parsed = JSON.parse(json.stdout)
    expect(parsed.scan.status).toBe('done')
    expect(parsed.summary.pages.audited).toBe(1)
  })

  test('scan exits 2 when the scan fails', async () => {
    const result = await run(['scan', empty.origin])
    expect(result.code).toBe(2)
    expect(result.stdout).toContain('No pages found')
  })

  test('ci writes Markdown, JSON, JUnit and the GitHub step summary, and compares with the baseline', async () => {
    const stepSummary = join(dir, 'step-summary.md')
    const env = { GITHUB_STEP_SUMMARY: stepSummary, GITHUB_SHA: 'abc123', GITHUB_REF_NAME: 'main' }
    const first = await run(['ci', site.origin, '--markdown', 'out/report.md', '--json', 'out/report.json', '--junit', 'out/junit.xml'], env)
    expect(first.code).toBe(0)
    const report = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8'))
    expect(report.scan).toMatchObject({ status: 'done', branch: 'main', commit: 'abc123' })
    expect(report.budgets.passed).toBe(true)
    expect(report.baseline).toBeNull()
    expect(readFileSync(join(dir, 'out/report.md'), 'utf8')).toContain(`### Unlighthouse · ${site.origin}`)
    expect(readFileSync(join(dir, 'out/junit.xml'), 'utf8')).toContain('<testsuites name="unlighthouse"')
    expect(readFileSync(stepSummary, 'utf8')).toContain('### Unlighthouse')
    expect(first.stdout).toContain('### Unlighthouse')

    const second = await run(['ci', site.origin, '--json', 'out/second.json', '--branch', 'feature', '--baseline-branch', 'main'], env)
    expect(second.code).toBe(0)
    const again = JSON.parse(readFileSync(join(dir, 'out/second.json'), 'utf8'))
    expect(again.baseline).toBe(report.scan.id)
    expect(again.scan.branch).toBe('feature')
    expect(again.comparison.totals.pages.unchanged).toBe(3)
  })

  test('ci exits 1 when a budget from the config file fails', async () => {
    writeFileSync(join(dir, 'unlighthouse.config.ts'), `export default { budgets: { scores: { performance: 0.95 } } }\n`)
    const result = await run(['ci', site.origin, '--junit', 'junit.xml'])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Budgets failed')
    const junit = readFileSync(join(dir, 'junit.xml'), 'utf8')
    expect(junit).toContain('<failure')
    expect(junit).toContain('failures="1"')
  })

  test('ci exits 2 when the scan fails', async () => {
    const result = await run(['ci', empty.origin, '--json', 'report.json'])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('failed')
    expect(existsSync(join(dir, 'report.json'))).toBe(false)
  })

  test('config --print shows the resolved config with flags over the config file', async () => {
    writeFileSync(join(dir, 'unlighthouse.config.ts'), `export default { samples: 3, discover: { maxPages: 50 } }\n`)
    const result = await run(['config', '--print', '--max-pages', '20', '-d', 'desktop'])
    expect(result.code).toBe(0)
    const config = JSON.parse(result.stdout)
    expect(config).toMatchObject({ samples: 3, devices: ['desktop'], discover: { maxPages: 20, sitemap: true } })
    expect(config.dataDir).toBe(join(dir, '.unlighthouse'))
  })

  test('compare and prune work on stored scans', async () => {
    await run(['scan', site.origin])
    performance = 0.3
    await run(['scan', site.origin])
    expect((await run(['ci', site.origin, '--json', 'r.json'])).code).toBe(0)
    const report = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'))
    const head = report.scan.id as string
    const base = report.baseline as string
    const json = await run(['compare', base, head])
    expect(json.code).toBe(0)
    expect(JSON.parse(json.stdout).head.id).toBe(head)
    const markdown = await run(['compare', base, head, '--markdown'])
    expect(markdown.stdout).toContain('### Unlighthouse')
    expect((await run(['compare', base])).code).toBe(2)

    const pruned = await run(['prune', '--keep', '1', '--json'])
    expect(JSON.parse(pruned.stdout).removed).toHaveLength(2)
    expect((await run(['compare', base, head])).code).toBe(2)
  })
})
