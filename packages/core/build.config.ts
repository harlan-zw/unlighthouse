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
    'listhen',
    'puppeteer',
    'puppeteer-core',
    'devtools-protocol',
    'puppeteer-cluster',
    'puppeteer-core',
    'lighthouse',
    '@unrouted/core',
    'h3',
    'radix3',
    'node:net',
    'vite',
    'rollup',
    'webpack',
    '@nuxt/schema',
  ],
})
