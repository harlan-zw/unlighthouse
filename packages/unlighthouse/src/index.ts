import { createUnplugin } from 'unplugin'
import { Options } from '@shared'

export default createUnplugin<Options>(options => ({
  name: 'unplugin-lighthouse',

  vite: {
    apply: 'serve',
    configureServer(server) {
    },
  },
}))
