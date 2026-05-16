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
  ],
})
