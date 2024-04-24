import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
    // puppeteer-cluster uses puppeteer, but we want to use puppeteer-core
    alias: {
      entries: {
        puppeteer: 'puppeteer-core',
      },
    },
    replace: {
      puppeteer: 'puppeteer-core',
    },
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
