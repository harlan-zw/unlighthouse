// Cloudflare Container DO wrapper for the unlighthouse Lighthouse host.
//
// Container source + Dockerfile live in `@unlighthouse/lighthouse-container`.
// This class is just the Worker-side DO that backs the binding declared in
// wrangler.jsonc — Cloudflare's runtime auto-routes incoming `fetch()` calls
// to the container's `defaultPort`.
//
// Lifecycle config:
//  - `defaultPort = 8080` — matches `process.env.PORT ?? 8080` in server.ts.
//  - `sleepAfter = '2m'` — the container is shared by concurrent scans, so its
//    own idle policy owns shutdown. A per-scan runner must not stop the shared
//    `default` instance while another scan can still be using it.
//
// The Worker-facing Cloudflare values are translated into the generic image
// interface: SHARED_AUDIT_TOKEN, BROWSER_WS_ENDPOINT, BROWSER_WS_TOKEN.

import { Container } from '@cloudflare/containers'
import { logOperationalError } from '@unlighthouse/contracts/logging'

interface LighthouseContainerEnv {
  SHARED_AUDIT_TOKEN?: string
  CF_ACCOUNT_ID?: string
  CF_BROWSER_RUN_TOKEN?: string
  CF_BROWSER_KEEP_ALIVE_MS?: string
}

type ContainerContext = ConstructorParameters<typeof Container>[0]

export class LighthouseContainer extends Container<LighthouseContainerEnv> {
  override defaultPort = 8080
  override sleepAfter = '2m'

  constructor(ctx: ContainerContext, env: LighthouseContainerEnv) {
    super(ctx, env)
    // Hand Worker secrets to the container process. envVars is consulted by
    // the base Container class on every `start()`; we set it from the
    // synchronous Worker env so the container has everything it needs by
    // the time server.ts boots and calls `required('...')`.
    const keepAliveMs = Number(env.CF_BROWSER_KEEP_ALIVE_MS ?? 60000)
    const browserWSEndpoint = env.CF_ACCOUNT_ID
      ? `wss://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}`
      + `/browser-rendering/devtools/browser?keep_alive=${keepAliveMs}`
      : ''
    this.envVars = {
      SHARED_AUDIT_TOKEN: env.SHARED_AUDIT_TOKEN ?? '',
      BROWSER_WS_ENDPOINT: browserWSEndpoint,
      BROWSER_WS_TOKEN: env.CF_BROWSER_RUN_TOKEN ?? '',
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
    logOperationalError('cloudflare.lighthouse_container_error', error, {}, console)
  }
}
