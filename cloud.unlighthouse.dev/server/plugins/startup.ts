import { shutdownChromePool } from '../app/services/chrome-pool'
import { closeDatabase } from '../database'
import { validateEnv } from '../utils/env'
import { runMigrations } from '../utils/migrations'
import { getRateLimiter } from '../utils/rate-limit'

/**
 * Nitro plugin: validates env, runs migrations, registers shutdown cleanup.
 */
export default defineNitroPlugin(async (nitroApp) => {
  console.warn('[STARTUP] Initializing server...')

  try {
    validateEnv()
    await runMigrations()
    console.warn('[STARTUP] ✓ Server initialized successfully')
  }
  catch (error) {
    console.error('[STARTUP] ✗ Failed to initialize server:', error)
  }

  nitroApp.hooks.hook('close', async () => {
    console.warn('[SHUTDOWN] Cleaning up...')
    await closeDatabase()
    await shutdownChromePool().catch(() => {})
    getRateLimiter().cleanup()
    console.warn('[SHUTDOWN] ✓ Cleanup complete')
  })
})
