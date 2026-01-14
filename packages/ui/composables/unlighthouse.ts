import type { UnlighthouseRouteReport } from 'unlighthouse'
import { startCase } from 'lodash-es'
import { $URL, joinURL } from 'ufo'

// Icon names for tabs
const ICONS = {
  'overview': 'i-mdi-view-dashboard',
  'performance': 'i-mdi-speedometer',
  'accessibility': 'i-mdi-accessibility',
  'best-practices': 'i-mdi-thumb-up',
  'seo': 'i-mdi-web',
  'pwa': 'i-mdi-cellphone',
  'crux': 'i-mdi-world',
} as const

const defaultOptions = {
  site: '',
  client: { columns: {}, groupRoutesKey: 'route.path' },
  websocketUrl: '',
  apiUrl: '/api',
  lighthouseOptions: {},
  scanner: { dynamicSampling: false, throttle: false, device: 'mobile' },
  routerPrefix: '/',
}

// Reactive payload ref - gets set by plugin in dev mode or from window in production
const payloadOptions = ref(defaultOptions)
const payloadReady = ref(false)

export function initPayload() {
  if (import.meta.server)
    return

  const payload = window.__unlighthouse_payload
  if (payload?.options) {
    payloadOptions.value = payload.options
  }
  payloadReady.value = true
}

// Auto-init on client after a tick (allows plugin to set window.__unlighthouse_payload first)
if (import.meta.client) {
  setTimeout(initPayload, 0)
}

// Computed config values
export const isStatic = computed(() => {
  if (import.meta.server)
    return true
  return window.__unlighthouse_static ?? true
})

export const site = computed(() => payloadOptions.value.site || '')
export const apiUrl = computed(() => payloadOptions.value.apiUrl || '/api')
export const wsUrl = computed(() => payloadOptions.value.websocketUrl || '')
export const basePath = computed(() => payloadOptions.value.routerPrefix || '/')
export const groupRoutesKey = computed(() => payloadOptions.value.client?.groupRoutesKey || 'route.path')
export const configColumns = computed(() => payloadOptions.value.client?.columns || {})
export const lighthouseOptions = computed(() => payloadOptions.value.lighthouseOptions || {})
export const dynamicSampling = computed(() => payloadOptions.value.scanner?.dynamicSampling ?? false)
export const throttle = computed(() => payloadOptions.value.scanner?.throttle ?? false)
export const device = computed(() => payloadOptions.value.scanner?.device || 'mobile')
export const website = computed(() => site.value ? new $URL(site.value).origin : '')
export const categories = computed(() =>
  (lighthouseOptions.value as any)?.onlyCategories || ['performance', 'accessibility', 'best-practices', 'seo'],
)

// Tabs with icons
export const tabs = computed(() => {
  const cats = categories.value
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
  if (!report?.artifactUrl)
    return ''

  const withoutBase = report.artifactUrl.replace(basePath.value, '')

  if (isStatic.value) {
    let cleanPathname = window.location.pathname
    cleanPathname = cleanPathname.replace(/\/index\.html$/, '')
    return joinURL(cleanPathname, withoutBase, file)
  }

  // In dev mode, use the API server URL for artifacts
  const baseUrl = apiUrl.value.replace('/api', '')
  return joinURL(baseUrl, withoutBase, file)
}
