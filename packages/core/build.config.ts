import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  entries: [
    { input: 'src/index' },
    { input: 'src/process', outDir: 'dist/process', builder: 'mkdist', declaration: false },
  ],
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
