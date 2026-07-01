import type { Category } from '@unlighthouse/contracts/ports'

export const LIGHTHOUSE_DEFAULT_CATEGORIES = [
  'performance',
  'accessibility',
  'seo',
  'best-practices',
  'agentic-browsing',
] as const satisfies readonly Category[]

export const CDP_CONNECT_CATEGORIES = [
  'accessibility',
  'seo',
  'best-practices',
  'agentic-browsing',
] as const satisfies readonly Category[]

export const PSI_SUPPORTED_CATEGORIES = [
  'performance',
  'accessibility',
  'seo',
  'best-practices',
] as const satisfies readonly Category[]

export const WEBMCP_CHROME_FEATURE = 'DevToolsWebMCPSupport'
export const WEBMCP_ENABLE_FEATURE_FLAG = `--enable-features=${WEBMCP_CHROME_FEATURE}`

function splitFeatureFlag(flag: string, prefix: string): string[] | null {
  if (!flag.startsWith(prefix))
    return null
  return flag.slice(prefix.length).split(',').map(s => s.trim()).filter(Boolean)
}

function hasFeature(flags: readonly string[], prefix: string, feature: string): boolean {
  return flags.some(flag => splitFeatureFlag(flag, prefix)?.includes(feature))
}

export function withWebMcpChromeFlag(flags: readonly string[]): string[] {
  const out = [...flags]
  if (hasFeature(out, '--disable-features=', WEBMCP_CHROME_FEATURE))
    return out
  if (hasFeature(out, '--enable-features=', WEBMCP_CHROME_FEATURE))
    return out

  const enableIndex = out.findLastIndex(flag => flag.startsWith('--enable-features='))
  if (enableIndex >= 0) {
    const current = splitFeatureFlag(out[enableIndex]!, '--enable-features=') ?? []
    out[enableIndex] = `--enable-features=${[...current, WEBMCP_CHROME_FEATURE].join(',')}`
    return out
  }

  out.push(WEBMCP_ENABLE_FEATURE_FLAG)
  return out
}

export function unsupportedCategories(
  requested: readonly string[],
  supported: readonly string[],
): string[] {
  const supportedSet = new Set(supported)
  return requested.filter(category => !supportedSet.has(category))
}
