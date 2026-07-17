import { defineBuildConfig } from 'obuild/config'

// Keep platform and workspace contracts external so each explicit subpath
// preserves its boundary and the declaration emitter does not inline them.
const externals = [
  '@cloudflare/workers-types',
  'h3',
  '@unlighthouse/contracts',
  '@unlighthouse/contracts/drizzle',
  '@unlighthouse/contracts/ports',
  '@unlighthouse/core',
  '@unlighthouse/core/runtime',
  '@unlighthouse/core/crawlers/parallel-map',
  '@unlighthouse/core/seeds',
  '@unlighthouse/core/seeds/sitemap-parser',
  '@unlighthouse/core/storage/drizzle',
  'cloudflare:workers',
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts'],
      rolldown: { external: externals },
    },
    // Worker-side transport for the scan-scoped Lighthouse container. It uses
    // core's remote adapter and must remain free of Node/Lighthouse imports.
    {
      type: 'bundle',
      input: ['./src/auditors/container.ts'],
      rolldown: { external: [...externals, '@unlighthouse/core/auditors/remote-lighthouse'] },
    },
    {
      type: 'bundle',
      input: [
        './src/do/index.ts',
        './src/scan-events-emit.ts',
        './src/seeds/index.ts',
        './src/storage/d1-r2.ts',
      ],
      rolldown: { external: externals },
    },
    {
      type: 'bundle',
      input: ['./src/workflows/scan.ts'],
      rolldown: { external: externals },
    },
  ],
})
