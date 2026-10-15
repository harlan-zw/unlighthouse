import { join } from 'node:path'
import { runFlow } from '../../src/audit/flow.ts'
import { CATEGORIES } from '../../src/types.ts'
import { serveFlowApp } from './flow-app.ts'

const app = serveFlowApp()
try {
  const result = await runFlow({
    name: 'search',
    module: join(import.meta.dir, '../../examples/flows/search.ts'),
    url: `${app.origin}/`,
    device: 'mobile',
    categories: [...CATEGORIES],
    throttling: 'simulate',
    timeoutMs: 180_000,
    chromeFlags: [],
    auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
  })
  const flow = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(result.report))))
  for (const step of flow.steps) {
    delete step.lhr.fullPageScreenshot
    for (const id of ['screenshot-thumbnails', 'final-screenshot']) {
      if (step.lhr.audits[id])
        delete step.lhr.audits[id].details
    }
  }
  const out = join(import.meta.dir, 'flow-result.json.gz')
  const bytes = Bun.gzipSync(JSON.stringify(flow))
  await Bun.write(out, bytes)
  console.log(`wrote ${out} (${bytes.length} bytes)`)
}
finally {
  app.stop()
}
