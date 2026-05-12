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
        './src/storage/drizzle/index.ts',
        './src/api/index.ts',
      ],
    },
  ],
})
