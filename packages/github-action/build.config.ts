import { defineBuildConfig } from 'obuild/config'

// The action shells out through `npx --package unlighthouse@<version>` at
// runtime. Node builtins stay external for the same reason as `@unlighthouse/vite`.
const externals = [
  'node:child_process',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'node:os',
  'node:process',
  'node:url',
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts', './src/main.ts'],
      rolldown: { external: externals },
    },
  ],
})
