import type { CrawlerRunOptions, SeedSource } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'

describe('per-run route limit', () => {
  it('stops dispatching finite seeds at maxRoutes', async () => {
    const seeds: SeedSource = {
      async* seeds() {
        for (const path of ['/a', '/b', '/c'])
          yield { url: `https://example.com${path}`, source: 'test' }
      },
    }
    const audited: string[] = []

    for await (const _event of parallelMapCrawler({ concurrency: 1 }).run({
      seeds,
      maxRoutes: 2,
      audit: async url => audited.push(url),
    })) {
      // Drain the adapter event stream.
    }

    expect(audited).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('maps a run override onto crawler maxRoutes', async () => {
    let receivedMaxRoutes: number | undefined
    const core = createUnlighthouseCore({
      config: { site: 'https://example.com', scanner: { maxRoutes: 200 } },
      auditor: {
        capabilities: {
          reliablePerfScores: true,
          reliableFieldData: false,
          supportsThrottling: true,
          categories: ['performance'],
        },
        audit: async () => {
          throw new Error('audit should not run without seeds')
        },
      },
      seeds: { async* seeds() {} },
      crawler: {
        async* run(options: CrawlerRunOptions) {
          receivedMaxRoutes = options.maxRoutes
          yield { type: 'idle' as const }
        },
      },
      storage: memoryStorage(),
    })

    await core.run({ overrides: { maxRoutes: 100 } }).done

    expect(receivedMaxRoutes).toBe(100)
  })
})
