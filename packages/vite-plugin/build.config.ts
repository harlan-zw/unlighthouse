import { defineBuildConfig } from 'obuild/config'

// `vite` is a peer dep; `unlighthouse` is a workspace runtime dep loaded
// dynamically. Keep both external so the plugin bundle stays tiny and the
// host project's installed copy wins at resolution time.
const externals = [
  'vite',
  'unlighthouse',
  'node:fs',
  'node:path',
  'node:url',
  'node:http',
  'node:net',
]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts'],
      rolldown: { external: externals },
    },
  ],
})
