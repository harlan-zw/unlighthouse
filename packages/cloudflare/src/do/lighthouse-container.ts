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

import { Container } from '@cloudflare/containers'

export class LighthouseContainer extends Container {
  override defaultPort = 8080
  override sleepAfter = '10m'

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
