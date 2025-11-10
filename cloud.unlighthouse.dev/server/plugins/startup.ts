import { runMigrations } from '../utils/migrations'
import { validateEnv } from '../utils/env'

/**
 * Nitro plugin that runs on server startup
 * Handles migrations, validation, and initialization
 */
export default defineNitroPlugin(async (nitroApp) => {
  console.log('[STARTUP] Initializing server...')

  try {
    // 1. Validate environment
    validateEnv()

    // 2. Run database migrations
    await runMigrations()

    console.log('[STARTUP] ✓ Server initialized successfully')
  }
  catch (error) {
    console.error('[STARTUP] ✗ Failed to initialize server:', error)
    // In production, you might want to exit here
    // process.exit(1)
  }

  // Cleanup on shutdown
  nitroApp.hooks.hook('close', async () => {
    console.log('[SHUTDOWN] Cleaning up...')

    // Close database connections
    const { closeDatabase } = await import('../database')
    await closeDatabase()

    // Cleanup Chrome pool if it exists
    try {
      const { shutdownChromePool } = await import('../app/services/chrome-pool')
      await shutdownChromePool()
    }
    catch {
      // Chrome pool might not be initialized
    }

    // Cleanup rate limiter
    try {
      const { getRateLimiter } = await import('../utils/rate-limit')
      getRateLimiter().cleanup()
    }
    catch {
      // Rate limiter might not be initialized
    }

    console.log('[SHUTDOWN] ✓ Cleanup complete')
  })
})
