import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { parseRecordedRouteUrl, resolveAffectedRouteLink, routeDetailPath, scanRouteLink } from '../app/features/scan/route-links'

describe('scan route navigation', () => {
  it('round trips a persisted path through Vue Router without decoding it twice', async () => {
    const path = '/café/%2F/100%?q=a%20b&literal=%25'
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/sites/:siteId/scans/:scanId/route/:path', component: {} }] })
    await router.push(scanRouteLink('/sites/example/scans/scan-1', path, 'desktop'))
    expect(routeDetailPath(router.currentRoute.value.params.path)).toBe(path)
    expect(router.currentRoute.value.query.device).toBe('desktop')
  })

  it('uses the exact recorded path and selected device for affected URLs', () => {
    const rows = [
      { url: 'https://example.com/?x=1#/shop', path: '/#/shop?x=1', device: 'mobile' },
      { url: 'https://example.com/?x=1#/shop', path: '/#/shop?x=1', device: 'desktop' },
    ]
    expect(resolveAffectedRouteLink('/sites/example/scans/scan-1', rows[0]!.url, rows, 'desktop'))
      .toBe('/sites/example/scans/scan-1/route/%2F%23%2Fshop%3Fx%3D1?device=desktop&url=https%3A%2F%2Fexample.com%2F%3Fx%3D1%23%2Fshop')
  })

  it('keeps unknown resource URLs and missing context as text', () => {
    const rows = [{ url: 'https://example.com/', path: '/', device: 'mobile' }]
    expect(resolveAffectedRouteLink('/scan', 'https://example.com/image.webp', rows)).toBeUndefined()
    expect(resolveAffectedRouteLink(undefined, '/', rows)).toBeUndefined()
    expect(resolveAffectedRouteLink('/scan', '/', rows, 'desktop')).toBeUndefined()
  })

  it('leaves ambiguous aggregate device choice to the route detail page', () => {
    const rows = ['mobile', 'desktop'].map(device => ({ url: 'https://example.com/a', path: '/a', device }))
    expect(resolveAffectedRouteLink('/scan', '/a', rows)).toBe('/scan/route/%2Fa?url=https%3A%2F%2Fexample.com%2Fa')
  })

  it('rejects path-only findings shared by distinct audited query URLs', () => {
    const rows = ['a', 'b'].map(query => ({ url: `https://example.com/search?q=${query}`, path: '/search', device: 'mobile' }))
    expect(resolveAffectedRouteLink('/scan', '/search', rows, 'mobile')).toBeUndefined()
    expect(resolveAffectedRouteLink('/scan', rows[1]!.url, rows, 'mobile'))
      .toBe('/scan/route/%2Fsearch?device=mobile&url=https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Db')
  })

  it('retains the original audited URL for the hash/query persisted path', () => {
    expect(parseRecordedRouteUrl('/#/shop?x=1', 'https://example.com/?x=1#/shop', 'https://example.com')).toBe('https://example.com/?x=1#/shop')
    expect(parseRecordedRouteUrl('/other', 'https://example.com/?x=1#/shop', 'https://example.com')).toBeUndefined()
    expect(parseRecordedRouteUrl('/a', 'javascript:alert(1)', 'https://example.com')).toBeUndefined()
  })

  it('preserves the static audit URL when the persisted path omits its query', async () => {
    const row = { path: '/caf%C3%A9/100%25', url: 'https://example.com/caf%C3%A9/100%25?label=a%26b', device: 'mobile' }
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/sites/:siteId/scans/:scanId/route/:path', component: {} }] })
    await router.push(resolveAffectedRouteLink('/sites/example/scans/scan-1', row.url, [row], 'mobile')!)
    const route = router.currentRoute.value
    expect(parseRecordedRouteUrl(routeDetailPath(route.params.path), route.query.url, 'https://example.com')).toBe(row.url)
    expect(parseRecordedRouteUrl(row.path, row.url, 'https://different.example')).toBeUndefined()
    expect(parseRecordedRouteUrl('/different', row.url, 'https://example.com')).toBeUndefined()
    expect(parseRecordedRouteUrl(row.path, row.url)).toBeUndefined()
  })
})
