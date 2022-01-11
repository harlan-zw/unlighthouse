import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: false,
  clean: true,
  entries: [
    { input: 'src/ci' },
    { input: 'src/cli' },
  ],
})
