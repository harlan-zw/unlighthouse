import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

export const ci = resolve(__dirname, '../../packages/unlighthouse/bin/unlighthouse-ci.mjs')
const testDirs = new Set<string>()
const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html')
  res.end('<!doctype html><html><head><title>CLI fixture</title></head><body><h1>CLI fixture</h1></body></html>')
})
let site: string

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Failed to bind CLI fixture server')
  site = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await Promise.all([...testDirs].map(dir => rm(dir, { recursive: true, force: true })))
})

describe('ci', () => {
  it('scans a local site and generates JSON', async () => {
    const { output } = await runCli('json')

    expect(output[0].path).toBeDefined()
    expect(output[0].score).toBeDefined()
  })

  it('scans a local site and generates expanded JSON', async () => {
    const { output } = await runCli('jsonExpanded')

    expect(output.summary).toBeDefined()
    expect(output.summary.score).toBeDefined()
    expect(output.metadata).toBeDefined()
    expect(output.routes[0].path).toBeDefined()
    expect(output.routes[0].score).toBeDefined()
    expect(output.routes[0].categories).toBeDefined()
  })
})

async function runCli(reporter: 'json' | 'jsonExpanded') {
  const testDir = await mkdtemp(join(tmpdir(), 'unlighthouse-ci-'))
  testDirs.add(testDir)

  await writeFile(join(testDir, 'unlighthouse.config.json'), JSON.stringify({
    site,
    cache: false,
    auditor: { name: 'mock' },
    scanner: { sitemap: false, robotsTxt: false },
    ci: { reporter, budget: 80 },
  }))

  const { exitCode, stdout, stderr } = await runNode([ci, '--root', testDir, '--debug'], testDir)

  const logs = stdout + stderr
  if (exitCode !== 0)
    throw new Error(logs)

  const output = JSON.parse(await readFile(resolve(testDir, '.unlighthouse', 'ci-result.json'), 'utf8'))

  return {
    output,
    logs,
  }
}

async function runNode(args: string[], cwd: string): Promise<{ exitCode: number, stdout: string, stderr: string }> {
  const child = spawn('node', args, {
    cwd,
    env: { ...process.env, JITI_ESM_RESOLVE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => stdout += chunk)
  child.stderr.on('data', chunk => stderr += chunk)
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))
  })
  clearTimeout(timer)
  return { exitCode, stdout, stderr }
}
