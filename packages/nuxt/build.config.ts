import { defineBuildConfig } from 'obuild/config'

// `nuxt` is a peer dep supplied by the host project; `unlighthouse` is a
// workspace runtime dep loaded dynamically. Keep both external so the
// module bundle stays tiny and the host project's installed copies win at
// resolution time. `@nuxt/kit` would be external too if we imported from
// it — we currently don't (see `src/module.ts` for rationale), but listed
// here for forward compatibility when the dev-mode HUD lands.
const externals = [
  'nuxt',
  '@nuxt/kit',
  '@nuxt/schema',
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
      input: ['./src/module.ts'],
      rolldown: { external: externals },
    },
  ],
})
