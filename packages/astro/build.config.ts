import { defineBuildConfig } from 'obuild/config'

// `astro` is a peer dep — we only consume its integration types, never its
// runtime, so it's external. `unlighthouse` is a workspace runtime dep
// loaded dynamically so the host project's installed copy wins.
const externals = [
  'astro',
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
