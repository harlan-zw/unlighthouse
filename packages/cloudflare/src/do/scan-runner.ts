// ScanRunnerDO — alarm-driven, durable scan scheduler.
//
// Why this exists: a Cloudflare scan used to run entirely inside
// `execCtx.waitUntil(core.session().done)`, which the runtime cancels after its
// time budget — so a multi-URL scan through the (slow) container Lighthouse
// never finished (it wedged at "scanning" with only the first 1-2 URLs
// persisted). This DO instead owns a durable queue and processes ONE URL per
// alarm tick, re-arming the alarm each time, so the scan survives across
// arbitrarily many fresh invocations.
//
// Division of labour:
//   • The DO does discovery (sitemap), creates the scan row, tracks the queue
//     in `state.storage`, and finalizes — all of which need only storage +
//     global fetch, never the auditor.
//   • The actual audit (which needs the consumer-injected auditor that lives in
//     the Worker's `auditorFactory`) is delegated back to the Worker via the
//     SELF service binding, one fresh request per URL — so each audit gets its
//     own invocation budget too.
//
// Idempotency: routes/blobs upserts are deterministic (keyed on
// scanId+url+device), so re-auditing a URL after a mid-tick crash overwrites
// cleanly. `index`/`scanned`/`failed` are persisted together atomically AFTER
// the audit, so a retried tick redoes one audit without double-counting.
// finalizeScan() self-guards against running twice.

import type { D1Database, DurableObjectNamespace, DurableObjectState, Fetcher, R2Bucket } from '@cloudflare/workers-types'
import type { Device, UnlighthouseConfig } from '@unlighthouse/contracts'
import { deriveSiteId, deriveSiteName, finalizeScan, siteOrigin } from '@unlighthouse/core'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { createFilter } from '@unlighthouse/core/util/filter'
import { scanEventsEmit } from '../scan-events-emit'
import { fuseSeedsDedup, workerSitemapSeeds } from '../seeds'
import { d1R2Storage } from '../storage/d1-r2'

// Safety cap on total queue size when link-discovery is crawling a sitemap-less
// site, so a deep/looping site can't grow the queue without bound.
const MAX_QUEUE = 200

// Asset/non-page extensions we never enqueue as routes when extracting links.
const ASSET_EXT_RE = /\.(?:css|js|mjs|json|xml|txt|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip|gz|map)(?:$|\?)/i

const HREF_RE = /href\s*=\s*["']([^"'\s>]+)["']/gi

/** Build the include/exclude allows predicate from config (pathname-based). */
function buildAllows(config: UnlighthouseConfig): (u: string) => boolean {
  const filter = createFilter({
    include: (config as { scanner?: { include?: string[] } }).scanner?.include,
    exclude: (config as { scanner?: { exclude?: string[] } }).scanner?.exclude,
  })
  return (u: string): boolean => {
    try {
      return filter(new URL(u).pathname)
    }
    catch {
      return filter(u)
    }
  }
}

/**
 * Extract same-origin page links from an HTML string. Used as the sitemap-less
 * fallback so Cloudflare scans crawl by following links (like the local
 * crawlee crawler) instead of only auditing the seed. Drops asset URLs, hashes,
 * and cross-origin links; normalises to absolute, hash-stripped form.
 */
function extractSameOriginLinks(html: string, pageUrl: string, origin: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = HREF_RE.exec(html)) !== null) {
    const raw = m[1].trim()
    if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:') || raw.startsWith('#'))
      continue
    try {
      const u = new URL(raw, pageUrl)
      u.hash = ''
      if (u.origin !== origin || ASSET_EXT_RE.test(u.pathname))
        continue
      out.push(u.toString())
    }
    catch { /* skip malformed */ }
  }
  return out
}

export interface ScanRunnerEnv {
  DB: D1Database
  BLOBS: R2Bucket
  SCAN_EVENTS_DO: DurableObjectNamespace
  /** Service binding to this same Worker — used to delegate the per-URL audit. */
  SELF: Fetcher
  /** Shared bearer guarding the internal /__scan/audit route. */
  SHARED_AUDIT_TOKEN?: string
  /**
   * Lighthouse container DO namespace. Optional — present only when the
   * self-hosted container tier is wired. When set, the runner explicitly
   * stop()s the container instance the moment a scan finishes, so the
   * (paid) container only runs for the duration of an active scan rather
   * than idling until sleepAfter fires.
   */
  LIGHTHOUSE_CONTAINER?: DurableObjectNamespace
}

export interface ScanRunnerStartBody {
  scanId: string
  site: string
  devices: Device[]
  mode: 'site' | 'page'
  config: UnlighthouseConfig
}

