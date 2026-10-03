import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'rolldown'
import { expect, it } from 'vitest'

it('runs the published offline client without Node globals', async () => {
  const entry = resolve('packages/ui/browser-client-fixture.ts')
  const result = await build({
    input: entry,
    platform: 'browser',
    plugins: [{
      name: 'browser-client-fixture',
      resolveId(id) {
        return id === entry ? id : undefined
      },
      load(id) {
        if (id !== entry)
          return undefined
        return 'export { createStaticClient } from "@unlighthouse/core/api/static-client"'
      },
    }],
    external: ['node:module', 'module'],
    output: { format: 'iife', name: 'BrowserClient', globals: { 'node:module': 'nodeModule', 'module': 'nodeModule' } },
    write: false,
  })
  const chunk = result.output.find(output => output.type === 'chunk')
  if (!chunk || chunk.type !== 'chunk')
    throw new Error('Browser client bundle is missing.')
  const context = { nodeModule: {}, TextEncoder, TextDecoder, URL, console }
  runInNewContext(chunk.code, context)
  const client = (context as typeof context & { BrowserClient: { createStaticClient: (snapshot: unknown) => Record<string, (input: unknown) => Promise<unknown>> } }).BrowserClient.createStaticClient({
    scans: [], routes: [], blobs: {}, packRuns: [], sites: [], config: {}, version: 'browser-fixture',
  })
  await expect(client['history.list']({})).resolves.toMatchObject({ items: [], total: 0 })
})
