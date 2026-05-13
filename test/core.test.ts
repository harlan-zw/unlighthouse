// Unit tests for Core orchestration (packages/core/src/core.ts).
// Covers: happy-path event sequence, cancel, pause/resume capability gating,
// ring buffer replay, ACTIVE_SCAN_CONFLICT, and audit failure → scan:route-failed.

import type {
  Auditor,
  CrawlEvent,
  Crawler,
  CrawlerRunOptions,
  HookEvent,
  SeedSource,
  Storage,
  UnlighthouseConfig,
} from '@unlighthouse/contracts'
import { describe, expect, it } from 'vitest'
import { UnlighthouseError } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { memoryStorage } from '@unlighthouse/core/storage/memory'

// SCAN_CANCELLED rejections on `session.done` fire from the orchestrate IIFE
// after the cancelling test body finishes. Even with .catch() attached, Node's
// unhandledRejection event fires before vitest re-checks. Suppress at module
// load so vitest's own listener doesn't surface the rejection.
process.on('unhandledRejection', (reason: any) => {
  if (reason?.code === 'SCAN_CANCELLED')
    return
  throw reason
})

// ── Test helpers ────────────────────────────────────────────────────────────

const baseConfig: UnlighthouseConfig = { site: 'https://example.com' }

const emptySeeds: SeedSource = {
  seeds: async function* () {},
}

function stubReport(url: string) {
  return {
    lighthouseVersion: 'test',
    extracted: {
      url,
      path: new URL(url).pathname,
      routeName: null,
      scorePerformance: 0.9,
      scoreAccessibility: 0.9,
      scoreSeo: 0.9,
      scoreBestPractices: 0.9,
      lcp: 1000,
      cls: 0.01,
      inp: 50,
      fcp: 800,
      ttfb: 100,
      tbt: 50,
      si: 1500,
      lighthouseVersion: 'test',
      capturedAt: new Date().toISOString(),
    },
  } as any
}

function passingAuditor(): Auditor {
  return {
    capabilities: {
      reliablePerfScores: true,
      reliableFieldData: false,
      supportsThrottling: true,
      categories: ['performance'],
    },
    audit: async (url: string) => stubReport(url) as any,
  }
}

function failingAuditor(failUrls: Set<string>): Auditor {
  return {
    capabilities: {
      reliablePerfScores: true,
      reliableFieldData: false,
      supportsThrottling: true,
      categories: ['performance'],
    },
    audit: async (url: string) => {
      if (failUrls.has(url))
        throw new Error(`forced failure for ${url}`)
      return stubReport(url) as any
    },
  }
}

/** Crawler that emits a fixed list of url-discovered events, awaiting each audit. */
function discoveryCrawler(urls: string[], opts?: { pauseable?: boolean }): Crawler {
  const c: Crawler = {
    run(runOpts: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
      return (async function* () {
        for (const url of urls) {
          if (runOpts.signal?.aborted)
            return
          yield { type: 'url-discovered', url }
          // fire-and-forget audit; core awaits via auditWrapper
          await runOpts.audit(url, { scanId: 'x', signal: runOpts.signal })
          if (runOpts.signal?.aborted)
            return
        }
        yield { type: 'idle' }
      })()
    },
  }
  if (opts?.pauseable) {
    c.pause = async () => {}
    c.resume = async () => {}
  }
  return c
}

