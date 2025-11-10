/**
 * Payload initialization plugin
 * Ensures window.__unlighthouse_payload and __unlighthouse_static exist
 * This runs before other plugins (00 prefix)
 */
export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    // Ensure static flag exists (will be injected by core package)
    if (typeof window.__unlighthouse_static === 'undefined') {
      window.__unlighthouse_static = true
    }

    // Ensure payload exists with defaults (will be injected by core package)
    if (typeof window.__unlighthouse_payload === 'undefined') {
      window.__unlighthouse_payload = {
        options: {
          site: '',
          client: {
            columns: {},
            groupRoutesKey: 'route.path',
          },
          websocketUrl: '',
          apiUrl: '/api',
          lighthouseOptions: {},
          scanner: {
            dynamicSampling: false,
            throttle: false,
            device: 'mobile',
          },
          routerPrefix: '/',
        },
        reports: [],
        scanMeta: {
          scannedRoutes: 0,
          finishedRoutes: 0,
        },
      }
    }
  }
})
