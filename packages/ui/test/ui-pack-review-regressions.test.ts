import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { formatRouteCount } from '../app/features/scan/pack-presentation'

const root = new URL('../', import.meta.url)

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), 'utf8')
}

describe('uI pack review regressions', () => {
  it('shows fractional categories without a contradictory score gauge', async () => {
    const routeDetail = await source('app/pages/sites/[siteId]/scans/[scanId]/route/[path].vue')

    expect(routeDetail).toContain('s.categoryScoreDisplayMode === \'gauge\'')
    expect(routeDetail).toContain('s.categoryScoreDisplayMode === \'fraction\'')
    expect(routeDetail).toContain('grid grid-cols-1 gap-4 sm:grid-cols-2')
  })

  it('presents zero-applicability Agentic findings neutrally', async () => {
    const agentic = await source('app/features/scan/components/packs/AgenticBrowsingWidget.vue')

    expect(agentic).toContain('finding.routeCount === 0 ? \'minus\'')
    expect(agentic).toContain('finding.routeCount === 0 ? \'Not applicable\'')
    expect(agentic).toContain('finding.routeCount === 0 ? \'No applicable routes.\'')
  })

  it('rounds bundle waste percentages and pluralizes route counts', async () => {
    const [bundle, images, cwv, insights] = await Promise.all([
      source('app/features/scan/components/packs/JsBundleWidget.vue'),
      source('app/features/scan/components/packs/ImagesWidget.vue'),
      source('app/features/scan/components/packs/CwvWidget.vue'),
      source('app/features/scan/components/packs/InsightsWidget.vue'),
    ])

    expect(formatRouteCount(0)).toBe('0 routes')
    expect(formatRouteCount(1)).toBe('1 route')
    expect(formatRouteCount(2)).toBe('2 routes')
    expect(bundle).toContain('fmtPercent(finding.wastedPercent)')
    expect(images).toContain('formatRouteCount(finding.routeCount)')
    expect(cwv).toContain('formatRouteCount(fix.routeCount)')
    expect(insights).toContain('formatRouteCount(insight.routeCount)')
  })

  it('keeps mobile URL columns readable and collapses empty CrUX data', async () => {
    const [seo, crux] = await Promise.all([
      source('app/features/scan/components/packs/SeoBasicsWidget.vue'),
      source('app/features/scan/components/packs/CruxWidget.vue'),
    ])

    expect(seo).toContain('headClass: \'min-w-[18rem]\'')
    expect(seo).toContain('min-w-[18rem] max-w-[32rem] font-mono text-xs break-words')
    expect(crux).toContain('const fieldFindings = computed')
    expect(crux).toContain('v-if="fieldFindings.length"')
    expect(crux).toContain('0 CrUX field records across')
  })
})
