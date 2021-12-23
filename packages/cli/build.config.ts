import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  clean: true,
  entries: [
    { input: 'src/ci' },
    { input: 'src/cli' },
  ],
})
