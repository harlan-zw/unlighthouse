import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
  entries: [
    { input: 'src/index' },
    { input: 'src/process', outDir: 'dist/process', builder: 'mkdist', declaration: false },
  ],
  // Note: lodash-es is inlined on purpose
  externals: [
    '@unrouted/core',
    'h3',
    'radix3',
    'puppeteer',
    'node:net',
    'vite',
    'rollup',
    'webpack',
    '@nuxt/schema',
  ],
})
