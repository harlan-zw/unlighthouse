import { basename } from 'path'
import { $URL } from 'ufo'
import { NormalisedRoute, MockRouter } from '@shared'
import { hashPathName } from '../core'

export const normaliseRoute = (url: string, router?: MockRouter): NormalisedRoute|false => {
  const $url = new $URL(url)
  const path = $url.pathname

  let normalised : NormalisedRoute = {
    id: hashPathName(path),
    url,
    $url,
    path,
  }

  // if a router is provided
  if (router) {
    const definition = router.match(path)
    // if a route definition is found
    if (definition) {
      const dynamic = definition.path !== path
      // add extra meta data from the definition
      normalised = {
        ...normalised,
        definition: {
          ...definition,
          componentBaseName: basename(definition.component),
        },
        dynamic,
        static: !dynamic,
      }
    }
  }

  return normalised
}
