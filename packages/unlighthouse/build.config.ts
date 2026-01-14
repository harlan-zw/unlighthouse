import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/providers/local',
    'src/providers/browserless',
    'src/providers/psi',
    'src/providers/mock',
  ],
  declaration: true,
  rollup: {
    emitCJS: false,
  },
  externals: [
    'lighthouse',
  ],
})
