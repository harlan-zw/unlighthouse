import type { Config } from '../config.ts'
import type { BrokenLink, Discover, DiscoverOptions, DiscoverResult, DiscoveredPage, FetchedPage, FetchPage, HreflangProblem } from '../contracts.ts'
import { type Alternate, extractLinks } from './links.ts'
import { firstSegment, hostLocale, isLocaleSibling, localeSegment, localesMatch, localeTemplates, normalizeLocale, primaryTag, templateKey, X_DEFAULT } from './locales.ts'
import { parseRobots, type Robots } from './robots.ts'
import { readSitemapEntries, type FetchText } from './sitemap.ts'
import { compileTemplate, segmentsOf } from './templates.ts'
import { alignOrigin, isHtmlCandidate, matchesAny, normalizeUrl, pathOf } from './urls.ts'

export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; Unlighthouse/0.1; +https://github.com/productdevbook/unlighthouse)'

const ROBOTS_AGENT = 'unlighthouse'
const MAX_REDIRECTS = 10
const ROBOTS_MAX_BYTES = 512 * 1024
const SITEMAP_MAX_BYTES = 50 * 1024 * 1024
const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'

export interface CrawlLimits {
  concurrency: number
  requestTimeoutMs: number
  deadlineMs: number
  maxBodyBytes: number
  expansionFactor: number
}

export const DEFAULT_LIMITS: CrawlLimits = {
  concurrency: 6,
  requestTimeoutMs: 30_000,
  deadlineMs: 15 * 60_000,
  maxBodyBytes: 5 * 1024 * 1024,
  expansionFactor: 20,
}

type FetchConfig = Pick<Config, 'auth' | 'userAgent'> & { site?: string | undefined }

function hostVariants(host: string): string[] {
  const apex = host.startsWith('www.') ? host.slice(4) : host
  return [apex, `www.${apex}`]
}

function cookieHeader(config: FetchConfig, url: URL, trusted: boolean): string | null {
  const pairs = config.auth.cookies.filter((cookie) => {
    if (cookie.path && !url.pathname.startsWith(cookie.path))
      return false
    if (!cookie.domain)
      return trusted
    const domain = cookie.domain.replace(/^\./, '').toLowerCase()
    return url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  }).map(cookie => `${cookie.name}=${cookie.value}`)
  return pairs.length ? pairs.join('; ') : null
}

function requestHeaders(config: FetchConfig, url: URL, hosts: readonly string[], accept: string): Headers {
  const trusted = hosts.includes(url.hostname)
  const headers = new Headers(trusted ? config.auth.headers : {})
  headers.set('user-agent', config.userAgent ?? DEFAULT_USER_AGENT)
  if (!headers.has('accept'))
    headers.set('accept', accept)
  const cookies = cookieHeader(config, url, trusted)
  if (cookies)
    headers.set('cookie', cookies)
  return headers
}

async function follow(config: FetchConfig, start: string, accept: string, signal: AbortSignal): Promise<{ response: Response, finalUrl: URL }> {
  let current = new URL(start)
  const hosts = hostVariants(config.site ? new URL(config.site).hostname : current.hostname)
  for (let hop = 0; ; hop++) {
    const response = await fetch(current, { headers: requestHeaders(config, current, hosts, accept), redirect: 'manual', signal })
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location || hop >= MAX_REDIRECTS)
      return { response, finalUrl: current }
    await response.body?.cancel().catch(() => {})
    let next: URL
    try {
      next = new URL(location, current)
    }
    catch {
      return { response, finalUrl: current }
    }
    if (next.protocol !== 'http:' && next.protocol !== 'https:')
      return { response, finalUrl: current }
    current = next
  }
}

async function readCapped(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!stream)
    return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read()
      if (done)
        break
      chunks.push(value)
      size += value.byteLength
    }
  }
  finally {
    reader.cancel().catch(() => {})
  }
  const out = new Uint8Array(Math.min(size, maxBytes))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.byteLength - offset)
    out.set(part, offset)
    offset += part.byteLength
    if (offset >= out.byteLength)
      break
  }
  return out
}

