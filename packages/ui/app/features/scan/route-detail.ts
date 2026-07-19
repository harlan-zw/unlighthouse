import type { CommandOutput, RouteGet } from '@unlighthouse/contracts/commands'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { createScreenshotUrl, getScanId } from '~/features/scan/route-context'

type DeviceFilter = '' | 'mobile' | 'desktop'
type RouteGetOutput = CommandOutput<typeof RouteGet>
type AuditEntry = RouteGetOutput['audits'][string]
type AuditItem = NonNullable<AuditEntry['items']>[number]
interface RouteScoreSummary {
  id: string
  label: string
  score: number | null
  categoryScoreDisplayMode: 'gauge' | 'fraction'
  auditCount: number
  passingCount: number
}

interface RouteMetric {
  label: string
  value: number | null
  unit: 'ms' | ''
  description: string
}

interface RichTextPart {
  text: string
  href?: string
}

const CATEGORY_ICONS: Record<string, string> = {
  'performance': 'gauge',
  'accessibility': 'accessibility',
  'seo': 'search',
  'best-practices': 'shield-check',
  'agentic-browsing': 'bot',
}

const CATEGORY_LABELS: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
  'agentic-browsing': 'Agentic Browsing',
}

function routeParamPath(value: unknown): string {
  if (Array.isArray(value))
    return decodeURIComponent(value.join('/'))
  return decodeURIComponent(String(value ?? ''))
}

function resolveRouteUrl(path: string, site?: string | null): string {
  if (!site)
    return ''
  try {
    return new URL(path, site).toString()
  }
  catch (_err) {
    // Preserve legacy path concatenation when URL construction fails.
    return `${site}${path}`
  }
}

function formatRouteDetailMetric(value: number | null | undefined, unit: 'ms' | '' = 'ms'): string {
  return formatMetricValue(value, unit)
}

function routeMetricColor(label: string, value: number | null | undefined): string {
  switch (cwvBand(label, value)) {
    case 'good': return 'text-success'
    case 'average': return 'text-warning'
    case 'poor': return 'text-error'
    default: return 'text-muted'
  }
}

function routeSeverityColor(severity: string): 'error' | 'warning' | 'neutral' {
  if (severity === 'fail')
    return 'error'
  if (severity === 'warn')
    return 'warning'
  return 'neutral'
}

function parseMarkdownLinks(text: string): RichTextPart[] {
  const parts: RichTextPart[] = []
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g
  let cursor = 0
  for (const match of text.matchAll(linkPattern)) {
    const index = match.index ?? 0
    if (index > cursor)
      parts.push({ text: text.slice(cursor, index) })

    const label = match[1] ?? ''
    const rawHref = match[2] ?? ''
    try {
      const url = new URL(rawHref)
      if (url.protocol === 'http:' || url.protocol === 'https:')
        parts.push({ text: label, href: url.toString() })
      else
        parts.push({ text: match[0] })
    }
    catch {
      parts.push({ text: match[0] })
    }
    cursor = index + match[0].length
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor) })
  return parts
}

function hasVisibleAuditItem(item: AuditItem): boolean {
  return !!(item.url || item.node?.snippet || item.reason || item.wastedBytes || item.wastedMs || item.snippet)
}

function hasNonZeroSavings(savings: NonNullable<AuditEntry['metricSavings']>): boolean {
  return Object.values(savings).some(value => typeof value === 'number' ? value > 0 : !!value)
}

