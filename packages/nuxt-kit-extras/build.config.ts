import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  emitCJS: true,
  cjsBridge: true,
  entries: [
    { input: 'src/index' },
  ],
})
