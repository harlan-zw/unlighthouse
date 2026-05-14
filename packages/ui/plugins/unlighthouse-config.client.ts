import type { Ref } from 'vue'

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

declare module '#app' {
  interface NuxtApp {
    $uconfig: UnlighthouseRuntimeConfig
  }
}

export default defineNuxtPlugin({
  name: 'unlighthouse-config',
  setup() {
    const payload = typeof window !== 'undefined' ? window.__unlighthouse_payload : null
    const isStaticFlag = typeof window !== 'undefined' && window.__unlighthouse_static === true
    const runtime = useRuntimeConfig().public as { unlighthouseApiUrl?: string, unlighthouseWsUrl?: string }

    // Resolution order:
    //   1. window.__unlighthouse_payload — production: the CLI host injects these
    //      into the served HTML.
    //   2. runtimeConfig.public — dev: nuxt.config.ts points at the standalone
    //      backend (http://localhost:5678) so we skip the devProxy entirely.
    //   3. same-origin fallback — last-resort for embeds that haven't wired either.
    const apiUrl = computed(() => {
      if (payload?.options?.apiUrl)
        return payload.options.apiUrl
      if (runtime.unlighthouseApiUrl)
        return runtime.unlighthouseApiUrl
      if (typeof window !== 'undefined')
        return `${window.location.origin}/api`
      return '/api'
    })

    const websocketUrl = computed(() => {
      if (payload?.options?.websocketUrl)
        return payload.options.websocketUrl
      if (runtime.unlighthouseWsUrl)
        return runtime.unlighthouseWsUrl
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

    return {
      provide: { uconfig: config },
    }
  },
})
