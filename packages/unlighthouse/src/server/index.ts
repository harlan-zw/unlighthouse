import { IncomingMessage } from 'http'
import { Socket } from 'node:net'
import fs from 'fs-extra'
import { createApp } from 'h3'
import { listen } from 'listhen'
import defu from 'defu'
import { CliOptions } from '@shared'
import { createEngine } from '../core'
import { extractSitemapRoutes } from '../util/sitemap'
import {hasProtocol, withoutTrailingSlash} from "ufo";

const startServer = async(options: CliOptions) => {
  options = defu(options, {}) as CliOptions

  // normalise host
  options.host = withoutTrailingSlash(options.host)
  if (!hasProtocol(options.host)) {
    options.host = 'https://' + options.host
  }

  const app = createApp()

  const { api, start, ws } = await createEngine({
    routeDefinitions() {
      if (options.appPath)
        return fs.readJsonSync(`${options.appPath}/.nuxt/routes.json`)
    },
    async urls() {
      return await extractSitemapRoutes(options.host)
    },
  }, options)

  app.use(api)

  const server = await listen(app, {
    open: options.open,
  })

  await start(server.url)

  server.server.on('upgrade', (request: IncomingMessage, socket) => {
    ws.handleUpgrade(request, socket as Socket)
  })
}

export { startServer }
