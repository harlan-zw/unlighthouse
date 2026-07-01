import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { withWebMcpChromeFlag } from '../packages/core/src/auditors/categories'

function discoverChrome(): string | null {
  const envPath = process.env.CHROME_PATH || process.env.CHROME_BIN
  if (envPath && existsSync(envPath))
    return envPath

  const result = spawnSync('sh', ['-lc', [
    'command -v google-chrome-stable',
    'command -v google-chrome',
    'command -v chromium',
    'command -v chromium-browser',
  ].join(' || ')], { encoding: 'utf8' })

  const path = result.stdout.trim().split('\n')[0]
  return result.status === 0 && path ? path : null
}

const chromePath = process.env.UNLIGHTHOUSE_AGENTIC_SMOKE === '1'
  ? discoverChrome()
  : null

const describeSmoke = chromePath ? describe : describe.skip

describeSmoke('Lighthouse 13 agentic browsing smoke', () => {
  it('runs the agentic-browsing category against a local page', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/llms.txt') {
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end('# Example\n\n> Agent-readable site notes.\n')
        return
      }

      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(`<!doctype html>
<html lang="en">
  <head><title>Agentic Smoke</title></head>
  <body>
    <main>
      <h1>Agentic Smoke</h1>
      <form action="/search" toolname="site_search" tooldescription="Searches the example site">
        <label>Search <input name="q" autocomplete="off" toolparamdescription="The search query"></label>
        <button type="submit">Search</button>
      </form>
    </main>
  </body>
</html>`)
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    let chrome: { port: number, kill: () => Promise<void> | void } | null = null
    try {
      const [{ launch }, lighthouseModule] = await Promise.all([
        import('../packages/core/node_modules/chrome-launcher/dist/index.js'),
        import('../packages/core/node_modules/lighthouse/core/index.js'),
      ])
      chrome = await launch({
        chromePath: chromePath!,
        chromeFlags: withWebMcpChromeFlag(['--headless', '--no-sandbox']),
      })
      const port = (server.address() as AddressInfo).port
      const result = await lighthouseModule.default(`http://127.0.0.1:${port}/`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['agentic-browsing'],
      })

      const category = result?.lhr?.categories?.['agentic-browsing']
      const auditIds = category?.auditRefs?.map((ref: { id: string }) => ref.id) ?? []
      expect(category).toBeDefined()
      expect(category?.categoryScoreDisplayMode).toBe('fraction')
      expect(auditIds).toContain('llms-txt')
      expect(auditIds).toContain('webmcp-form-coverage')
    }
    finally {
      if (chrome)
        await Promise.resolve(chrome.kill())
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err)
            reject(err)
          else
            resolve()
        })
      })
    }
  }, 120_000)
})
