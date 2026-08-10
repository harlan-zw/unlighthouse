import { describe, expect, it, vi } from 'vitest'
import { resolveScanPreview } from '../src/scan/preview'

const site = 'https://example.com/'
const urls = (values: string[], cloudflareTrapLinks = 0) => ({ _tag: 'Urls' as const, urls: values, cloudflareTrapLinks })

describe('resolveScanPreview', () => {
  it('returns one page without performing discovery', async () => {
    const inspectSitemap = vi.fn()
    const inspectHomepage = vi.fn()

    await expect(resolveScanPreview({ site, mode: 'page' }, { inspectSitemap, inspectHomepage })).resolves.toMatchObject({
      status: 'ready',
      urlCount: 1,
      source: 'single-page',
    })
    expect(inspectSitemap).not.toHaveBeenCalled()
    expect(inspectHomepage).not.toHaveBeenCalled()
  })

  it('prefers the sitemap count', async () => {
    const inspectHomepage = vi.fn()
    const result = await resolveScanPreview({ site, mode: 'site' }, {
      inspectSitemap: async () => urls([site, `${site}about`, `${site}contact`]),
      inspectHomepage,
    })

    expect(result).toMatchObject({ status: 'ready', urlCount: 3, source: 'sitemap', confidence: 'high' })
    expect(inspectHomepage).not.toHaveBeenCalled()
  })

  it('falls back to homepage links and marks the count approximate', async () => {
    const result = await resolveScanPreview({ site, mode: 'site' }, {
      inspectSitemap: async () => urls([]),
      inspectHomepage: async () => urls([site, `${site}about`, `${site}pricing`]),
    })

    expect(result).toMatchObject({ status: 'ready', urlCount: 3, source: 'homepage', confidence: 'low' })
  })

  it('surfaces rate limits without performing another probe', async () => {
    const inspectHomepage = vi.fn()
    const result = await resolveScanPreview({ site, mode: 'site' }, {
      inspectSitemap: async () => ({ _tag: 'Blocked', reason: 'rate-limited', retryAfterSeconds: 60 }),
      inspectHomepage,
    })

    expect(result).toMatchObject({ status: 'blocked', reason: 'rate-limited', retryAfterSeconds: 60 })
    expect(inspectHomepage).not.toHaveBeenCalled()
  })

  it('reports Cloudflare trap links filtered from a homepage estimate', async () => {
    const result = await resolveScanPreview({ site, mode: 'site' }, {
      inspectSitemap: async () => urls([]),
      inspectHomepage: async () => urls([site, `${site}about`], 3),
    })

    expect(result).toMatchObject({ status: 'ready', urlCount: 2, warnings: ['cloudflare-trap-links'] })
  })

  it('returns an advisory unavailable result when both checks fail', async () => {
    const result = await resolveScanPreview({ site, mode: 'site' }, {
      inspectSitemap: async () => Promise.reject(new Error('sitemap blocked')),
      inspectHomepage: async () => Promise.reject(new Error('homepage blocked')),
    })

    expect(result).toEqual({
      status: 'unavailable',
      site,
      mode: 'site',
      reason: 'discovery-unavailable',
    })
  })
})
