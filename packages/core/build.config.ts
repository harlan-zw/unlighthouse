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
        // Tinypool worker entry; spawned by createLocalAuditor's audit-pool.
        './src/auditors/local-worker.ts',
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
        './src/util/path.ts',
        './src/core.ts',
      ],
    },
    // Migration SQL is shipped as static assets via package.json `files`.
    // No subpath export — users read them via fs / drizzle migrator.
  ],
})
