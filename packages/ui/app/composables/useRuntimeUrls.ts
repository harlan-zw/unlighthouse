interface BrowserLocation {
  host: string
  origin: string
  protocol: string
}

interface EmbeddedRuntimeUrls {
  apiUrl?: string
  websocketUrl?: string
}

function rebaseEmbeddedUrl(
  embeddedUrl: string | undefined,
  location: BrowserLocation,
  protocol: string,
): string | null {
  if (!embeddedUrl || !location.host || location.origin === 'null')
    return null

  try {
    const parsed = new URL(embeddedUrl, location.origin)
    return `${protocol}//${location.host}${parsed.pathname}${parsed.search}${parsed.hash}`
  }
  catch {
    return null
  }
}

/**
 * Use the configured URL in standalone Nuxt development. Generated dashboards
 * carry the host's API path in payload.js; rebase that path onto the browser's
 * actual origin so reverse proxies, tunnels, and custom hostnames stay usable.
 */
export function resolveRuntimeApiUrl(
  configuredUrl: string,
  embedded: EmbeddedRuntimeUrls | undefined,
  location: BrowserLocation,
): string {
  return rebaseEmbeddedUrl(embedded?.apiUrl, location, location.protocol) ?? configuredUrl
}

export function resolveRuntimeWebsocketUrl(
  configuredUrl: string,
  embedded: EmbeddedRuntimeUrls | undefined,
  location: BrowserLocation,
  isStatic: boolean,
): string {
  if (isStatic)
    return ''
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return rebaseEmbeddedUrl(embedded?.websocketUrl, location, protocol) ?? configuredUrl
}

export function getRuntimeApiUrl(): string {
  const configuredUrl = useRuntimeConfig().public.unlighthouseApiUrl as string
  if (import.meta.server)
    return configuredUrl
  return resolveRuntimeApiUrl(configuredUrl, window.__unlighthouse_payload?.options, window.location)
}

export function getRuntimeWebsocketUrl(): string {
  const configuredUrl = useRuntimeConfig().public.unlighthouseWsUrl as string
  if (import.meta.server)
    return configuredUrl
  return resolveRuntimeWebsocketUrl(
    configuredUrl,
    window.__unlighthouse_payload?.options,
    window.location,
    Boolean(window.__unlighthouse_static),
  )
}