interface RunnerState extends ScanRunnerStartBody {
  urls: string[]
  index: number
  scanned: number
  failed: number
  startedAtMs: number
  cancelled?: boolean
  /**
   * Follow in-page links to discover routes (the sitemap-less fallback). Set at
   * /start when the sitemap yielded no extra URLs; off when the sitemap already
   * enumerated the site (no need to re-fetch every page's HTML).
   */
  linkDiscovery?: boolean
}

export class ScanRunnerDO {
  private state: DurableObjectState
  private env: ScanRunnerEnv

  constructor(state: DurableObjectState, env: ScanRunnerEnv) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/start') {
      const body = await req.json() as ScanRunnerStartBody
      await this.start(body)
      return new Response(JSON.stringify({ ok: true, scanId: body.scanId }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (req.method === 'POST' && url.pathname === '/cancel') {
      const st = await this.state.storage.get<RunnerState>('state')
      if (st) {
        st.cancelled = true
        await this.state.storage.put('state', st)
        await this.state.storage.setAlarm(Date.now())
      }
      return new Response(null, { status: 202 })
    }
    return new Response('not found', { status: 404 })
  }

  private storage() {
    return d1R2Storage({ db: this.env.DB, bucket: this.env.BLOBS })
  }

  // Stop the Lighthouse container instance (best-effort) so it stops billing as
  // soon as a scan ends. Calls the @cloudflare/containers Container.stop() RPC
  // on the 'default' instance — the same instance the auditor drives.
  private async stopContainer(): Promise<void> {
    const ns = this.env.LIGHTHOUSE_CONTAINER as
      | { getByName?: (name: string) => { stop?: () => Promise<void> } }
      | undefined
    if (!ns?.getByName)
      return
    try {
      await ns.getByName('default').stop?.()
    }
    catch {
      // never fail a finished scan because the container couldn't be stopped;
      // the 2-min sleepAfter is the backstop.
    }
  }

  // Discover the URL set, create the scan row, persist the queue, arm the alarm.
  private async start(body: ScanRunnerStartBody): Promise<void> {
    const { scanId, site, devices, mode, config } = body
    const storage = this.storage()

    // Discovery: manual seed (the site root) fused with Workers-native sitemap
    // discovery, unless page mode (audit only the seed) or sitemap disabled.
    const seedSources = [manualSeeds({ urls: [site] })]
    const sitemapCfg = (config as { scanner?: { sitemap?: true | string[] | false } }).scanner?.sitemap
    if (mode !== 'page' && sitemapCfg !== false) {
      seedSources.push(workerSitemapSeeds({
        site: () => site,
        sitemaps: Array.isArray(sitemapCfg) ? sitemapCfg : true,
      }))
    }
    const allows = buildAllows(config)
    const urls: string[] = []
    const seen = new Set<string>()
    for await (const seed of fuseSeedsDedup(seedSources).seeds()) {
      if (seen.has(seed.url) || !allows(seed.url))
        continue
      seen.add(seed.url)
      urls.push(seed.url)
    }

    // Sitemap-less fallback: if discovery yielded only the seed (no sitemap, or
    // an empty one), crawl by following in-page links as each URL is audited —
    // mirroring the local crawlee crawler so a site without a sitemap still gets
    // more than its homepage scanned. When the sitemap already enumerated the
    // site, skip it (no need to re-fetch every page's HTML).
    const linkDiscovery = mode !== 'page' && urls.length <= 1

    // Site + scan row (mirrors core.ts orchestrate's row creation).
    let siteId: string | null = null
    try {
      siteId = deriveSiteId(site)
      const existing = await storage.sites.get(siteId)
      if (!existing) {
        await storage.sites.create({
          id: siteId,
          name: deriveSiteName(site),
          url: siteOrigin(site),
          group: null,
          createdAt: new Date().toISOString(),
        }).catch(() => {})
      }
    }
    catch {
      siteId = null
    }

    const startedAt = new Date().toISOString()
    const startedAtMs = Date.now()
    await storage.scans.create({
      scanId: scanId as never,
      siteId,
      site: site as never,
      mode,
      device: devices[0],
      status: 'scanning',
      startedAt,
      completedAt: null,
      ciBranch: null,
      ciCommit: null,
      ciCommitMessage: null,
    })

    const emit = scanEventsEmit(this.env, scanId)
    await emit('scan:created', { scanId: scanId as never, site: site as never, startedAt })
    await emit('scan:started', { scanId: scanId as never })
    await emit('scan:scanning', { scanId: scanId as never, discovered: urls.length })

    const next: RunnerState = {
      scanId,
      site,
      devices,
      mode,
      config,
      urls,
      index: 0,
      scanned: 0,
      failed: 0,
      startedAtMs,
      linkDiscovery,
    }
    await this.state.storage.put('state', next)
    await this.state.storage.setAlarm(Date.now())
  }

  async alarm(): Promise<void> {
    const st = await this.state.storage.get<RunnerState>('state')
    if (!st)
      return
    const emit = scanEventsEmit(this.env, st.scanId)

    if (st.cancelled) {
      await this.storage().scans.update(st.scanId as never, {
        status: 'cancelled',
        completedAt: new Date().toISOString(),
      }).catch(() => {})
      await emit('scan:cancelled', { scanId: st.scanId as never, reason: 'cancelled' })
      await this.state.storage.delete('state')
      return
    }

    // Queue drained → finalize (summary + packs + complete row). Idempotent.
    if (st.index >= st.urls.length) {
      await finalizeScan(
        { storage: this.storage(), config: st.config, logger: undefined, emit },
        {
          scanId: st.scanId as never,
          devices: st.devices,
          startedAtMs: st.startedAtMs,
          stats: { discovered: st.urls.length, scanned: st.scanned, failed: st.failed },
        },
      )
      // Cost control: the scan is finished, so stop the (paid) Lighthouse
      // container NOW instead of waiting for its idle sleepAfter to fire — the
      // container then only bills for the duration of an active scan. No-op when
      // the container tier isn't wired (PSI/crux/mock leave it undefined).
      // instanceName 'default' matches the auditor (worker-helper getByName).
      await this.stopContainer()
      await this.state.storage.delete('state')
      return
    }

    // Delegate ONE url's audit (all devices) back to the Worker, where the
    // consumer's auditor lives. Each delegate call is a fresh invocation with
    // its own budget — the whole point.
    const targetUrl = st.urls[st.index]
    let auditOk = false
    try {
      const res = await this.env.SELF.fetch('https://scan-runner.internal/__scan/audit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-audit-token': this.env.SHARED_AUDIT_TOKEN ?? '',
        },
        body: JSON.stringify({ scanId: st.scanId, url: targetUrl, devices: st.devices }),
      } as never) as unknown as Response
      if (res.ok) {
        const j = await res.json() as { scanned?: number, failed?: number }
        st.scanned += j.scanned ?? 0
        st.failed += j.failed ?? 0
        auditOk = (j.scanned ?? 0) > 0
      }
      else {
        st.failed += st.devices.length
      }
    }
    catch {
      st.failed += st.devices.length
    }

