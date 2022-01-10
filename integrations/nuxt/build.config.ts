import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
  ],
  rollup: {
    emitCJS: false,
  },
  clean: true,
  declaration: true,
  externals: [
    '@nuxt/kit',
    '@nuxt/schema',
    'pathe',
    'consola',
    'hash-sum',
    'unctx'
  ],
})
