// Cloudflare Container DO wrapper for the unlighthouse Lighthouse host.
//
// Container source + Dockerfile live in `@unlighthouse/cloudflare-lighthouse`.
// This class is just the Worker-side DO that backs the binding declared in
// wrangler.toml — Cloudflare's runtime auto-routes incoming `fetch()` calls
// to the container's `defaultPort`.
//
// Lifecycle config:
//  - `defaultPort = 8080` — matches `process.env.PORT ?? 8080` in server.ts.
//  - `sleepAfter = '10m'` — Container hibernates after 10 min of no requests.
//    Matches Browser Run's max `keep_alive` so the inside-Container Browser
//    Run session and the Container itself wake/sleep together.
//
// Secrets propagated to the Container as env vars: SHARED_AUDIT_TOKEN,
// CF_ACCOUNT_ID, CF_BROWSER_RUN_TOKEN. The Container's server.ts requires
// all three at startup. If any are missing the Container crashes early and
// `fallbackAuditor` in the Worker takes over (CrUX or mock).

import type { DurableObjectState } from '@cloudflare/workers-types'
import { Container } from '@cloudflare/containers'

interface LighthouseContainerEnv {
  SHARED_AUDIT_TOKEN?: string
  CF_ACCOUNT_ID?: string
  CF_BROWSER_RUN_TOKEN?: string
}

export class LighthouseContainer extends Container<LighthouseContainerEnv> {
  override defaultPort = 8080
  override sleepAfter = '10m'

  constructor(ctx: DurableObjectState, env: LighthouseContainerEnv) {
    super(ctx as never, env)
    // Hand Worker secrets to the container process. envVars is consulted by
    // the base Container class on every `start()`; we set it from the
    // synchronous Worker env so the container has everything it needs by
    // the time server.ts boots and calls `required('...')`.
    this.envVars = {
      SHARED_AUDIT_TOKEN: env.SHARED_AUDIT_TOKEN ?? '',
      CF_ACCOUNT_ID: env.CF_ACCOUNT_ID ?? '',
      CF_BROWSER_RUN_TOKEN: env.CF_BROWSER_RUN_TOKEN ?? '',
    }
  }

  override onStart(): void {
    // eslint-disable-next-line no-console
    console.log('[LighthouseContainer] started')
  }

  override onStop(): void {
    // eslint-disable-next-line no-console
    console.log('[LighthouseContainer] stopped')
  }

  override onError(error: unknown): void {
    // eslint-disable-next-line no-console
    console.error('[LighthouseContainer] error:', error)
  }
}
