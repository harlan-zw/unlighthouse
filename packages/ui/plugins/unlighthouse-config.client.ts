import type { Ref } from 'vue'
import { createClient } from '@unlighthouse/core/api/client'

export interface UnlighthouseRuntimeConfig {
  apiUrl: Ref<string>
  websocketUrl: Ref<string>
  isStatic: Ref<boolean>
  website: Ref<string>
  device: Ref<string>
  routerPrefix: Ref<string>
  configColumns: Ref<Record<string, any>>
  groupRoutesKey: Ref<string>
  resolveArtifactPath: (report: any, filename: string) => string
}

export default defineNuxtPlugin({
  name: 'unlighthouse-config',
  setup() {
    const payload = typeof window !== 'undefined' ? window.__unlighthouse_payload : null
    const isStaticFlag = typeof window !== 'undefined' && window.__unlighthouse_static === true

    const apiUrl = computed(() => {
      if (payload?.options?.apiUrl)
        return payload.options.apiUrl
      if (typeof window !== 'undefined')
        return `${window.location.origin}/api`
      return '/api'
    })

    const websocketUrl = computed(() => {
      if (payload?.options?.websocketUrl)
        return payload.options.websocketUrl
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${window.location.host}/ws`
      }
      return ''
    })

    function resolveArtifactPath(report: any, filename: string): string {
      if (!report)
        return ''
      if (report.artifactUrl)
        return `${report.artifactUrl}/${filename}`
      const path = encodeURIComponent(report.route?.path || '/')
      return `${apiUrl.value}/reports/${path}/${filename}`
    }

    const config: UnlighthouseRuntimeConfig = {
      apiUrl,
      websocketUrl,
      isStatic: computed(() => isStaticFlag),
      website: computed(() => payload?.options?.site || ''),
      device: computed(() => payload?.options?.scanner?.device || 'mobile'),
      routerPrefix: computed(() => payload?.options?.routerPrefix || ''),
      configColumns: computed(() => payload?.options?.client?.columns || {}),
      groupRoutesKey: computed(() => payload?.options?.client?.groupRoutesKey || 'route.definition.name'),
      resolveArtifactPath,
    }

    const api = createClient({ baseUrl: apiUrl.value || '/api' })

    return {
      provide: { uconfig: config, api },
    }
  },
})
