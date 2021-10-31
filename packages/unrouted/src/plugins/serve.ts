import { IncomingMessage } from 'http'
import sirv from 'sirv'
import { promisifyHandle } from 'h3'
import { withBase, withLeadingSlash, withTrailingSlash } from 'ufo'
import { UnroutedPlugin } from '../types'

export const serve: UnroutedPlugin = (router) => {
  router.serve = (path: string, dirname: string) => {
    path = withBase(path, router.prefix)
    path = withTrailingSlash(withLeadingSlash(path))
    router.hooks.callHook('serve:register', path, dirname)
    // @ts-ignore
    router.use('GET', `${path}*`, promisifyHandle((req, res) => {
      // we need to strip the path from the req.url for sirv to work
      req.url = req.url.replace(path, '') || '/'
      router.hooks.callHook(`serve:before-route:${req.url}`)

      sirv(dirname, {
        single: true,
        dev: true,
      })(req, res)
    }))
    return router
  }
}