export function useRouteDetail() {
  const route = useRoute()
  const router = useRouter()
  const screenshotUrl = createScreenshotUrl()
  const { scoreToColor, scoreToLabel } = createScoreColorHelpers()
  const { fmtBytes: formatBytes } = createFormatters()

  const scanId = getScanId()
  const routePath = routeParamPath(route.params.path)
  const baseUrl = getRuntimeApiUrl()

  const screenshotVisible = ref(true)
  const screenshotExpanded = ref(false)
  const deviceFilter = ref<DeviceFilter>('')

  function backToRoutes() {
    if (import.meta.client && window.history.length <= 1) {
      router.push(`/sites/${route.params.siteId}/scans/${scanId}/routes`)
      return
    }
    router.back()
  }

  const { data: scanMeta, status: scanMetaStatus, error: scanMetaError, refresh: refreshScanMeta } = useApiQuery(
    'scan.meta',
    () => ({ scanId }),
  )

  const fullUrl = computed(() => resolveRouteUrl(routePath, scanMeta.value?.site))

  // Gated on `fullUrl` (derived from scanMeta.site) — until the meta loads
  // there's no absolute URL to fetch. The input getter reads `fullUrl` +
  // `deviceFilter`, so the key changes (and refetches) when either does.
  const { data: routeData, status, error: routeError, refresh: refreshRoute } = useApiQuery(
    'route.get',
    () => ({ scanId, url: fullUrl.value, device: deviceFilter.value || undefined }),
    { enabled: () => !!fullUrl.value },
  )

  const rescan = useApiMutation('route.rescan')
  const rescanning = rescan.isPending
  async function rescanRoute() {
    const result = await rescan.mutateSafe({ scanId, url: routeData.value?.route?.url || fullUrl.value })
    if (result._tag === 'err') {
      toast.error('Route rescan failed', { description: `${normalizeApiError(result.error).message}. Check the route URL and retry.` })
      return
    }
    toast.success('Route rescan started')
  }

  const availableDevices = computed(() => routeData.value?.availableDevices ?? [])
  const hasMultipleDevices = computed(() => availableDevices.value.length > 1)

  const rawLhrUrl = computed(() => {
    const routeRow = routeData.value?.route
    if (!routeRow?.lhrBlobKey)
      return ''
    const path = encodeURIComponent(routeRow.path || routePath)
    const device = deviceFilter.value ? `?device=${deviceFilter.value}` : ''
    return `${baseUrl}/dashboard/lhr/${scanId}/${path}${device}`
  })

  const lhrDownloadName = computed(() => `${scanId}-${routeData.value?.route?.device || 'mobile'}.lhr.json`)
  const screenshotFullUrl = computed(() => screenshotUrl(
    scanId,
    routeData.value?.route?.path || routePath,
    routeData.value?.route?.device || deviceFilter.value || undefined,
  ))
  const screenshotImageUrl = computed(() => screenshotUrl(
    scanId,
    routeData.value?.route?.path || routePath,
    routeData.value?.route?.device || deviceFilter.value || undefined,
  ))

  const scores = computed(() => {
    const categorySummaries = routeData.value?.categories
    if (categorySummaries?.length) {
      return categorySummaries
        .filter(category => category.score != null)
        .map<RouteScoreSummary>(category => ({
          id: category.id,
          label: CATEGORY_LABELS[category.id] || category.title,
          score: category.score,
          categoryScoreDisplayMode: category.categoryScoreDisplayMode ?? 'gauge',
          auditCount: category.auditCount,
          passingCount: category.passingCount,
        }))
    }

    const routeRow = routeData.value?.route
    if (!routeRow)
      return []
    const categories: RouteScoreSummary[] = [
      { id: 'performance', label: 'Performance', score: routeRow.scorePerformance, categoryScoreDisplayMode: 'gauge', auditCount: 0, passingCount: 0 },
      { id: 'accessibility', label: 'Accessibility', score: routeRow.scoreAccessibility, categoryScoreDisplayMode: 'gauge', auditCount: 0, passingCount: 0 },
      { id: 'seo', label: 'SEO', score: routeRow.scoreSeo, categoryScoreDisplayMode: 'gauge', auditCount: 0, passingCount: 0 },
      { id: 'best-practices', label: 'Best Practices', score: routeRow.scoreBestPractices, categoryScoreDisplayMode: 'gauge', auditCount: 0, passingCount: 0 },
    ]
    if (routeRow.scoreAgenticBrowsing != null)
      categories.push({ id: 'agentic-browsing', label: 'Agentic Browsing', score: routeRow.scoreAgenticBrowsing, categoryScoreDisplayMode: 'fraction', auditCount: 0, passingCount: 0 })
    return categories.filter(category => category.score != null)
  })

  function categoryScoreLabel(category: RouteScoreSummary): string | number {
    if (category.categoryScoreDisplayMode === 'fraction' && category.auditCount > 0)
      return `${category.passingCount}/${category.auditCount}`
    return scoreToLabel(category.score)
  }

  const metrics = computed<RouteMetric[]>(() => {
    const routeRow = routeData.value?.route
    if (!routeRow)
      return []
    return [
      { label: 'LCP', value: routeRow.lcp, unit: 'ms', description: 'Largest Contentful Paint' },
      { label: 'CLS', value: routeRow.cls, unit: '', description: 'Cumulative Layout Shift' },
      { label: 'TBT', value: routeRow.tbt, unit: 'ms', description: 'Total Blocking Time' },
      { label: 'FCP', value: routeRow.fcp, unit: 'ms', description: 'First Contentful Paint' },
      { label: 'SI', value: routeRow.si, unit: 'ms', description: 'Speed Index' },
      { label: 'TTFB', value: routeRow.ttfb, unit: 'ms', description: 'Time to First Byte' },
      { label: 'INP', value: routeRow.inp, unit: 'ms', description: 'Interaction to Next Paint' },
    ]
  })

  const categoryAudits = computed(() => {
    const categories = routeData.value?.categories
    const audits = routeData.value?.audits
    if (!categories || !audits)
      return []

    return categories.map((category) => {
      const categoryAudits = category.auditRefs
        .map(ref => audits[ref.id])
        .filter((audit): audit is AuditEntry => !!audit)

      const failing = categoryAudits
        .filter(audit => audit.severity === 'fail' || audit.severity === 'warn')
        .sort((a, b) => {
          if (a.severity === 'fail' && b.severity !== 'fail')
            return -1
          if (a.severity !== 'fail' && b.severity === 'fail')
            return 1
          return (a.score ?? 0) - (b.score ?? 0)
        })

      const passing = categoryAudits
        .filter(audit => audit.severity === 'pass' && audit.scoreDisplayMode !== 'notApplicable' && audit.scoreDisplayMode !== 'manual')

      const notApplicable = categoryAudits
        .filter(audit => audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'manual')

      return {
        id: category.id,
        label: CATEGORY_LABELS[category.id] || category.title,
        icon: CATEGORY_ICONS[category.id] || 'folder',
        score: category.score,
        categoryScoreDisplayMode: category.categoryScoreDisplayMode ?? 'gauge',
        failing,
        passing,
        notApplicable,
      }
    })
  })

  return {
    scanId,
    routePath,
    status,
    scanMetaStatus,
    routeError,
    scanMetaError,
    refreshRoute,
    refreshScanMeta,
    routeData,
    rescanning,
    screenshotVisible,
    screenshotExpanded,
    deviceFilter,
    availableDevices,
    hasMultipleDevices,
    rawLhrUrl,
    lhrDownloadName,
    screenshotFullUrl,
    screenshotImageUrl,
    scores,
    metrics,
    categoryAudits,
    scoreToColor,
    scoreToLabel,
    categoryScoreLabel,
    formatBytes,
    formatMetric: formatRouteDetailMetric,
    metricColor: routeMetricColor,
    severityColor: routeSeverityColor,
    parseMarkdownLinks,
    hasVisibleContent: hasVisibleAuditItem,
    hasNonZeroSavings,
    backToRoutes,
    rescanRoute,
  }
}
