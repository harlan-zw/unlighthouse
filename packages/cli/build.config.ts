import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: false,
  clean: true,
  rollup: {
    emitCJS: true,
  },
  entries: [
    { input: 'src/ci' },
    { input: 'src/cli' },
  ],
})
