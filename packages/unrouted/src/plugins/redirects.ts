import { IncomingMessage, ServerResponse } from 'http'
import { promisifyHandle, sendRedirect } from 'h3'
import { UnroutedPlugin } from '../types'

export const redirects: UnroutedPlugin = (router) => {
  router.redirect = (route, location, code = 302) => {
    router.use('GET', route, promisifyHandle((req: IncomingMessage, res: ServerResponse) => sendRedirect(res, location, code)))
    return router
  }
  router.permanentRedirect = (route, location) => {
    router.use('GET', route, promisifyHandle((req: IncomingMessage, res: ServerResponse) => sendRedirect(res, location, 301)))
    return router
  }
}