    // Sitemap-less link discovery: enqueue new same-origin links found on the
    // page we just audited, so a site without a sitemap gets crawled rather
    // than stopping at the seed. Bounded by MAX_QUEUE; best-effort.
    if (st.linkDiscovery && auditOk && st.urls.length < MAX_QUEUE) {
      try {
        const origin = new URL(st.site).origin
        const resp = await fetch(targetUrl, { headers: { accept: 'text/html' }, redirect: 'follow' })
        if (resp.ok && (resp.headers.get('content-type') ?? '').includes('text/html')) {
          const html = await resp.text()
          const allows = buildAllows(st.config)
          const known = new Set(st.urls)
          for (const link of extractSameOriginLinks(html, targetUrl, origin)) {
            if (st.urls.length >= MAX_QUEUE)
              break
            if (known.has(link) || !allows(link))
              continue
            known.add(link)
            st.urls.push(link)
          }
        }
      }
      catch { /* best-effort discovery */ }
    }

    // Persist index + counters + any newly-discovered URLs together AFTER the
    // audit so a crash before this line re-runs the (idempotent) audit on retry
    // without double-counting.
    st.index += 1
    await this.state.storage.put('state', st)

    // Live progress: write a partial summary onto the scan row so scan.status
    // (which reads the row, not the DO's private state.storage) shows the
    // climbing discovered/scanned counts during the scan instead of 0 until
    // finalize. finalize overwrites this with the fully-scored summary.
    await this.storage().scans.update(st.scanId as never, {
      summary: {
        routes: st.urls.length,
        completed: st.scanned,
        failed: st.failed,
        scoreAverage: null,
        scoresByCategory: {},
        durationMs: Date.now() - st.startedAtMs,
        devices: st.devices,
      },
    } as never).catch(() => {})

    await emit('scan:progress', {
      scanId: st.scanId as never,
      discovered: st.urls.length,
      scanned: st.scanned,
      failed: st.failed,
      total: st.urls.length,
    })
    await this.state.storage.setAlarm(Date.now())
  }
}
