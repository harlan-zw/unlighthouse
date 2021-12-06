import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  cjsBridge: true,
  emitCJS: true,
  entries: [
    // { input: 'src/index' },
    { input: 'src/process/lighthouse', name: 'process/lighthouse', declaration: false, format: 'esm', ext: 'ts' },
    { input: 'src/cli' },
    { input: 'src/vite', },
    { input: 'src/webpack', },
    { input: 'src/rollup', },
    { input: 'src/core/defineConfig', name: 'config' },
    { input: 'src/core/unlighthouse', name: 'index' },
    { input: 'src/frameworks/nuxt', name: 'nuxt' },
    { input: 'src/frameworks/vitepress', name: 'vitepress' },
    { input: 'src/frameworks/next', name: 'next' },
    { input: '../unlighthouse-utils/index.d.ts', name: 'types' },
  ],
  clean: false,
  externals: [
    'unrouted',
    'node:net',
    'vite',
    'rollup',
    'webpack',
    '@nuxt/schema'
  ],
})
