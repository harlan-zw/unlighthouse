import { basename } from 'path'
import { $URL, withBase, withLeadingSlash } from 'ufo'
import type { NormalisedRoute } from '../types'
import { hashPathName, trimSlashes } from '../util'
import { useUnlighthouse } from '../unlighthouse'

/**
 * Due to working with routes from all different frameworks or no framework, we need to do some magic to
 * have all routes make sense to unlighthouse.
 *
 * @param url
 */
export const normaliseRoute = (url: string): NormalisedRoute => {
  const { resolvedConfig, provider } = useUnlighthouse()

  // it's possible that we're serving a subdomain or something dodgy around www.
  if (!hasProtocol(url)) {
    url = withBase(url, resolvedConfig.host)
  }

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
  if (provider.mockRouter && typeof provider.mockRouter !== 'function') {
    const definition = provider.mockRouter.match(path)
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
  }
  // if there was no match we can try and
  if (!normalised.definition) {
    // we'll create them a runtime route definition based on the URL
    const parts = trimSlashes(path)
      .split('/')
    let name: string
    if (path === '/') {
      name = 'index'
    }
    else if (parts.length > 1) {
      name = parts
        .map((val, i) => {
          if (i >= parts.length - 1)
            return 'slug'

          return val
        })
        .join('-')
    }
    else {
      name = trimSlashes(path)
    }
    normalised = {
      ...normalised,
      definition: {
        name,
        path,
      },
    }
  }

  // make sure we sort the home page first
  if (normalised?.definition?.name === 'index')
    normalised.definition.name = '_index'

  return normalised as NormalisedRoute
}
