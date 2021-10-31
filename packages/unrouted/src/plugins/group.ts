import { UnroutedPlugin } from '../types'

export const group: UnroutedPlugin = (router) => {
  // @ts-ignore
  router.group = (prefix, cb) => {
    const currentPrefix = router.prefix
    // avoid duplicate slashes
    if (currentPrefix.endsWith('/') && prefix.startsWith('/'))
      prefix = prefix.substring(1)

    // append prefix
    router.prefix = currentPrefix + prefix
    cb(router)
    // reset prefix
    router.prefix = currentPrefix
    return router
  }
}
