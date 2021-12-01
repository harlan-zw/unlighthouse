import { createApp } from 'h3'
import { listen } from 'listhen'
import { useUnlighthouse } from './unlighthouse'

export const createServer = async() => {
  const { resolvedConfig } = useUnlighthouse()

  const app = createApp()
  const server = await listen(app, {
    ...resolvedConfig.server,
    // delay opening the server until the app is ready
    open: false,
  })
  return { app, server }
}
