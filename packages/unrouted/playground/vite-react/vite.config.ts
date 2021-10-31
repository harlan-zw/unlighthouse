import { defineConfig } from 'vite'
import reactRefresh from '@vitejs/plugin-react-refresh'
import { createRouterBase, group, redirects, serve } from '../../src'

const setupApi = () => ({
  name: 'setup-api',
  // @ts-ignore
  configureServer(server) {
    const api = createRouterBase({
      plugins: [
        group,
        redirects,
        serve,
      ],
      prefix: '/__api',
    })
    api.get('greeting', 'hello world')
    server.middlewares.use(api.handle)
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [reactRefresh(), setupApi()],

})
