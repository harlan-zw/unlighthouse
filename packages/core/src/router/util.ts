import { basename } from 'path'
import { $URL, hasProtocol, isRelative, withBase, withLeadingSlash } from 'ufo'
import type { NormalisedRoute } from '../types'
import { hashPathName, trimSlashes } from '../util'
import { useUnlighthouse } from '../unlighthouse'

export const isScanOrigin = (url: string): boolean => {
  if (isRelative(url) || (url.startsWith('/') && !url.startsWith('//')))
    return true

  const { runtimeSettings } = useUnlighthouse()

  const $url = new $URL(url)
  return $url.hostname === runtimeSettings.siteUrl.hostname
}

/**
 * Due to working with routes from all different frameworks or no framework, we need to do some magic to
 * have all routes make sense to unlighthouse.
 *
 * @param url
 */
export const normaliseRoute = (url: string): NormalisedRoute => {
  const { runtimeSettings, provider, resolvedConfig } = useUnlighthouse()

  // it's possible that we're serving a subdomain or something dodgy around www.
  if (!hasProtocol(url)) {
    // need to provide the host URL if the link is relative
    url = withBase(url, runtimeSettings.siteUrl.origin)
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

  // check our custom sampling first
  for (const matcher in resolvedConfig.scanner.customSampling) {
    if (!(new RegExp(matcher).test(path)))
      continue

    const definition = resolvedConfig.scanner.customSampling[matcher]
    normalised = {
      ...normalised,
      definition: {
        ...definition,
        path,
        componentBaseName: basename(definition.component || ''),
      },
    }
    break
  }

  // if a router is provided
  if (!normalised.definition && provider.mockRouter && typeof provider.mockRouter !== 'function') {
    const definition = provider.mockRouter.match(path)
    // if a route definition is found
    if (definition) {
      // nuxt 3
      if (definition.file && !definition.component)
        definition.component = definition.file

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
