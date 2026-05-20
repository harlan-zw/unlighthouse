// Minimal Unlighthouse Cloudflare Worker.
//
// Two default exports: the main fetch handler (HTTP + WebSocket fanout
// via ScanEventsDO) and the sweeperWorker (cron-triggered R2 TTL sweep).
// Wrangler routes the cron trigger to the second; everything else goes
// to the first.
//
// Bindings expected on env (declared in wrangler.toml):
//   DB                  D1Database  — scan + route rows
//   BLOBS               R2Bucket    — LHR / reconciled blobs
//   SCAN_EVENTS_DO      DO          — WS fanout for live scan events
//   RATE_LIMITER_DO     DO          — token-bucket rate limiter
//   LIGHTHOUSE_CONTAINER DO         — Container running real Lighthouse
//
// Secrets (set via `wrangler secret put`):
//   SHARED_AUDIT_TOKEN  — Bearer shared with the LighthouseContainer
//   CRUX_API_KEY        — optional; enables CrUX fallback
//
// Vars (also in wrangler.toml):
//   UNLIGHTHOUSE_CONFIG          JSON-encoded unlighthouse config
//   UNLIGHTHOUSE_VERSION         surfaced by `manifest` + `health`
//   RATE_LIMITER_CAPACITY        bucket size (default 10)
//   RATE_LIMITER_REFILL_PER_SEC  refill rate (default 1)

import type { CloudflareEnv } from '@unlighthouse/cloudflare'
import type { NamedAuditor } from '@unlighthouse/contracts/ports'
import {

  createCloudflareApp,
  LighthouseContainer,
  RateLimiterDO,
  ScanEventsDO,
  sweeperWorker,
} from '@unlighthouse/cloudflare'
import { createContainerLighthouseAuditor } from '@unlighthouse/cloudflare-lighthouse/worker'
import { createCruxAuditor } from '@unlighthouse/core/auditors/crux'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { fallbackAuditor } from '@unlighthouse/core/auditors/route'

// Re-export the Durable Object + Container classes so the Workers runtime
// can find them when wrangler.toml references `class_name = "..."`.
export { LighthouseContainer, RateLimiterDO, ScanEventsDO }

export default {
  async fetch(req: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const handler = createCloudflareApp(env, {
      auditorFactory: (cfEnv) => {
        const tiers: NamedAuditor[] = []

        // Tier 1: Real Lighthouse in the Container, via Browser Run CDP.
        if (cfEnv.LIGHTHOUSE_CONTAINER && cfEnv.SHARED_AUDIT_TOKEN) {
          tiers.push({
            name: 'container-lighthouse',
            auditor: createContainerLighthouseAuditor({
              container: cfEnv.LIGHTHOUSE_CONTAINER,
              token: cfEnv.SHARED_AUDIT_TOKEN,
            }),
          })
        }

        // Tier 2: CrUX field data — survives Container outages, no lab metrics.
        if (cfEnv.CRUX_API_KEY) {
          tiers.push({
            name: 'crux',
            auditor: createCruxAuditor({ apiKey: cfEnv.CRUX_API_KEY }),
          })
        }

        // Tier 3: mock — last resort so the API never 5xx's on auditor outage.
        // Remove from production deploys once tiers 1-2 prove stable.
        tiers.push({ name: 'mock', auditor: createMockAuditor() })

        return fallbackAuditor(tiers)
      },
    })
    return handler.fetch(req, env, ctx)
  },
  scheduled: sweeperWorker.scheduled,
}
