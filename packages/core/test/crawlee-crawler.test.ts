import type { CrawlEvent, SeedSource } from '@unlighthouse/contracts'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { describe, expect, it } from 'vitest'

describe('crawlee crawler failures', () => {
  it('rejects fatal queue errors instead of reporting an idle success', async () => {
    const seeds: SeedSource = {
      async* seeds() {
        yield { url: '/relative-seed', source: 'test' }
      },
    }
    const events: CrawlEvent[] = []

    await expect((async () => {
      for await (const event of crawleeCrawler().run({
        seeds,
        audit: async () => {},
      })) {
        events.push(event)
      }
    })()).rejects.toBeInstanceOf(Error)

    expect(events).toContainEqual({ type: 'url-discovered', url: '/relative-seed', from: 'test' })
    expect(events.some(event => event.type === 'idle')).toBe(false)
  })
})
