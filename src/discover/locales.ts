import { compileTemplate, inferTemplates, segmentsOf } from './templates.ts'

export const X_DEFAULT = 'x-default'

const LOCALE = /^[a-z]{2,3}(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?$/
const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_](?:[a-z]{2}|[a-z]{4}|\d{3}))?$/i
const LOCALE_LABEL = /^[a-z]{2}(?:-[a-z]{2})?$/i

export function normalizeLocale(code: string): string | null {
  const value = code.trim().toLowerCase().replaceAll('_', '-')
  return LOCALE.test(value) ? value : null
}

export function primaryTag(locale: string): string {
  return locale.split('-')[0]!
}

export function localesMatch(a: string, b: string): boolean {
  if (a === b)
    return true
  return (!a.includes('-') || !b.includes('-')) && primaryTag(a) === primaryTag(b)
}

export function localeSegment(segment: string | undefined): string | null {
  return segment && LOCALE_SEGMENT.test(segment) ? normalizeLocale(segment) : null
}

export function firstSegment(path: string): string | undefined {
  return segmentsOf(path)[0]
}

export function stripFirstSegment(path: string): string {
  const rest = path.replace(/^\/[^/?]+/, '')
  return rest.startsWith('/') ? rest : `/${rest}`
}

function siteBase(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, '').split('.')
  return labels.length > 2 && LOCALE_LABEL.test(labels[0]!) ? labels.slice(1).join('.') : labels.join('.')
}

export function hostLocale(host: string): string | null {
  const label = host.split('.')[0]
  return host.split('.').length > 2 && label && LOCALE_LABEL.test(label) ? normalizeLocale(label) : null
}

export function isLocaleSibling(site: URL, url: URL): boolean {
  if (url.origin === site.origin || url.port !== site.port)
    return false
  if (url.protocol !== site.protocol && !(url.protocol === 'http:' && site.protocol === 'https:'))
    return false
  return hostLocale(url.hostname) !== null && siteBase(url.hostname) === siteBase(site.hostname)
}

export interface TemplateSource {
  path: string
  prefix: string | null
}

export function templateKey(page: TemplateSource, collapse: boolean): string {
  return collapse && page.prefix ? stripFirstSegment(page.path) : page.path
}

export function localeTemplates(pages: readonly TemplateSource[], known: readonly string[], collapse: boolean): string[] {
  const matchers = known.map(pattern => ({ pattern, match: compileTemplate(pattern) }))
  const keys = pages.map(page => templateKey(page, collapse))
  const out: Array<string | null> = pages.map((page, i) => {
    const hit = matchers.find(matcher => matcher.match(segmentsOf(page.path)) || matcher.match(segmentsOf(keys[i]!)))
    return hit ? hit.pattern : null
  })
  const inferred = inferTemplates(keys.filter((_, i) => out[i] === null))
  return out.map((template, i) => template ?? inferred.get(keys[i]!) ?? keys[i]!)
}
