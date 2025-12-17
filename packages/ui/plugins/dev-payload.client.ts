import { initPayload } from '~/composables/unlighthouse'

// In dev mode, set up payload to connect to local Unlighthouse server
export default defineNuxtPlugin(() => {
  if (import.meta.dev && !window.__unlighthouse_payload) {
    const serverPort = 5678
    const serverUrl = `http://localhost:${serverPort}`

    window.__unlighthouse_payload = {
      options: {
        site: '',
        client: { columns: {}, groupRoutesKey: 'route.path' },
        websocketUrl: `ws://localhost:${serverPort}/api/ws`,
        apiUrl: `${serverUrl}/api`,
        lighthouseOptions: {},
        scanner: { dynamicSampling: false, throttle: false, device: 'mobile' },
        routerPrefix: '/',
      },
      reports: [],
      scanMeta: { routes: 0, score: 0 },
    }

    window.__unlighthouse_static = false
    initPayload()
  }
})
