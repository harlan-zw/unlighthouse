import type { NormalisedRoute, ResolvedUserConfig } from '@unlighthouse/contracts'
import { basename } from 'node:path'
import { hasProtocol, isRelative, withBase, withLeadingSlash } from 'ufo'
import { hashPathName, trimSlashes } from '../util/path'

export interface NormaliseRouteDeps {
  siteUrl: URL
  resolvedConfig: ResolvedUserConfig
}

export function isScanOrigin(deps: { siteUrl: URL }, url: string): boolean {
  if (isRelative(url) || (url.startsWith('/') && !url.startsWith('//')))
    return true

  const $url = new URL(url)
  if ($url.hostname === deps.siteUrl.hostname)
    return true
  // allow subdomains
  return $url.hostname.endsWith(`.${deps.siteUrl.hostname}`)
}

/**
 * Due to working with routes from all different frameworks or no framework, we need to do some magic to
 * have all routes make sense to unlighthouse.
 */
export function normaliseRoute(deps: NormaliseRouteDeps, url: string): NormalisedRoute {
  const { siteUrl, resolvedConfig } = deps

  // it's possible that we're serving a subdomain or something dodgy around www.
  if (!hasProtocol(url)) {
    // need to provide the host URL if the link is relative
    url = withBase(url, siteUrl.origin)
  }

  const $url = new URL(url)
  const hash = $url.hash.startsWith('#/') ? $url.hash : ''
  // make sure we start with a leading slash
  const path = `${withLeadingSlash($url.pathname)}${hash}${$url.search}`

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

  // v1: no route-definition matcher. Build a runtime route definition from the URL.
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
