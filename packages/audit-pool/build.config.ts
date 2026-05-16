import { defineBuildConfig } from 'obuild/config'

// dts emission on so the published package ships .d.mts alongside .mjs.
// `external` keeps puppeteer / lighthouse and friends out of both bundles
// — same reasoning as packages/contracts: rolldown-plugin-dts trips on
// third-party-web's CJS/ESM mismatch when it tries to inline those types.
const externals = [
  'lighthouse',
  'puppeteer-core',
  'chrome-launcher',
  'third-party-web',
  /^@paulirish\//,
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts'],
      rolldown: { external: externals },
    },
    {
      type: 'bundle',
      input: ['./src/worker.ts'],
      rolldown: { external: externals },
    },
  ],
})
