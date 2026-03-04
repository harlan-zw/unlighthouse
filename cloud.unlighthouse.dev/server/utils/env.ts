import { z } from 'zod'

/**
 * Validate environment variables on startup
 */
export function validateEnv() {
  console.log('[ENV] Validating environment variables...')

  const schema = z.object({
    // Browserless is required for /api/scan-browserless
    NUXT_BROWSERLESS_TOKEN: z.string().optional(),
    NUXT_BROWSERLESS_URL: z.string().url().optional(),

    // Database
    DATABASE_DIR: z.string().optional(),
    DATABASE_URL: z.string().optional(),

    // Chrome pool (optional, for self-hosted)
    NUXT_LIGHTHOUSE_MIN_CHROME_INSTANCES: z.coerce.number().int().min(1).optional(),
    NUXT_LIGHTHOUSE_MAX_CHROME_INSTANCES: z.coerce.number().int().min(1).optional(),
    NUXT_LIGHTHOUSE_CHROME_IDLE_TIMEOUT: z.coerce.number().int().min(0).optional(),
    NUXT_LIGHTHOUSE_MAX_CONCURRENCY: z.coerce.number().int().min(1).optional(),

    // Node environment
    NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  })

  try {
    schema.parse(process.env)

    // Warn if Browserless token is missing
    if (!process.env.NUXT_BROWSERLESS_TOKEN) {
      console.warn('[ENV] ⚠️  NUXT_BROWSERLESS_TOKEN not set - /api/scan-browserless will fail')
    }

    console.log('[ENV] ✓ Environment variables validated')
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[ENV] ✗ Invalid environment variables:')
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
      throw new Error('Environment validation failed')
    }
    throw error
  }
}