/** Crawler that emits one discovery, then awaits forever (until signal aborts). */
function hangingCrawler(url: string): Crawler {
  return {
    run(runOpts: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
      return (async function* () {
        yield { type: 'url-discovered', url }
        await new Promise<void>((resolve) => {
          runOpts.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      })()
    },
  }
}

async function collectEvents(session: { events: AsyncIterable<HookEvent> }): Promise<HookEvent[]> {
  const out: HookEvent[] = []
  for await (const e of session.events)
    out.push(e)
  return out
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('createUnlighthouseCore orchestration', () => {

  it('happy path: emits stable scan:* sequence and persists routes', async () => {
    const urls = ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']
    const storage: Storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor: passingAuditor(),
      seeds: emptySeeds,
      crawler: discoveryCrawler(urls),
      storage,
    })

    const session = core.run()
    const collected: HookEvent[] = []
    const stop = session.subscribe(e => collected.push(e))
    await session.done
    // give iter a tick to close
    await new Promise(r => setTimeout(r, 0))
    stop()

    const names = collected.map(e => e.event)
    expect(names[0]).toBe('scan:created')
    expect(names[1]).toBe('scan:started')
    expect(names[2]).toBe('scan:discovering')
    expect(names).toContain('scan:scanning')
    expect(names.filter(n => n === 'scan:route-complete')).toHaveLength(3)
    expect(names.at(-1)).toBe('scan:complete')

    const list = await storage.routes.listForScan(session.scanId)
    expect(list.items.length).toBe(3)

    expect(session.stats()).toEqual({ discovered: 3, scanned: 3, failed: 0, total: 3 })
    expect(session.state()).toBe('complete')
  })

  it('cancel: emits scan:cancelled and rejects done', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor: passingAuditor(),
      seeds: emptySeeds,
      crawler: hangingCrawler('https://example.com/x'),
      storage,
    })

    const session = core.run()
    const settled = session.done.then(v => ({ ok: true as const, v }), e => ({ ok: false as const, e }))
    const events: HookEvent[] = []
    session.subscribe(e => events.push(e))

    // wait until the scanning event fires (post-discovery)
    await new Promise<void>((resolve) => {
      const i = setInterval(() => {
        if (events.some(e => e.event === 'scan:scanning')) {
          clearInterval(i)
          resolve()
        }
      }, 5)
    })

    await session.cancel('user')
    const result = await settled
    expect(result.ok).toBe(false)

    const cancelled = events.find(e => e.event === 'scan:cancelled')
    expect(cancelled).toBeDefined()
    expect((cancelled as any).payload.reason).toBe('user')
    expect(session.state()).toBe('cancelled')
  })

  it('pause/resume capability gating: missing methods', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor: passingAuditor(),
      seeds: emptySeeds,
      crawler: hangingCrawler('https://example.com/x'),
      storage,
    })
    const session = core.run()
    session.done.catch(() => {})
    expect(session.capabilities.pausable).toBe(false)
    await expect(session.pause()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' })
    await session.cancel()
    await session.done.catch(() => {})
  })

  it('pause/resume capability gating: present methods emit events', async () => {
    const storage = memoryStorage()
    const crawler = discoveryCrawler(['https://example.com/a'], { pauseable: true })
    // Make audit slow so we can pause/resume mid-run.
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    const auditor: Auditor = {
      capabilities: passingAuditor().capabilities,
      audit: async (url: string) => {
        await gate
        return stubReport(url) as any
      },
    }
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor,
      seeds: emptySeeds,
      crawler,
      storage,
    })
    const session = core.run()
    expect(session.capabilities.pausable).toBe(true)
    const events: HookEvent[] = []
    session.subscribe(e => events.push(e))

    // wait until scanning fires (discovery happened)
    await new Promise<void>((resolve) => {
      const i = setInterval(() => {
        if (events.some(e => e.event === 'scan:scanning')) {
          clearInterval(i)
          resolve()
        }
      }, 5)
    })

    await session.pause()
    expect(session.state()).toBe('paused')
    await session.resume()
    expect(session.state()).toBe('scanning')

    release()
    await session.done

    const names = events.map(e => e.event)
    expect(names).toContain('scan:paused')
    expect(names).toContain('scan:resumed')
    expect(names.indexOf('scan:paused')).toBeLessThan(names.indexOf('scan:resumed'))
  })

  it('ring buffer + replay: caps at 10k and returns most recent', async () => {
    // Build a crawler that emits >10k discoveries with a no-op audit so we
    // don't pay 10k route-complete events. Each discovery is one stable event.
    const COUNT = 10_050
    const auditor: Auditor = {
      capabilities: passingAuditor().capabilities,
      audit: async () => stubReport('https://example.com/x') as any,
    }
    const crawler: Crawler = {
      run(runOpts: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
        return (async function* () {
          for (let i = 0; i < COUNT; i++) {
            if (runOpts.signal?.aborted)
              return
            yield { type: 'url-discovered', url: `https://example.com/p${i}` }
          }
        })()
      },
    }
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor,
      seeds: emptySeeds,
      crawler,
      storage,
    })
    const session = core.run()
    await session.done

    const all = session.replay(10_001)
    expect(all.length).toBe(10_000)

    const last5 = session.replay(5)
    expect(last5.length).toBe(5)
    // Most recent slice equals tail of full replay.
    expect(last5).toEqual(all.slice(all.length - 5))
    // And ends with scan:complete.
    expect(last5.at(-1)!.event).toBe('scan:complete')
  }, 10_000)

  it('throws ACTIVE_SCAN_CONFLICT on concurrent run()', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor: passingAuditor(),
      seeds: emptySeeds,
      crawler: hangingCrawler('https://example.com/x'),
      storage,
    })
    const session = core.run()
    session.done.catch(() => {})
    expect(() => core.run()).toThrow(UnlighthouseError)
    try {
      core.run()
    }
    catch (e) {
      expect((e as UnlighthouseError).code).toBe('ACTIVE_SCAN_CONFLICT')
    }
    await session.cancel()
    await session.done.catch(() => {})
  })

  it('run({ overrides }): site/device/ciBuild are persisted onto the scans row', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: 'https://default.example', scanner: { device: 'mobile' } },
      auditor: passingAuditor(),
      seeds: emptySeeds,
      crawler: discoveryCrawler(['https://override.example/a']),
      storage,
    })

    const session = core.run({
      overrides: {
        site: 'https://override.example',
        device: 'desktop',
        ciBuild: { branch: 'feat/x', hash: 'deadbeef', message: 'wip' },
      },
    })
    await session.done

    const scan = await storage.scans.get(session.scanId)
    expect(scan?.site).toBe('https://override.example')
    expect(scan?.device).toBe('desktop')
    expect(scan?.ciBranch).toBe('feat/x')
    expect(scan?.ciCommit).toBe('deadbeef')
    expect(scan?.ciCommitMessage).toBe('wip')
  })

  it('run() without overrides: falls back to host config (default device=mobile, no ci)', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor: passingAuditor(),
      seeds: emptySeeds,
      crawler: discoveryCrawler(['https://example.com/a']),
      storage,
    })
    const session = core.run()
    await session.done
    const scan = await storage.scans.get(session.scanId)
    expect(scan?.site).toBe('https://example.com')
    expect(scan?.device).toBe('mobile')
    expect(scan?.ciBranch).toBeNull()
    expect(scan?.ciCommit).toBeNull()
    expect(scan?.ciCommitMessage).toBeNull()
  })

  it('audit error: emits scan:route-failed, completes with stats.failed=1', async () => {
    const urls = ['https://example.com/a', 'https://example.com/b', 'https://example.com/c']
    const storage = memoryStorage()
    const auditor = failingAuditor(new Set(['https://example.com/b']))
    const core = createUnlighthouseCore({
      config: baseConfig,
      auditor,
      seeds: emptySeeds,
      crawler: discoveryCrawler(urls),
      storage,
    })
    const session = core.run()
    const events: HookEvent[] = []
    session.subscribe(e => events.push(e))
    await session.done

    const failed = events.find(e => e.event === 'scan:route-failed')
    expect(failed).toBeDefined()
    expect((failed as any).payload.url).toBe('https://example.com/b')
    expect(session.stats().failed).toBe(1)
    expect(session.stats().scanned).toBe(2)
    expect(events.some(e => e.event === 'scan:complete')).toBe(true)
  })
})
