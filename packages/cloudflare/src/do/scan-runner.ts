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

export interface ScanRunnerEnv {
  DB: D1Database
  BLOBS: R2Bucket
  SCAN_EVENTS_DO: DurableObjectNamespace
  /** Service binding to this same Worker — used to delegate the per-URL audit. */
  SELF: Fetcher
  /** Shared bearer guarding the internal /__scan/audit route. */
  SHARED_AUDIT_TOKEN?: string
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
    const filter = createFilter({
      include: (config as { scanner?: { include?: string[] } }).scanner?.include,
      exclude: (config as { scanner?: { exclude?: string[] } }).scanner?.exclude,
    })
    const allows = (u: string): boolean => {
      try {
        return filter(new URL(u).pathname)
      }
      catch {
        return filter(u)
      }
    }
    const urls: string[] = []
    const seen = new Set<string>()
    for await (const seed of fuseSeedsDedup(seedSources).seeds()) {
      if (seen.has(seed.url) || !allows(seed.url))
        continue
      seen.add(seed.url)
      urls.push(seed.url)
    }

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
      await this.state.storage.delete('state')
      return
    }

    // Delegate ONE url's audit (all devices) back to the Worker, where the
    // consumer's auditor lives. Each delegate call is a fresh invocation with
    // its own budget — the whole point.
    const targetUrl = st.urls[st.index]
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
      }
      else {
        st.failed += st.devices.length
      }
    }
    catch {
      st.failed += st.devices.length
    }

    // Persist index + counters together AFTER the audit so a crash before this
    // line re-runs the (idempotent) audit on retry without double-counting.
    st.index += 1
    await this.state.storage.put('state', st)
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
