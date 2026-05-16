import { defineBuildConfig } from 'obuild/config'

// dts emission is on so the published package ships .d.mts alongside .mjs.
// Workspace dev resolves types from src/ via tsconfig path aliases, but npm
// consumers need real declarations in dist/ — without them, publint flags
// the package and attw refuses to grade it.
//
// `external` keeps lighthouse + puppeteer + their transitive deps out of
// both the JS bundle and the dts bundle. Otherwise rolldown-plugin-dts
// tries to inline every type imported from them and stumbles on
// third-party-web's CJS/ESM mismatch (re-exported via @paulirish/trace_engine).
// At the contract layer all we need is reference-by-name; consumers install
// the real types themselves.
const externals = [
  'lighthouse',
  'lighthouse/types/lhr/lhr',
  'puppeteer-core',
  'chrome-launcher',
  'listhen',
  'ufo',
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
      input: ['./src/drizzle/index.ts'],
      outDir: './dist',
      rolldown: { external: externals },
    },
  ],
})
