import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { decompressLhr } from '@unlighthouse/core/report'
import { createUnlighthouseHost } from 'unlighthouse'

// Exercise the built public package and real Chrome, rather than workspace test aliases.
const output = process.env.SMOKE_OUTPUT
assert(output, 'Set SMOKE_OUTPUT to the smoke test directory.')
await mkdir(output, { recursive: true, mode: 0o700 })
const mode = process.argv[2]
assert(mode === 'cold' || mode === 'offline', 'Choose cold or offline mode.')
const artifact = mode === 'cold'
  ? await readFile(process.argv[3] || assert.fail('Cold mode needs an artifact path.'))
  : undefined
let downloads = 0
const server = createServer((request, response) => {
  if (request.url === '/runtime.tgz') {
    assert(artifact, 'Offline mode must not request the runtime.')
    downloads++
    response.end(artifact)
    return
  }
  response.setHeader('content-type', 'text/html')
  response.end('<!doctype html><html lang="en"><head><title>Runtime smoke</title><meta name="viewport" content="width=device-width"></head><body><main><h1>Runtime smoke</h1><p>Audit fixture.</p></main></body></html>')
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const root = join(output, `scan-${mode}`)
await mkdir(root, { recursive: true })
const started = performance.now()
try {
  const host = await createUnlighthouseHost({
    userConfig: {
      site: `http://127.0.0.1:${address.port}`,
      root,
      outputPath: root,
      cache: false,
      chrome: { useSystem: false, downloadFallbackCacheDir: join(output, 'chrome') },
      lighthouseOptions: { locale: 'fr' },
      scanner: { samples: 1, maxRoutes: 1, crawler: true, sitemap: false },
    },
    behavior: { ws: null },
    env: {
      ...process.env,
      CHROME_PATH: '',
      UNLIGHTHOUSE_RUNTIME_CACHE: join(output, 'runtime'),
      UNLIGHTHOUSE_RUNTIME_URL: mode === 'offline'
        ? 'http://127.0.0.1:9/unavailable.tgz'
        : `http://127.0.0.1:${address.port}/runtime.tgz`,
    },
  })
  const session = await host.start({ device: ['mobile', 'desktop'] })
  const result = await session.done
  assert.equal(result.summary.completed, 2)
  assert.equal(result.summary.failed, 0)
  assert.equal(downloads, mode === 'cold' ? 1 : 0)
  const { items } = await host.handlerCtx.storage.routes.listForScan(session.scanId, { pageSize: 10 })
  assert.deepEqual(items.map(item => item.device).sort(), ['desktop', 'mobile'])
  const reports = []
  for (const item of items) {
    assert(item.lhrBlobKey)
    const blob = await host.handlerCtx.storage.blobs.get(item.lhrBlobKey)
    assert(blob)
    const report = decompressLhr(blob)
    assert(report.lighthouseVersion)
    const { performance, accessibility } = report.categories
    assert(performance && accessibility)
    assert.equal(performance.title, 'Performance')
    assert.equal(typeof performance.score, 'number')
    assert.equal(typeof accessibility.score, 'number')
    reports.push({ device: item.device, lighthouseVersion: report.lighthouseVersion, score: performance.score })
  }
  const evidence = { node: process.version, platform: process.platform, mode, downloads, elapsedMs: performance.now() - started, summary: result.summary, reports }
  await writeFile(join(output, `smoke-${mode}.json`), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence, null, 2))
}
finally {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
process.exit(0)
