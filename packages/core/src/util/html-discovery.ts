import type { ElementNode, Node } from '@mdream/js'
import { ELEMENT_NODE, NodeEventEnter } from '@mdream/js'
import { parseHtml } from '@mdream/js/parse'
import { normaliseUrl } from './i18n'

const ASSET_EXT_RE = /\.(?:css|js|mjs|json|xml|txt|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip|gz|map)(?:$|\?)/i
const CLOUDFLARE_INFRA_PATH_RE = /^\/cdn-cgi(?:\/|$)/i

export interface PageDiscoveryInput {
  html: string
  pageUrl: string
  siteUrl: string
}

export interface PageDiscoveryResult {
  links: string[]
  pageIndexable: boolean
  cloudflareTrapLinks: number
  malformedLinks: Array<{ href: string, error: unknown }>
}

function isElementNode(node: Node): node is ElementNode {
  return node.type === ELEMENT_NODE && 'name' in node && 'attributes' in node
}

function robotsTokens(content: string | undefined): Set<string> {
  return new Set((content ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean))
}

/** Parse homepage discovery signals once for local and edge scan runtimes. */
export function extractPageDiscovery(input: PageDiscoveryInput): PageDiscoveryResult {
  const { events } = parseHtml(input.html)
  const anchors: Array<{ href: string, rel: Set<string> }> = []
  const pageRobots = new Set<string>()

  for (const event of events) {
    if (event.type !== NodeEventEnter || !isElementNode(event.node))
      continue
    const name = event.node.name.toLowerCase()
    if (name === 'meta' && event.node.attributes.name?.toLowerCase() === 'robots') {
      for (const token of robotsTokens(event.node.attributes.content))
        pageRobots.add(token)
      continue
    }
    if (name === 'a' && event.node.attributes.href) {
      anchors.push({
        href: event.node.attributes.href.trim(),
        rel: robotsTokens(event.node.attributes.rel),
      })
    }
  }

  const pageIndexable = !pageRobots.has('noindex') && !pageRobots.has('none')
  const pageFollowable = !pageRobots.has('nofollow') && !pageRobots.has('none')
  const origin = new URL(input.siteUrl).origin
  const links = new Set<string>()
  let cloudflareTrapLinks = 0
  const malformedLinks: Array<{ href: string, error: unknown }> = []

  if (pageFollowable) {
    for (const anchor of anchors) {
      if (!anchor.href || anchor.href.startsWith('#') || anchor.rel.has('nofollow'))
        continue
      try {
        const url = new URL(anchor.href, input.pageUrl)
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || ASSET_EXT_RE.test(url.pathname))
          continue
        if (CLOUDFLARE_INFRA_PATH_RE.test(url.pathname)) {
          cloudflareTrapLinks += 1
          continue
        }
        const normalized = normaliseUrl(url.toString())
        if (normalized)
          links.add(normalized)
      }
      catch (error) {
        malformedLinks.push({ href: anchor.href, error })
      }
    }
  }

  return { links: [...links], pageIndexable, cloudflareTrapLinks, malformedLinks }
}
