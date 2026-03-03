import { initPayload } from '~/composables/unlighthouse'

// Set up payload for non-static mode (dev or production with live server)
export default defineNuxtPlugin(() => {
  // If payload already set by static build, skip
  if (window.__unlighthouse_payload)
    return

  // For dev mode or production with live server, configure for API access
  const serverPort = 5678
  const serverUrl = import.meta.dev ? `http://localhost:${serverPort}` : ''

  window.__unlighthouse_payload = {
    options: {
      site: '',
      client: { columns: {}, groupRoutesKey: 'route.path' },
      websocketUrl: import.meta.dev ? `ws://localhost:${serverPort}/api/ws` : '',
      apiUrl: `${serverUrl}/api`,
      lighthouseOptions: {},
      scanner: { dynamicSampling: false, throttle: false, device: 'mobile' },
      routerPrefix: '/',
    },
    reports: [],
    scanMeta: { routes: 0, score: 0 },
  }

  // Not static - we have a live server for API and artifacts
  window.__unlighthouse_static = false
  initPayload()
})
