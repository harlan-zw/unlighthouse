import { basename } from 'path'
import { $URL, withBase, withLeadingSlash } from 'ufo'
import { NormalisedRoute } from '@shared'
import {hashPathName, trimSlashes} from '../core/util'
import { useUnlighthouseEngine } from '../core/engine'

export const normaliseRoute = (url: string): NormalisedRoute => {
  const { resolvedConfig, mockRouter: router, runtimeSettings } = useUnlighthouseEngine()

  url = withBase(url, resolvedConfig.host)

  const $url = new $URL(url)
  // make sure we start with a leading slash
  const path = withLeadingSlash($url.pathname)

  let normalised: Partial<NormalisedRoute> = {
    id: hashPathName(path),
    url,
    $url,
    path,
  }

  // if a router is provided
  if (runtimeSettings.hasRouteDefinitions && router) {
    const definition = router.match(path)
    // if a route definition is found
    if (definition) {
      // add extra meta data from the definition
      normalised = {
        ...normalised,
        definition: {
          ...definition,
          componentBaseName: basename(definition.component || ''),
        },
      }
    }
  } else {
    // we'll create them a runtime route definition based on the URL
    const parts = trimSlashes(path)
        .split('/')
    let name: string
    if (path === '/') {
      name = 'index'
    } else if (parts.length > 1) {
      name = parts
          .map((val, i) => {
            if (i >= parts.length - 1) {
              return 'slug'
            }
            return val
          })
          .join('-')
    } else {
      name = trimSlashes(path)
    }
    normalised = {
      ...normalised,
      definition: {
        name,
        path,
      }
    }
  }

  // make sure we sort the home page first
  if (normalised?.definition?.name === 'index') {
    normalised.definition.name = '_index'
  }

  return normalised as NormalisedRoute
}
