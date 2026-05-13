import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    { type: 'bundle', input: ['./src/index.ts'], dts: false },
    { type: 'bundle', input: ['./src/drizzle/index.ts'], outDir: './dist', dts: false },
  ],
})
