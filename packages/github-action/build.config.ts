import { defineBuildConfig } from 'obuild/config'

// `unlighthouse` ships its own CLI bin which we exec at runtime, so keep it
// external — the action consumer's installed copy resolves it. Node builtins
// stay external for the same reason as `@unlighthouse/vite`.
const externals = [
  'unlighthouse',
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
