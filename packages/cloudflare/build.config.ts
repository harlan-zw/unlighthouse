import { defineBuildConfig } from 'obuild/config'

// `@cloudflare/workers-types` is `///<reference />` shaped — its named
// exports (D1Database, R2Bucket, …) only become visible when the type
// reference is in scope, not when bundled into a dts artifact. Keep it
// external + h3/h3 utils + workspace packages so the dts emitter can
// reference them by name without trying to inline their internals.
const externals = [
  '@cloudflare/workers-types',
  '@cloudflare/puppeteer',
  'h3',
  '@unlighthouse/contracts',
  '@unlighthouse/contracts/drizzle',
  '@unlighthouse/contracts/ports',
  '@unlighthouse/core',
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts'],
      rolldown: { external: externals },
    },
    // Browser Rendering auditor lives on its own subpath so a Worker
    // bundle that imports the main `@unlighthouse/cloudflare` entry
    // doesn't pull the lighthouse package in transitively. Operators
    // who want the real auditor import this subpath explicitly and pass
    // the factory to createCloudflareApp via opts.auditorFactory.
    {
      type: 'bundle',
      input: ['./src/auditors/browser-rendering.ts'],
      rolldown: { external: [...externals, '@unlighthouse/core/auditors/cdp-connect'] },
    },
  ],
})
