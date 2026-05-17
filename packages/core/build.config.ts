import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: [
        './src/index.ts',
        './src/report/index.ts',
        './src/comparison/index.ts',
        './src/seeds/index.ts',
        './src/policies/index.ts',
        './src/crawlers/index.ts',
        './src/auditors/index.ts',
        // Per-auditor subpath bundles so treeshake-sensitive hosts (Workers
        // CF bundle, browser-only consumers) can import a single adapter
        // without dragging the rest of the barrel — which would also pull
        // in `auditors/local` and its transitive `lighthouse` dependency,
        // breaking the Worker bundle with a Node-only `fileURLToPath` call.
        './src/auditors/mock.ts',
        './src/auditors/cdp-connect.ts',
        './src/auditors/crux.ts',
        './src/auditors/psi.ts',
        './src/auditors/route/index.ts',
        './src/storage/index.ts',
        './src/storage/drizzle/index.ts',
        './src/storage/drizzle/init-sql.ts',
        './src/util/fetch.ts',
        './src/util/filter.ts',
        './src/util/progressBox.ts',
        './src/util/misc.ts',
        './src/storage/memory/index.ts',
        './src/storage/unstorage-blobs/index.ts',
        './src/api/index.ts',
        './src/api/client.ts',
        './src/api/http.ts',
        './src/api/handlers/index.ts',
        './src/api/dashboard.ts',
        './src/packs/index.ts',
        './src/auditors/local-worker.ts',
        './src/util/path.ts',
        './src/util/git-meta.ts',
        './src/core.ts',
      ],
    },
    // Migration SQL is shipped as static assets via package.json `files`.
    // No subpath export — users read them via fs / drizzle migrator.
  ],
})
// Note on the tinypool worker entry (`auditors/local-worker.ts`):
// stub-mode produces a `.mjs` that re-exports the `.ts` source, which doesn't
// survive the loader handoff when tinypool spawns a fresh worker process.
// `scripts/build-worker.mjs` overwrites the stubbed worker file with a real
// rolldown bundle after `pnpm stub` runs, so dev workers have a real ESM
// artifact. The production `obuild` build emits the same path directly.
