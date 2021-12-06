import { UserConfig } from 'unlighthouse-utils'
import { createUnlighthouse, useUnlighthouse } from '../core/unlighthouse'
import { createServer } from '../core/server'
import { createMockVueRouter } from '../router/mockVueRouter'

type NextApp = { dev: boolean; isServer: boolean; dir: string; config: { distDir: string; pageExtensions: string[] }}

export default function withUnlighthouse(userConfig: UserConfig, { config: webpackConfig, app }: {config: any; app: NextApp}) {
  // only server
  if (webpackConfig.name !== 'server')
    return

  const unlighthouse = useUnlighthouse()
  // has already been booted, possibly nuxt
  if (unlighthouse)
    return {}

  // dev/server only
  if (!app.dev || !app.isServer)
    return {}

  const portGuess = (process.env.PORT && parseInt(process.env.PORT)) || 3000
  const host = `http://localhost:${portGuess}`

  createUnlighthouse({
    ...userConfig,
    host,
    root: app.dir,
    debug: true,
    discovery: {
      pagesDir: webpackConfig.resolve.alias['private-next-pages'],
      supportedExtensions: app.config.pageExtensions,
    },
  }, {
    name: 'next',
    mockRouter: (routeDefinitions) => {
      return createMockVueRouter(routeDefinitions)
    },
  }).then(async(unlighthouse) => {
    const { server, app } = await createServer()
    unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  })

  return {}
}
