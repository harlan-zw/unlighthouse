import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
  ],
  rollup: {
    emitCJS: true,
  },
  clean: true,
  declaration: true,
  externals: [
    'vite',
    'esbuild',
    'postcss',
  ],
})
