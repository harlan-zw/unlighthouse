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
  items: any[] | null
  scoreDisplayMode: string
}

const CATEGORY_ICONS: Record<string, string> = {
  'performance': 'lucide:gauge',
  'accessibility': 'lucide:accessibility',
  'seo': 'lucide:search',
  'best-practices': 'lucide:shield-check',
  'agentic-browsing': 'lucide:bot',
}

const CATEGORY_LABELS: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
  'agentic-browsing': 'Agentic Browsing',
}

const METRIC_THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  TBT: [200, 600],
  FCP: [1800, 3000],
  SI: [3400, 5800],
  TTFB: [800, 1800],
  INP: [200, 500],
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
  catch {
    return `${site}${path}`
  }
}

function formatRouteDetailMetric(value: number | null | undefined, unit: string = 'ms'): string {
  if (value === null || value === undefined)
    return '—'
  if (unit === 'ms')
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

function routeMetricColor(label: string, value: number | null | undefined): string {
  if (value == null)
    return 'text-muted'
  const [good, poor] = METRIC_THRESHOLDS[label] || [Infinity, Infinity]
  if (value <= good)
    return 'text-success'
  if (value <= poor)
    return 'text-warning'
  return 'text-error'
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

function hasVisibleAuditItem(item: any): boolean {
  return !!(item.url || item.node?.snippet || item.reason || item.wastedBytes || item.wastedMs || item.snippet)
}

function hasNonZeroSavings(savings: Record<string, any>): boolean {
  return Object.values(savings).some(value => typeof value === 'number' ? value > 0 : !!value)
}

export function useRouteDetail() {
  const route = useRoute()
  const router = useRouter()
  const api = useApi()
  const config = useRuntimeConfig()
  const screenshotUrl = useScreenshotUrl()
  const { scoreToLabel, scoreToRingColor } = useScoreColor()
  const { fmtBytes: formatBytes } = useFormat()

  const scanId = getScanId()
  const routePath = routeParamPath(route.params.path)
  const baseUrl = config.public.unlighthouseApiUrl as string

  const rescanning = ref(false)
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

  const { data: scanMeta, status: scanMetaStatus } = useAsyncData(
    `route-scanmeta-${scanId}`,
    () => api['scan.meta']({ scanId }).catch(() => null),
  )

  const fullUrl = computed(() => resolveRouteUrl(routePath, scanMeta.value?.site))

  const { data: routeData, status } = useAsyncData(
    `route-detail-${scanId}-${routePath}`,
    async () => {
      if (!fullUrl.value)
        return null
      try {
        return await api['route.get']({
          scanId,
          url: fullUrl.value,
          device: deviceFilter.value || undefined,
        })
      }
      catch {
        return null
      }
    },
    { watch: [deviceFilter, fullUrl] },
  )

  async function rescanRoute() {
    rescanning.value = true
    try {
      await api['route.rescan']({ scanId, url: routeData.value?.route?.url || fullUrl.value })
      toast.success('Route rescan started')
    }
    catch (err: any) {
      toast.error('Rescan failed', { description: err.message })
    }
    finally {
      rescanning.value = false
    }
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
        icon: CATEGORY_ICONS[category.id] || 'lucide:folder',
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
