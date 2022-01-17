import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
  entries: [
    { input: 'src/index' },
    // { input: 'src/frameworks/vitepress', name: 'vitepress' },
    // { input: 'src/frameworks/next', name: 'next' },
    // { input: '../@unlighthouse/types/index.d.ts', name: 'types' },
    { input: 'src/process', outDir: 'dist/process', builder: 'mkdist', declaration: false },
  ],
  externals: [
    'puppeteer',
    'unrouted',
    'node:net',
    'vite',
    'rollup',
    'webpack',
    '@nuxt/schema',
  ],
})
