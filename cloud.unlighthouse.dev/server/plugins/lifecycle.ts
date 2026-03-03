import { initializeChromePool, shutdownChromePool } from '../app/services/chrome-pool'

export default defineNitroPlugin((nitroApp) => {
  // Initialize Chrome pool on startup
  nitroApp.hooks.hook('request', async () => {
    // Only initialize once
    if (!(nitroApp as any)._chromePoolInitialized) {
      try {
        console.warn('Initializing Chrome pool...')
        await initializeChromePool()
        ;(nitroApp as any)._chromePoolInitialized = true
        console.warn('Chrome pool initialized successfully')
      }
      catch (e) {
        console.error('Failed to initialize Chrome pool:', e)
      }
    }
  })

  // Cleanup on shutdown
  nitroApp.hooks.hook('close', async () => {
    console.warn('Shutting down Chrome pool...')
    await shutdownChromePool()
    console.warn('Chrome pool shut down successfully')
  })
})
