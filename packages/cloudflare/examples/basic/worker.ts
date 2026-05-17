// Minimal Unlighthouse Cloudflare Worker.
//
// Two default exports: the main fetch handler (HTTP + WebSocket fanout
// via ScanEventsDO) and the sweeperWorker (cron-triggered R2 TTL sweep).
// Wrangler routes the cron trigger to the second; everything else goes
// to the first.
//
// Bindings expected on env (declared in wrangler.toml):
//   DB                R2Bucket   — D1 database for scan + route rows
//   BLOBS             R2Bucket   — R2 bucket for LHR / reconciled blobs
//   BROWSER           Browser    — Browser Rendering binding
//   SCAN_EVENTS_DO    DO         — durable object namespace
//   RATE_LIMITER_DO   DO         — durable object namespace
//
// Vars (also in wrangler.toml):
//   UNLIGHTHOUSE_CONFIG          JSON-encoded unlighthouse config
//   UNLIGHTHOUSE_VERSION         surfaced by `manifest` + `health`
//   RATE_LIMITER_CAPACITY        bucket size (default 10)
//   RATE_LIMITER_REFILL_PER_SEC  refill rate (default 1)

import {
  type CloudflareEnv,
  createCloudflareApp,
  RateLimiterDO,
  ScanEventsDO,
  sweeperWorker,
} from '@unlighthouse/cloudflare'

// Re-export the Durable Object classes so the Workers runtime can find
// them when wrangler.toml references `class_name = "ScanEventsDO"` etc.
export { RateLimiterDO, ScanEventsDO }

// Main HTTP + WS handler.
const app = {
  async fetch(req: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const handler = createCloudflareApp(env)
    return handler.fetch(req, env, ctx)
  },
  // Cron trigger → R2 TTL sweep. wrangler.toml `[triggers] crons = [...]`
  // routes scheduled events here; the rest of the file's exports stay
  // available for normal request traffic.
  scheduled: sweeperWorker.scheduled,
}

export default app
