import type { ScanId } from '@unlighthouse/contracts'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { getScanId, useScreenshotUrl } from '~/features/scan/route-context'

type DeviceFilter = '' | 'mobile' | 'desktop'

interface AuditEntry {
  id: string
  title: string | null
  description: string | null
  severity: 'pass' | 'warn' | 'fail'
  score: number | null
  displayValue: string | null
  metricSavings: Record<string, number> | null
  items: AuditItem[] | null
  scoreDisplayMode: string
}

// Lighthouse audit-detail items carry pack-specific shapes; this view only
// probes a handful of fields to decide whether a row has drill-in content.
interface AuditItem {
  url?: string
  node?: { snippet?: string, nodeLabel?: string }
  reason?: string
  wastedBytes?: number
  wastedMs?: number
  totalBytes?: number
  transferSize?: number
  blockingTime?: number
  snippet?: string
  [key: string]: unknown
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

function formatRouteDetailMetric(value: number | null | undefined, unit: string = 'ms'): string {
  return formatMetricValue(value, unit as 'ms' | '')
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

function renderMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="underline text-primary hover:text-primary/80">$1</a>')
}

function hasVisibleAuditItem(item: AuditItem): boolean {
  return !!(item.url || item.node?.snippet || item.reason || item.wastedBytes || item.wastedMs || item.snippet)
}

function hasNonZeroSavings(savings: Record<string, unknown>): boolean {
  return Object.values(savings).some(value => typeof value === 'number' ? value > 0 : !!value)
}

export function useRouteDetail() {
  const route = useRoute()
  const router = useRouter()
  const config = useRuntimeConfig()
  const screenshotUrl = useScreenshotUrl()
  const { scoreToLabel, scoreToRingColor } = useScoreColor()
  const { fmtBytes: formatBytes } = useFormat()

  const scanId = getScanId()
  const routePath = routeParamPath(route.params.path)
  const baseUrl = config.public.unlighthouseApiUrl as string

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
      toast.error('Rescan failed', { description: normalizeApiError(result.error).message })
      return
    }
    toast.success('Route rescan started')
  }

  const availableDevices = computed<string[]>(() => routeData.value?.availableDevices ?? [])
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
  const screenshotFullUrl = computed(() => screenshotUrl(scanId, routeData.value?.route?.path || routePath))
  const screenshotImageUrl = computed(() => screenshotUrl(
    scanId,
    routeData.value?.route?.path || routePath,
    routeData.value?.route?.device || deviceFilter.value || undefined,
  ))

  const scores = computed(() => {
    const routeRow = routeData.value?.route
    if (!routeRow)
      return []
    const categories = [
      { id: 'performance', label: 'Performance', score: routeRow.scorePerformance },
      { id: 'accessibility', label: 'Accessibility', score: routeRow.scoreAccessibility },
      { id: 'seo', label: 'SEO', score: routeRow.scoreSeo },
      { id: 'best-practices', label: 'Best Practices', score: routeRow.scoreBestPractices },
    ]
    if (routeRow.scoreAgenticBrowsing != null)
      categories.push({ id: 'agentic-browsing', label: 'Agentic Browsing', score: routeRow.scoreAgenticBrowsing })
    return categories.filter(category => category.score != null)
  })

  const metrics = computed(() => {
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
    const categories = routeData.value?.categories as Array<{
      id: string
      title: string
      score: number | null
      auditRefs: Array<{ id: string, weight: number }>
    }> | undefined
    const audits = routeData.value?.audits as Record<string, AuditEntry> | undefined
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
        failing,
        passing,
        notApplicable,
      }
    })
  })

  return {
    scanId: scanId as ScanId,
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
    scoreToLabel,
    scoreToRingColor,
    formatBytes,
    formatMetric: formatRouteDetailMetric,
    metricColor: routeMetricColor,
    severityColor: routeSeverityColor,
    renderMarkdownLinks,
    hasVisibleContent: hasVisibleAuditItem,
    hasNonZeroSavings,
    backToRoutes,
    rescanRoute,
  }
}
