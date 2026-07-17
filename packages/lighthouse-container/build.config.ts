import { defineBuildConfig } from 'obuild/config'

// `server.ts` is the import-safe HTTP module. `entry.ts` owns process/env and
// listener side effects for the OCI image. Lighthouse + Puppeteer stay external
// runtime dependencies installed into the final image.
const externals = [
  'h3',
  'lighthouse',
  'puppeteer-core',
  '@unlighthouse/contracts',
  '@unlighthouse/contracts/logging',
  '@unlighthouse/contracts/ports',
  '@unlighthouse/core/auditors/cdp-connect',
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/server.ts'],
      rolldown: { external: externals },
    },
    {
      type: 'bundle',
      input: ['./src/entry.ts'],
      rolldown: { external: externals },
    },
  ],
})