function decode(bytes: Uint8Array, contentType: string | null): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1]
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes)
  }
  catch {
    return new TextDecoder().decode(bytes)
  }
}

function timeoutSignal(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function createFetchPage(config: FetchConfig, limits: { timeoutMs?: number, maxBytes?: number } = {}): FetchPage {
  const timeoutMs = limits.timeoutMs ?? DEFAULT_LIMITS.requestTimeoutMs
  const maxBytes = limits.maxBytes ?? DEFAULT_LIMITS.maxBodyBytes
  return async (url, signal) => {
    const { response, finalUrl } = await follow(config, url, HTML_ACCEPT, timeoutSignal(signal, timeoutMs))
    const contentType = response.headers.get('content-type')
    const isHtml = response.status >= 200 && response.status < 300 && /^\s*text\/html/i.test(contentType ?? '')
    let html: string | null = null
    if (isHtml)
      html = decode(await readCapped(response.body, maxBytes), contentType)
    else
      await response.body?.cancel().catch(() => {})
    return { url, finalUrl: finalUrl.href, status: response.status, contentType, html }
  }
}

function createFetchText(config: FetchConfig, timeoutMs: number, signal: AbortSignal, gate: () => Promise<void>): (maxBytes: number) => FetchText {
  return maxBytes => async (url) => {
    await gate()
    try {
      const { response } = await follow(config, url, '*/*', timeoutSignal(signal, timeoutMs))
      if (response.status >= 400) {
        await response.body?.cancel().catch(() => {})
        return { status: response.status, body: '' }
      }
      let bytes = await readCapped(response.body, maxBytes)
      if (bytes[0] === 0x1F && bytes[1] === 0x8B)
        bytes = await readCapped(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip')), maxBytes)
      return { status: response.status, body: decode(bytes, null) }
    }
    catch (error) {
      if (signal.aborted)
        throw error
      return null
    }
  }
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0)
    return Promise.resolve()
  return raceAbort(Bun.sleep(ms), signal)
}

function limiter(size: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []
  return async (task) => {
    if (active >= size)
      await new Promise<void>(resolve => waiting.push(resolve))
    active++
    try {
      return await task()
    }
    finally {
      active--
      waiting.shift()?.()
    }
  }
}

function urlKey(url: URL): string {
  return `${url.origin}${url.pathname}${url.search}`
}

function hashRoute(raw: string): string {
  const hash = /#!?\/.*$/.exec(raw.trim())?.[0]
  return hash ?? ''
}

interface Item {
  url: URL
  depth: number
  from: string
  fetched?: FetchedPage
}

interface Found {
  url: string
  path: string
  key: string
  locale: string | null
  prefix: string | null
  excluded: boolean
}

interface Outcome {
  status: number
  finalKey: string
}

class Crawl {
  readonly config: Config & { site: string }
  readonly options: DiscoverOptions
  readonly limits: CrawlLimits
  readonly signal: AbortSignal
  readonly fetchPage: FetchPage
  origin: string
  robots: Robots | null = null
  crawlDelayMs: number | null = null
  readonly pages: Found[] = []
  readonly localeOrigins = new Set<string>()
  readonly localeRobots = new Map<string, Robots | null>()
  readonly pendingRobots: Array<Promise<void>> = []
  readonly knownLocales = new Set<string>()
  readonly declared = new Map<string, Alternate[]>()
  readonly sitemapDeclared = new Map<string, Alternate[]>()
  readonly aliases = new Map<string, string>()
  readonly outcomes = new Map<string, Outcome>()
  primary: string | null | undefined = undefined
  included = 0
  excludedCount = 0
  fetchText: ((maxBytes: number) => FetchText) | null = null
  readonly broken: BrokenLink[] = []
  readonly brokenSeen = new Set<string>()
  readonly seen = new Set<string>()
  readonly accepted = new Set<string>()
  readonly blocked = new Set<string>()
  saturated: Array<(segments: string[]) => boolean> = []
  lastRequest = 0

  constructor(config: Config & { site: string }, options: DiscoverOptions, limits: CrawlLimits, signal: AbortSignal) {
    this.config = config
    this.options = options
    this.limits = limits
    this.signal = signal
    this.origin = new URL(config.site).origin
    this.fetchPage = options.fetchPage ?? createFetchPage(config, { timeoutMs: limits.requestTimeoutMs, maxBytes: limits.maxBodyBytes })
  }

  get full(): boolean {
    return this.included >= this.config.discover.maxPages
  }

  get collapseLocales(): boolean {
    return this.config.discover.locales !== 'all'
  }

  onSite(url: URL): boolean {
    return url.origin === this.origin || this.localeOrigins.has(url.origin)
  }

  normalize(raw: string, base: string | URL): URL | null {
    const url = normalizeUrl(raw, base, this.config.discover.keepQuery)
    return url ? alignOrigin(url, this.origin) : null
  }

  inScope(url: URL): boolean {
    const { include, exclude } = this.config.discover
    const paths = [url.pathname, pathOf(url)]
    if (include.length && !paths.some(path => matchesAny(path, include)))
      return false
    return !paths.some(path => matchesAny(path, exclude))
  }

  allowedByRobots(url: URL): boolean {
    const robots = url.origin === this.origin ? this.robots : this.localeRobots.get(url.origin) ?? null
    if (!robots || robots.allows(pathOf(url)))
      return true
    this.blocked.add(urlKey(url))
    return false
  }

  candidate(url: URL): boolean {
    return this.onSite(url) && isHtmlCandidate(url) && this.inScope(url) && this.allowedByRobots(url)
  }

  keyOf(href: string): string | null {
    const url = this.normalize(href, this.origin)
    return url ? urlKey(url) : null
  }

  sourceOf(key: string): string {
    return this.aliases.get(key) ?? key
  }

  registerLocaleOrigins(alternates: readonly Alternate[]): void {
    const site = new URL(this.origin)
    for (const alternate of alternates) {
      let url: URL
      try {
        url = new URL(alternate.href)
      }
      catch {
        continue
      }
      if (this.localeOrigins.has(url.origin) || !isLocaleSibling(site, url))
        continue
      this.localeOrigins.add(url.origin)
      const fetchText = this.fetchText
      if (!this.config.discover.robots || !fetchText)
        continue
      const pending = fetchText(ROBOTS_MAX_BYTES)(`${url.origin}/robots.txt`).then((response) => {
        this.localeRobots.set(url.origin, response && response.status < 400 ? parseRobots(response.body, ROBOTS_AGENT) : null)
      })
      pending.catch(() => {})
      this.pendingRobots.push(pending)
    }
  }

  async settleRobots(): Promise<void> {
    while (this.pendingRobots.length)
      await this.pendingRobots.shift()
  }

  learnLocales(alternates: readonly Alternate[], lang: string | null): void {
    for (const code of [...alternates.map(alternate => alternate.hreflang), ...(lang ? [lang] : [])]) {
      const locale = normalizeLocale(code)
      if (locale) {
        this.knownLocales.add(locale)
        this.knownLocales.add(primaryTag(locale))
      }
    }
  }

  declarationsOf(source: string): Alternate[] {
    return [...this.declared.get(source) ?? [], ...this.sitemapDeclared.get(source) ?? []]
  }

  pageLocale(url: URL, keys: ReadonlySet<string>, alternates: readonly Alternate[], lang: string | null): { locale: string | null, prefix: string | null } {
    const self = alternates.find(alternate => alternate.hreflang.toLowerCase() !== X_DEFAULT && keys.has(this.keyOf(alternate.href) ?? '') && normalizeLocale(alternate.hreflang))
    const declared = (self ? normalizeLocale(self.hreflang) : null) ?? (lang ? normalizeLocale(lang) : null)
    const segment = localeSegment(firstSegment(url.pathname))
    const prefix = segment && (declared ? localesMatch(declared, segment) : this.knownLocales.has(segment)) ? segment : null
    const host = url.origin === this.origin ? null : hostLocale(url.hostname)
    return { locale: declared ?? prefix ?? host, prefix: prefix ? firstSegment(url.pathname)! : null }
  }

  primaryFrom(alternates: readonly Alternate[], own: string | null): string | null {
    const fallback = alternates.find(alternate => alternate.hreflang.toLowerCase() === X_DEFAULT)
    if (fallback) {
      const target = this.keyOf(fallback.href)
      const match = alternates.find(alternate => alternate !== fallback && normalizeLocale(alternate.hreflang) && this.keyOf(alternate.href) === target)
      if (match)
        return normalizeLocale(match.hreflang)
    }
    return own
  }

  isExcluded(locale: string | null): boolean {
    const mode = this.config.discover.locales
    if (locale === null || mode === 'all')
      return false
    if (mode === 'default')
      return this.primary != null && !localesMatch(this.primary, locale)
    return !mode.some(code => localesMatch(normalizeLocale(code) ?? code.toLowerCase(), locale))
  }

  guessPrefix(url: URL): string | null {
    const segment = firstSegment(url.pathname)
    return segment && this.knownLocales.has(localeSegment(segment) ?? '') ? segment : null
  }

  async gate(): Promise<void> {
    if (!this.crawlDelayMs)
      return
    const wait = this.lastRequest + this.crawlDelayMs - Date.now()
    this.lastRequest = Date.now() + Math.max(0, wait)
    await sleep(wait, this.signal)
  }

  async fetchOne(url: string): Promise<FetchedPage> {
    await this.gate()
    const signal = timeoutSignal(this.signal, this.limits.requestTimeoutMs)
    try {
      return await raceAbort(this.fetchPage(url, signal), signal)
    }
    catch (error) {
      if (this.signal.aborted)
        throw error
      return { url, finalUrl: url, status: 0, contentType: null, html: null }
    }
  }

  record(url: URL, depth: number, locale: { locale: string | null, prefix: string | null }, excluded: boolean): void {
    this.accepted.add(urlKey(url))
    this.seen.add(urlKey(url))
    this.pages.push({ url: url.href, path: pathOf(url), key: urlKey(url), ...locale, excluded })
    this.options.onFound?.({ url: url.href, depth })
    if (excluded) {
      this.excludedCount++
      return
    }
    this.included++
    const cap = this.config.sampling.perTemplate * this.limits.expansionFactor
    if (cap > 0 && this.included % 10 === 0)
      this.updateSaturated(cap)
  }

  updateSaturated(cap: number): void {
    const counts = new Map<string, number>()
    for (const template of localeTemplates(this.pages.filter(page => !page.excluded), this.config.templates, this.collapseLocales))
      counts.set(template, (counts.get(template) ?? 0) + 1)
    this.saturated = [...counts].filter(([, count]) => count > cap).map(([template]) => compileTemplate(template))
  }

  expandable(url: URL): boolean {
    const path = pathOf(url)
    const segments = segmentsOf(path)
    const key = segmentsOf(templateKey({ path, prefix: this.guessPrefix(url) }, this.collapseLocales))
    return !this.saturated.some(match => match(segments) || match(key))
  }

  reportBroken(item: Item, status: number): void {
    const key = urlKey(item.url)
    if (!item.from || this.brokenSeen.has(key))
      return
    this.brokenSeen.add(key)
    this.broken.push({ url: item.url.href, status, from: item.from })
  }

  async visit(item: Item, page: FetchedPage, next: Item[]): Promise<void> {
    const finalUrl = this.normalize(page.finalUrl, item.url) ?? item.url
    this.outcomes.set(urlKey(item.url), { status: page.status, finalKey: urlKey(finalUrl) })
    if (page.status === 0 || page.status >= 400) {
      this.reportBroken(item, page.status)
      return
    }
    let url = finalUrl
    if (urlKey(url) !== urlKey(item.url)) {
      if (!this.onSite(url) || !isHtmlCandidate(url) || !this.inScope(url) || !this.allowedByRobots(url))
        return
      this.seen.add(urlKey(url))
    }
    if (this.accepted.has(urlKey(url)) || page.status >= 300 || page.html === null || !/^\s*text\/html/i.test(page.contentType ?? ''))
      return
    const { links, canonical, lang, alternates } = await extractLinks(page.html, page.finalUrl)
    const canonicalUrl = canonical ? this.normalize(canonical, page.finalUrl) : null
    if (canonicalUrl && urlKey(canonicalUrl) !== urlKey(url) && this.onSite(canonicalUrl) && isHtmlCandidate(canonicalUrl) && this.inScope(canonicalUrl) && this.allowedByRobots(canonicalUrl))
      url = canonicalUrl
    const keys = new Set([urlKey(item.url), urlKey(finalUrl), urlKey(url)])
    const source = this.sourceOf(urlKey(url))
    for (const key of keys) {
      if (!this.aliases.has(key))
        this.aliases.set(key, source)
    }
    if (!this.declared.has(source))
      this.declared.set(source, alternates)
    const declarations = [...alternates, ...[...keys].flatMap(key => this.sitemapDeclared.get(key) ?? [])]
    this.learnLocales(declarations, lang)
    this.registerLocaleOrigins(alternates)
    const locale = this.pageLocale(url, keys, declarations, lang)
    if (this.primary === undefined)
      this.primary = this.primaryFrom(declarations, locale.locale)
    const excluded = this.isExcluded(locale.locale)
    if (!this.accepted.has(urlKey(url))) {
      if (excluded ? this.excludedCount >= this.config.discover.maxPages : this.full)
        return
      this.record(url, item.depth, locale, excluded)
    }
    if (!this.config.discover.links || item.depth >= this.config.discover.maxDepth || !this.expandable(url))
      return
    await this.settleRobots()
    for (const link of [...(excluded ? [] : links), ...alternates.map(alternate => alternate.href)]) {
      const target = this.normalize(link, page.finalUrl)
      if (!target || this.seen.has(urlKey(target)))
        continue
      this.seen.add(urlKey(target))
      if (this.candidate(target))
        next.push({ url: target, depth: item.depth + 1, from: page.finalUrl })
    }
  }

  async level(queue: Item[]): Promise<Item[]> {
    const items = [...queue.filter(item => this.expandable(item.url)), ...queue.filter(item => !this.expandable(item.url))]
    const run = limiter(this.crawlDelayMs ? 1 : this.limits.concurrency)
    const results = items.map((item) => {
      if (item.fetched)
        return Promise.resolve(item.fetched)
      const promise = run(async () => this.full ? null : this.fetchOne(item.url.href))
      promise.catch(() => {})
      return promise
    })
    const next: Item[] = []
    for (let i = 0; i < items.length && !this.full; i++) {
      const page = await results[i]!
      if (page)
        await this.visit(items[i]!, page, next)
    }
    return next
  }

  async readRobots(fetchText: (maxBytes: number) => FetchText): Promise<void> {
    if (!this.config.discover.robots)
      return
    const response = await fetchText(ROBOTS_MAX_BYTES)(`${this.origin}/robots.txt`)
    if (!response || response.status >= 400)
      return
    this.robots = parseRobots(response.body, ROBOTS_AGENT)
    this.crawlDelayMs = this.robots.crawlDelayMs
  }

  async readSitemaps(fetchText: (maxBytes: number) => FetchText): Promise<Item[]> {
    if (!this.config.discover.sitemap)
      return []
    const listed = (this.robots?.sitemaps ?? []).flatMap((raw) => {
      try {
        return [new URL(raw, this.origin).href]
      }
      catch {
        return []
      }
    })
    const roots = listed.length ? listed : [`${this.origin}/sitemap.xml`]
    const items: Item[] = []
    const entries = await readSitemapEntries(roots, fetchText(SITEMAP_MAX_BYTES), this.config.discover.maxPages, (raw) => {
      const url = this.normalize(raw, this.origin)
      if (!url || this.seen.has(urlKey(url)) || !this.candidate(url))
        return false
      this.seen.add(urlKey(url))
      items.push({ url, depth: 0, from: '' })
      return true
    }, (raw, alternates) => {
      const key = this.keyOf(raw)
      if (!key)
        return
      const resolved = alternates.flatMap((alternate) => {
        try {
          return [{ hreflang: alternate.hreflang, href: new URL(alternate.href, raw).href }]
        }
        catch {
          return []
        }
      })
      this.sitemapDeclared.set(key, [...this.sitemapDeclared.get(key) ?? [], ...resolved])
      this.registerLocaleOrigins(resolved)
    })
    entries.forEach((entry, i) => {
      items[i]!.from = entry.sitemap
    })
    await this.settleRobots()
    return items.filter(item => this.allowedByRobots(item.url))
  }

  async run(): Promise<void> {
    const site = new URL(this.config.site)
    const root = await this.fetchOne(site.href)
    if (root.status > 0) {
      try {
        this.origin = new URL(root.finalUrl).origin
      }
      catch {}
    }
    const rootUrl = this.normalize(site.href, site)!
    this.seen.add(urlKey(rootUrl))
    const fetchText = createFetchText({ ...this.config, site: this.origin }, this.limits.requestTimeoutMs, this.signal, () => this.gate())
    this.fetchText = fetchText
    await this.readRobots(fetchText)
    const rootFinal = this.normalize(root.finalUrl, site)
    const rootItems: Item[] = rootFinal && rootFinal.origin === this.origin && this.inScope(rootFinal) && this.allowedByRobots(rootFinal)
      ? [{ url: rootUrl, depth: 0, from: '', fetched: root }]
      : []
    let queue = [...rootItems, ...await this.readSitemaps(fetchText)]
    while (queue.length && !this.full)
      queue = await this.level(queue)
  }

  explicit(): void {
    const site = new URL(this.config.site)
    for (const raw of this.config.urls) {
      const url = this.normalize(raw, site)
      if (!url || url.origin !== this.origin || !this.inScope(url))
        continue
      url.hash = hashRoute(raw)
      const key = urlKey(url) + url.hash
      if (this.accepted.has(key) || this.full)
        continue
      this.accepted.add(key)
      this.included++
      this.pages.push({ url: url.href, path: pathOf(url) + url.hash, key, locale: null, prefix: null, excluded: false })
      this.options.onFound?.({ url: url.href, depth: 0 })
    }
  }

  clusters(): Map<Found, Found[]> {
    const bySource = new Map(this.pages.map(page => [this.sourceOf(page.key), page]))
    const out = new Map<Found, Set<Found>>(this.pages.map(page => [page, new Set()]))
    for (const page of this.pages) {
      for (const alternate of this.declarationsOf(this.sourceOf(page.key))) {
        const key = this.keyOf(alternate.href)
        const target = key ? bySource.get(this.sourceOf(key)) : undefined
        if (!target || target === page)
          continue
        out.get(page)!.add(target)
        out.get(target)!.add(page)
      }
    }
    return new Map([...out].map(([page, cluster]) => [page, [...cluster]]))
  }

  alternateOf(page: Found, cluster: Found[]): string | null {
    const primary = this.primary ?? null
    if (page.locale === null || (primary !== null && localesMatch(primary, page.locale)))
      return null
    const candidates = cluster.filter(candidate => !candidate.excluded)
    const preferred = primary === null ? undefined : candidates.find(candidate => candidate.locale !== null && localesMatch(primary, candidate.locale))
    return (preferred ?? (page.excluded ? candidates[0] : undefined))?.url ?? null
  }

  skipReason(page: Found, alternateOf: string | null): string | null {
    if (!page.excluded)
      return null
    const mode = this.config.discover.locales
    if (Array.isArray(mode))
      return `Language ${page.locale} is not in discover.locales (${mode.join(', ')})${alternateOf ? `; language version of ${alternateOf}` : ''}`
    return `Language version (${page.locale})${alternateOf ? ` of ${alternateOf}` : ''}: discover.locales "default" audits only the primary language (${this.primary})`
  }

  hreflangProblems(): HreflangProblem[] {
    const problems: HreflangProblem[] = []
    const seen = new Set<string>()
    const add = (problem: HreflangProblem) => {
      const id = `${problem.url}\n${problem.hreflang}\n${problem.target}\n${problem.problem}`
      if (!seen.has(id)) {
        seen.add(id)
        problems.push(problem)
      }
    }
    for (const page of this.pages) {
      const source = this.sourceOf(page.key)
      for (const alternate of this.declarationsOf(source)) {
        const problem = (kind: HreflangProblem['problem']) => add({ url: page.url, hreflang: alternate.hreflang, target: alternate.href, problem: kind })
        if (alternate.hreflang.toLowerCase() !== X_DEFAULT && !normalizeLocale(alternate.hreflang))
          problem('invalid-code')
        const key = this.keyOf(alternate.href)
        if (!key || this.sourceOf(key) === source)
          continue
        const outcome = this.outcomes.get(key)
        if (!outcome)
          continue
        if (outcome.status === 0 || outcome.status >= 400) {
          problem('broken-target')
          continue
        }
        if (outcome.finalKey !== key) {
          problem('redirected-target')
          continue
        }
        const target = this.sourceOf(key)
        if (!this.declared.has(target) && !this.sitemapDeclared.has(target))
          continue
        if (!this.declarationsOf(target).some(back => this.sourceOf(this.keyOf(back.href) ?? '') === source))
          problem('missing-return-link')
      }
    }
    return problems
  }

  result(): DiscoverResult {
    const templates = localeTemplates(this.pages, this.config.templates, this.collapseLocales)
    const clusters = this.clusters()
    const pages: DiscoveredPage[] = this.pages.map((page, i) => {
      const alternateOf = this.alternateOf(page, clusters.get(page) ?? [])
      return {
        url: page.url,
        path: page.path,
        template: templates[i]!,
        locale: page.locale,
        alternateOf,
        skipReason: this.skipReason(page, alternateOf),
      }
    })
    return {
      origin: this.origin,
      pages,
      broken: this.broken,
      hreflangProblems: this.hreflangProblems(),
      blockedByRobots: this.blocked.size,
      crawlDelayMs: this.crawlDelayMs,
    }
  }
}

export function createDiscover(overrides: Partial<CrawlLimits> = {}): Discover {
  const limits = { ...DEFAULT_LIMITS, ...overrides }
  return async (config, options = {}) => {
    options.signal?.throwIfAborted()
    const deadline = new AbortController()
    const timer = setTimeout(() => deadline.abort(new Error('Discovery deadline reached')), limits.deadlineMs)
    const finished = new AbortController()
    const signal = AbortSignal.any([deadline.signal, finished.signal, ...(options.signal ? [options.signal] : [])])
    const crawl = new Crawl(config, options, limits, signal)
    try {
      if (config.urls.length)
        crawl.explicit()
      else
        await crawl.run()
    }
    catch (error) {
      if (options.signal?.aborted)
        throw options.signal.reason
      if (!deadline.signal.aborted)
        throw error
    }
    finally {
      clearTimeout(timer)
      finished.abort()
    }
    return crawl.result()
  }
}

export const discover: Discover = createDiscover()
