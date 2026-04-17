// Configuration from window payload or runtime config
const payload = typeof window !== 'undefined' ? window.__unlighthouse_payload : null

export const isStatic = computed(() =>
  typeof window !== 'undefined' && window.__unlighthouse_static === true,
)

export const apiUrl = computed(() => {
  if (payload?.options?.apiUrl)
    return payload.options.apiUrl
  // Default to same origin API
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`
  }
  return '/api'
})

export const websocketUrl = computed(() => {
  if (payload?.options?.websocketUrl)
    return payload.options.websocketUrl
  // Construct from current host
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws`
  }
  return ''
})

export const website = computed(() => payload?.options?.site || '')
export const device = computed(() => payload?.options?.scanner?.device || 'mobile')
export const routerPrefix = computed(() => payload?.options?.routerPrefix || '')

export const configColumns = computed(() => payload?.options?.client?.columns || {})
export const groupRoutesKey = computed(() => payload?.options?.client?.groupRoutesKey || 'route.definition.name')

// Resolve artifact path for screenshots and reports
export function resolveArtifactPath(report: any, filename: string): string {
  if (!report)
    return ''

  // If artifactUrl is provided, use it as base
  if (report.artifactUrl) {
    return `${report.artifactUrl}/${filename}`
  }

  // Otherwise construct from API
  const path = encodeURIComponent(report.route?.path || '/')
  return `${apiUrl.value}/reports/${path}/${filename}`
}
