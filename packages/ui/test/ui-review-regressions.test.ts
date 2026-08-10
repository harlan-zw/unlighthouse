import type { Scan } from '@unlighthouse/contracts'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { createFormatters } from '../app/composables/useFormat'
import { resolveScanOverviewStatus } from '../app/features/scan/status-presentation'
import { statusForPair } from '../app/features/sites/scan-pairs'

const root = new URL('../', import.meta.url)

function scan(status: Scan['status'], completed = 0): Scan {
  return {
    scanId: `${status}-scan`,
    siteId: null,
    site: 'https://example.com/',
    mode: 'site',
    device: 'mobile',
    status,
    startedAt: '2026-08-10T00:00:00.000Z',
    completedAt: status === 'complete' || status === 'cancelled' ? '2026-08-10T00:01:00.000Z' : null,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: completed > 0
      ? {
          routes: 10,
          completed,
          failed: 0,
          scoreAverage: 0.9,
          scoresByCategory: { performance: 0.9 },
          durationMs: 60_000,
          devices: ['mobile'],
        }
      : null,
  }
}

describe('uI review regressions', () => {
  it('keeps active and cancelled lifecycle states authoritative over partial summaries', () => {
    expect(resolveScanOverviewStatus({
      metaStatus: 'scanning',
      hasSummary: true,
      isCurrent: true,
      storeStatus: 'scanning',
      remoteStatus: 'scanning',
    })).toBe('scanning')

    expect(resolveScanOverviewStatus({
      metaStatus: 'cancelled',
      hasSummary: true,
      isCurrent: false,
      storeStatus: null,
      remoteStatus: 'cancelled',
    })).toBe('cancelled')
  })

  it('presents cancelled history rows as cancelled, not failed', () => {
    expect(statusForPair({
      startedAt: '2026-08-10T00:00:00.000Z',
      routes: 10,
      completed: 4,
      mobile: scan('cancelled', 4),
      desktop: null,
    })).toEqual({ label: 'cancelled', status: 'warning' })
  })

  it('formats CLS as a unitless value in comparisons', () => {
    const { fmtDelta, fmtMetric, fmtPercent } = createFormatters()
    expect(fmtMetric(0.003, false, 'cls')).toBe('0.003')
    expect(fmtDelta(0, false, 'cls')).toBe('0.000')
    expect(fmtDelta(0.015, false, 'cls')).toBe('+0.015')
    expect(fmtDelta(-81, false, 'lcp')).toBe('-81ms')
    expect(fmtPercent(43.100771176027244)).toBe('43.1%')
    expect(fmtPercent(92.13661325979798)).toBe('92.1%')
  })

  it('loads toast styling and forces failed motion entrances visible', async () => {
    const [config, css] = await Promise.all([
      readFile(new URL('nuxt.config.ts', root), 'utf8'),
      readFile(new URL('app/assets/css/accessibility.css', root), 'utf8'),
    ])

    expect(config).toContain('\'vue-sonner/style.css\'')
    expect(css).toMatch(/\.ui-motion-button__leading[\s\S]*opacity:\s*1\s*!important/)
    expect(css).toMatch(/\.ui-alert[\s\S]*opacity:\s*1\s*!important/)
    expect(css).toMatch(/\[data-testid=["']empty-state["']\][\s\S]*opacity:\s*1\s*!important/)
  })

  it('announces required URL errors and scan startup progress', async () => {
    const [scanForm, sitesPage] = await Promise.all([
      readFile(new URL('app/features/scan/components/NewScanForm.vue', root), 'utf8'),
      readFile(new URL('app/pages/index.vue', root), 'utf8'),
    ])

    expect(scanForm).toContain('aria-required="true"')
    expect(scanForm).toContain(':aria-invalid="Boolean(siteUrlError)"')
    expect(scanForm).toContain('loading ? \'Starting scan…\' : \'Run scan\'')
    expect(scanForm).toContain(':aria-busy="loading"')
    expect(sitesPage).toContain('aria-required="true"')
    expect(sitesPage).toContain(':aria-invalid="Boolean(formUrlError)"')
  })

  it('provides an explicit mobile navigation close control', async () => {
    const shell = await readFile(new URL('app/components/SidebarShell.vue', root), 'utf8')
    expect(shell).toContain('aria-label="Close navigation menu"')
  })

  it('retains command failures when Nuxt drops the raw async-data error', async () => {
    const query = await readFile(new URL('app/composables/useApiQuery.ts', root), 'utf8')
    expect(query).toContain('type ApiQueryResult<T> =')
    expect(query).toContain('_tag: \'err\'')
    expect(query).toContain('query.displayData.value?._tag === \'err\'')
    expect(query).toContain('query.displayData.value?._tag === \'ok\'')
    expect(query).not.toContain('requestError')
    expect(query).not.toContain('throw caught')
  })

  it('sets a client document title in the global Nuxt error shell', async () => {
    const errorPage = await readFile(new URL('app/error.vue', root), 'utf8')
    expect(errorPage).toContain('import { useTitle } from \'@vueuse/core\'')
    expect(errorPage).toContain('useTitle(fullErrorTitle)')
  })

  it('stacks pack identity below the full title on mobile', async () => {
    const [shell, css] = await Promise.all([
      readFile(new URL('app/features/scan/components/PackPageShell.vue', root), 'utf8'),
      readFile(new URL('app/assets/css/accessibility.css', root), 'utf8'),
    ])

    expect(shell).toContain('class="pack-page-header"')
    expect(css).toMatch(/\.pack-page-header\s*>\s*div\s*>\s*div\s*\{[\s\S]*flex-direction:\s*column/)
  })
})
