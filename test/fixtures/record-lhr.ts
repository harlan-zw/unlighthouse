import { join } from 'node:path'
import { createAuditPool } from '../../src/audit/pool.ts'
import { CATEGORIES } from '../../src/types.ts'
import { serveFixture } from './site.ts'

const site = serveFixture()
const pool = createAuditPool({ concurrency: 1, retries: 0 })
try {
  const result = await pool.run({
    url: `${site.origin}/`,
    device: 'mobile',
    categories: [...CATEGORIES],
    throttling: 'simulate',
    samples: 1,
    timeoutMs: 90_000,
    concurrency: 1,
    chromeFlags: [],
    auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
  })
  const out = join(import.meta.dir, 'lhr-mobile.json.gz')
  await Bun.write(out, result.report)
  console.log(`wrote ${out} (${result.report.length} bytes)`)
}
finally {
  await pool.close()
  site.stop()
}
