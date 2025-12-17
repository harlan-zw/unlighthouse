import type { UnlighthouseRouteReport } from '@unlighthouse/core'
import { startCase } from 'lodash-es'
import { $URL, joinURL } from 'ufo'

// Icon names for tabs
const ICONS = {
  overview: 'i-mdi-view-dashboard',
  performance: 'i-mdi-speedometer',
  accessibility: 'i-mdi-accessibility',
  'best-practices': 'i-mdi-thumb-up',
  seo: 'i-mdi-web',
  pwa: 'i-mdi-cellphone',
  crux: 'i-mdi-world',
} as const

function getPayload() {
  if (import.meta.server) {
    return {
      options: {
        site: '',
        client: { columns: {}, groupRoutesKey: 'route.path' },
        websocketUrl: '',
        apiUrl: '/api',
        lighthouseOptions: {},
        scanner: { dynamicSampling: false, throttle: false, device: 'mobile' },
        routerPrefix: '/',
      },
      reports: [],
      scanMeta: { scannedRoutes: 0, finishedRoutes: 0 },
    }
  }
  return window.__unlighthouse_payload!
}

// Lazy-initialized config values
let _config: ReturnType<typeof createConfig> | null = null

function createConfig() {
  const payload = getPayload()
  const options = payload.options

  return {
    isStatic: import.meta.client ? (window.__unlighthouse_static ?? true) : true,
    site: options.site || '',
    apiUrl: options.apiUrl || '/api',
    wsUrl: options.websocketUrl || '',
    basePath: options.routerPrefix || '/',
    groupRoutesKey: options.client?.groupRoutesKey || 'route.path',
    configColumns: options.client?.columns || {},
    lighthouseOptions: options.lighthouseOptions || {},
    dynamicSampling: options.scanner?.dynamicSampling ?? false,
    throttle: options.scanner?.throttle ?? false,
    device: options.scanner?.device || 'mobile',
    website: options.site ? new $URL(options.site).origin : '',
    categories: options.lighthouseOptions?.onlyCategories || ['performance', 'accessibility', 'best-practices', 'seo'],
  }
}

function getConfig() {
  if (!_config) _config = createConfig()
  return _config
}

// Direct exports for auto-import compatibility
export const isStatic = computed(() => getConfig().isStatic)
export const site = computed(() => getConfig().site)
export const apiUrl = computed(() => getConfig().apiUrl)
export const wsUrl = computed(() => getConfig().wsUrl)
export const basePath = computed(() => getConfig().basePath)
export const groupRoutesKey = computed(() => getConfig().groupRoutesKey)
export const configColumns = computed(() => getConfig().configColumns)
export const lighthouseOptions = computed(() => getConfig().lighthouseOptions)
export const dynamicSampling = computed(() => getConfig().dynamicSampling)
export const throttle = computed(() => getConfig().throttle)
export const device = computed(() => getConfig().device)
export const website = computed(() => getConfig().website)
export const categories = computed(() => getConfig().categories)

// Tabs with icons
export const tabs = computed(() => {
  const cats = getConfig().categories
  const tabLabels = [
    'Overview',
    ...cats.map((c: string) => c === 'seo' ? 'SEO' : startCase(c)),
    cats.includes('performance') ? 'CrUX' : undefined,
  ].filter(Boolean) as string[]

  return tabLabels.map((label) => {
    const key = label.toLowerCase().replace(' ', '-') as keyof typeof ICONS
    return { label, icon: ICONS[key] || ICONS.overview }
  })
})

export function resolveArtifactPath(report: UnlighthouseRouteReport, file: string): string {
  if (!report?.artifactUrl) return ''

  const config = getConfig()
  const withoutBase = report.artifactUrl.replace(config.basePath, '')

  if (config.isStatic) {
    let cleanPathname = window.location.pathname
    cleanPathname = cleanPathname.replace(/\/index\.html$/, '')
    return joinURL(cleanPathname, withoutBase, file)
  }

  return joinURL(window.location.pathname, withoutBase, file)
}
