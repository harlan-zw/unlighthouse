import { defineBuildConfig } from 'obuild/config'

// `next` is a peer dep; `unlighthouse` is a workspace runtime dep loaded
// dynamically. Keep both external so the plugin bundle stays tiny and the
// host project's installed copy wins at resolution time.
const externals = [
  'next',
  'unlighthouse',
  'node:fs',
  'node:path',
  'node:url',
  'node:child_process',
  'node:process',
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts', './src/cli.ts'],
      rolldown: { external: externals },
    },
  ],
})
