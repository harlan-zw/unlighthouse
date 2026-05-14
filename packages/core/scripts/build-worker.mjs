// Bundle the tinypool worker entry into a real .mjs alongside the stubbed
// dist tree. Worker processes spawned by tinypool don't carry the parent's
// jiti/tsx loader through reliably and don't survive a stub re-export to .ts,
// so the worker has to be a real ESM artifact even in dev. See v1.md /
// build.config.ts comments for the broader rationale.
//
// obuild's stub branch hardcodes outDir to `dist/` (rolldownBuild in
// node_modules/obuild/dist/_chunks/build.mjs) and clears outDir before every
// build, so `outDir: './dist-worker'` + `stub: false` on the entry doesn't
// help. We sidestep obuild entirely and call rolldown ourselves — no clean,
// just an overwrite of the stubbed `dist/auditors/local-worker.mjs`.

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { rolldown } from 'rolldown'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

const bundle = await rolldown({
  input: resolve(pkgDir, 'src/auditors/local-worker.ts'),
  platform: 'node',
  external: (id) => {
    // Treat anything that isn't a relative/absolute path as external.
    // The worker's runtime deps (chrome-launcher, lighthouse,
    // @unlighthouse/audit-pool/worker, etc.) resolve via node_modules.
    if (id.startsWith('.') || id.startsWith('/')) return false
    return true
  },
})

await bundle.write({
  file: resolve(pkgDir, 'dist/auditors/local-worker.mjs'),
  format: 'esm',
})

await bundle.close()
console.log('[build-worker] wrote dist/auditors/local-worker.mjs')
