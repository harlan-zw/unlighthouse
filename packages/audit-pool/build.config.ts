import { defineBuildConfig } from 'obuild/config'

// Build each public entry as its own self-contained bundle. The two entries
// (`.` and `./worker`) share `./define`; tsdown extracted that into a
// `define-<hash>` chunk whose `.d.mts` and `.mjs` hashes diverged, so the
// generated `.d.mts` imported a `.mjs` that didn't exist — which breaks type
// resolution and crashes `attw`. Separate obuild bundles inline the shared
// (pure factory) code into each entry instead, so there is no shared chunk.
//
// Runtime deps stay external so the artifact stays a thin library (consumers
// resolve them); mirrors the old tsdown `deps.neverBundle` set.
const external = [
  'consola',
  'hookable',
  'tinypool',
  'puppeteer-core',
  'lighthouse',
  'chrome-launcher',
  'third-party-web',
  /^@paulirish\//,
  /^node:/,
]

export default defineBuildConfig({
  entries: [
    { type: 'bundle', input: ['./src/index.ts'], rolldown: { external } },
    { type: 'bundle', input: ['./src/worker.ts'], rolldown: { external } },
  ],
})
