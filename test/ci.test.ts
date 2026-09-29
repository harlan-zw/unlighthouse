import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { x } from 'tinyexec'

export const cacheDir = resolve(__dirname, '.cache')
export const ci = resolve(__dirname, '../packages/unlighthouse/bin/unlighthouse-ci.mjs')

// the Cookie header of every request to /session, to check which request paths carry it
const sessionCookies: (string | undefined)[] = []

// a two page site with no robots.txt or sitemap, so discovery falls back to the crawler
const fixtureSite = createServer((req, res) => {
  if (req.url === '/session')
    sessionCookies.push(req.headers.cookie)
  const pages: Record<string, string> = {
    '/': '<!doctype html><html lang="en"><head><title>Home</title></head><body><a href="/about">About</a></body></html>',
    '/about': '<!doctype html><html lang="en"><head><title>About</title></head><body><a href="/">Home</a></body></html>',
    '/session': '<!doctype html><html lang="en"><head><title>Session</title></head><body>Session</body></html>',
  }
  const page = pages[req.url || '']
  res.writeHead(page ? 200 : 404, { 'content-type': 'text/html' })
  res.end(page || 'Not found')
})
let fixtureUrl = ''

beforeAll(async () => {
  await rm(cacheDir, { recursive: true, force: true })
  await new Promise<void>(resolve => fixtureSite.listen(0, '127.0.0.1', resolve))
  fixtureUrl = `http://127.0.0.1:${(fixtureSite.address() as AddressInfo).port}`
})

afterAll(async () => {
  await rm(cacheDir, { recursive: true, force: true })
  fixtureSite.close()
})

describe('ci', () => {
  it('tests harlanzw.com', async () => {
    const { output } = await runCli(resolve(__dirname, 'fixtures/harlanzw.config.ts'))

    expect(output[0].path).toBeDefined()
    expect(output[0].score).toBeDefined()
  })

  it('tests harlanzw.com and generate json expanded', async () => {
    const { output } = await runCli(resolve(__dirname, 'fixtures/harlanzw-json-expanded.config.ts'))

    expect(output.summary).toBeDefined()
    expect(output.summary.score).toBeDefined()
    expect(output.metadata).toBeDefined()
    expect(output.routes[0].path).toBeDefined()
    expect(output.routes[0].score).toBeDefined()
    expect(output.routes[0].categories).toBeDefined()
  })

  it('refuses to clear an output path that holds other files', async () => {
    const projectDir = resolve(cacheDir, `project-${Date.now()}`)
    await mkdir(join(projectDir, 'src'), { recursive: true })
    await writeFile(join(projectDir, 'package.json'), '{}')

    const { exitCode, stdout, stderr } = await x('node', [ci, '--root', projectDir, '--site', 'harlanzw.com', '--output-path', '.'], {
      nodeOptions: { cwd: projectDir },
    })

    expect(exitCode).toBe(1)
    expect(stdout + stderr).toContain('not an unlighthouse output folder')
    expect((await readdir(projectDir)).sort()).toEqual(['package.json', 'src'])
  })
})

describe('scan lifecycle', () => {
  it('exits when include filters out every discovered route', async () => {
    const testDir = resolve(cacheDir, `include-${Date.now()}`)
    await mkdir(testDir, { recursive: true })

    const { exitCode, stdout, stderr } = await x('node', [ci, '--root', testDir, '--site', fixtureUrl, '--include-urls', '/about'], {
      nodeOptions: { cwd: testDir },
      timeout: 120_000,
    })

    expect(exitCode).toBe(1)
    expect(stdout + stderr).toContain('No routes left to scan')
  })

  it('sends cookies with the HTML inspection and the Lighthouse run', async () => {
    const testDir = resolve(cacheDir, `cookies-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
    sessionCookies.length = 0

    const { exitCode, stdout, stderr } = await x('node', [ci, '--root', testDir, '--site', fixtureUrl, '--urls', '/session', '--cookies', 'sid=abc=def'], {
      nodeOptions: { cwd: testDir },
      timeout: 180_000,
    })

    expect(exitCode, stdout + stderr).toBe(0)
    // one request from the HTML inspection, at least one from Lighthouse
    expect(sessionCookies.length).toBeGreaterThanOrEqual(2)
    expect(sessionCookies.every(cookie => cookie === 'sid=abc=def')).toBe(true)
  })

  it('sends a cookie only to the host it belongs to', async () => {
    const testDir = resolve(cacheDir, `cookie-scope-${Date.now()}`)
    await mkdir(testDir, { recursive: true })
    await writeFile(join(testDir, 'unlighthouse.config.ts'), `export default ${JSON.stringify({
      site: fixtureUrl,
      urls: ['/session'],
      cookies: [
        { name: 'sid', value: 'abc' },
        // collected from a single sign-on host, must never reach the scanned site
        { name: 'sso', value: 'secret', domain: 'sso.example.com', path: '/' },
      ],
    })}`)
    sessionCookies.length = 0

    const { exitCode, stdout, stderr } = await x('node', [ci, '--root', testDir], {
      nodeOptions: { cwd: testDir },
      timeout: 180_000,
    })

    expect(exitCode, stdout + stderr).toBe(0)
    expect(sessionCookies.length).toBeGreaterThanOrEqual(2)
    expect(sessionCookies).toEqual(sessionCookies.map(() => 'sid=abc'))
  })

  it('scans with the programmatic API and closes the cluster', async () => {
    const { createUnlighthouse } = await import('../packages/core/dist/index.mjs')
    const unlighthouse = await createUnlighthouse({
      root: cacheDir,
      site: fixtureUrl,
      urls: ['/'],
      outputPath: resolve(cacheDir, `programmatic-${Date.now()}`),
    })
    const finished = new Promise<void>(resolve => unlighthouse.hooks.hook('worker-finished', () => resolve()))
    await unlighthouse.start()
    await finished

    expect(unlighthouse.worker.reports().map(report => report.route.path)).toEqual(['/'])
    await expect(unlighthouse.worker.cluster.close()).resolves.toBeUndefined()
  })
})

async function runCli(configFileFixture: string) {
  const testDir = resolve(cacheDir, Date.now().toString())

  await mkdir(testDir, { recursive: true })

  const config = await readFile(configFileFixture, 'utf8')
  await writeFile(join(testDir, 'unlighthouse.config.ts'), config)

  const { exitCode, stdout, stderr } = await x('node', [ci, '--root', testDir, '--debug', '--site', 'harlanzw.com'], {
    nodeOptions: { cwd: testDir },
  })

  const logs = stdout + stderr
  if (exitCode !== 0)
    throw new Error(logs)

  const output = JSON.parse(await readFile(resolve(testDir, '.unlighthouse', 'ci-result.json'), 'utf-8'))

  return {
    output,
    logs,
  }
}
