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
    '@nuxt/schema',
  ],
})
