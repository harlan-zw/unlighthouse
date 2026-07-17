// Worker-safe bridge between createCloudflareApp's `auditorFactory` and the
// LighthouseContainer DO.
//
// Wraps `createRemoteLighthouseAuditor` from core with a custom `transport`
// that fetches via the Container DO stub rather than over HTTP — so the
// `endpoint` URL passed to the underlying auditor is purely cosmetic
// (the transport hijacks the request). No public hostname is needed; the
// DO binding is the auth boundary, but we still send a Bearer to give the
// Container something to validate (defence-in-depth in case Cloudflare
// ever changes Container reachability semantics).
//
// We intentionally do NOT expose `@cloudflare/workers-types` in this public
// interface. Structural request/response shapes keep the adapter usable across
// Workers type releases without leaking their global DOM declarations into
// consumers. The Worker's `auditorFactory` imports Workers types separately.

import type { Auditor } from '@unlighthouse/contracts/ports'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { createRemoteLighthouseAuditor } from '@unlighthouse/core/auditors/remote-lighthouse'

/**
 * Minimal local shape of the Container DO namespace surface this helper
 * uses. The actual `DurableObjectNamespace` from @cloudflare/workers-types
 * is intentionally not imported here (see file header for the AbortSignal
 * collision rationale). Consumers pass their `env.LIGHTHOUSE_CONTAINER`
 * binding and TypeScript checks structural compatibility.
 *
 * `fetch` is typed to the request shape this helper sends. That avoids
 * importing Workers globals here while keeping callers structurally checked.
 */
/**
 * Minimal `Response` surface this helper consumes. Matches what both DOM
 * `Response` and Workers types `Response` expose; lets the structural check
 * succeed against either.
 */
export interface ResponseLike {
  readonly ok: boolean
  readonly status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

interface ContainerFetchInit {
  method: 'POST'
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
}

export interface ContainerStubLike {
  fetch: (input: string, init?: ContainerFetchInit) => Promise<ResponseLike>
}
export interface ContainerNamespaceLike {
  /** Newer Workers types — direct name → stub. Optional. */
  getByName?: (name: string) => ContainerStubLike
  /** Classic DO API; always present on any DurableObjectNamespace binding. */
  idFromName: (name: string) => unknown
  /** Classic DO API; takes the id returned by idFromName. */
  get: (id: unknown) => ContainerStubLike
}

export interface ContainerLighthouseOptions {
  /** Container DO binding (e.g. `env.LIGHTHOUSE_CONTAINER`). */
  container: ContainerNamespaceLike
  /** Bearer token shared with the Container. Set via `wrangler secret put`. */
  token: string
  /**
   * Routing key for the Container DO instance. Default `'default'` keeps a
   * single warm Container per Worker — fine for low-volume deploys. Set this
   * to e.g. the scanId if you want one Container per concurrent scan.
   */
  instanceName?: string
  /** Per-audit timeout in ms. Default 180_000 (Lighthouse 30-90s + slack). */
  timeoutMs?: number
}

export function createContainerLighthouseAuditor(opts: ContainerLighthouseOptions): Auditor {
  return createRemoteLighthouseAuditor({
    // Synthetic endpoint — the transport intercepts before ofetch touches it.
    endpoint: 'https://container.internal/audit',
    token: opts.token,
    timeoutMs: opts.timeoutMs ?? 180_000,
    transport: async (req) => {
      const name = opts.instanceName ?? 'default'
      // Prefer the modern getByName accessor; fall back to idFromName+get
      // for older runtimes / deployments where the convenience method
      // hasn't shipped yet.
      const stub = opts.container.getByName
        ? opts.container.getByName(name)
        : opts.container.get(opts.container.idFromName(name))
      const res = await stub.fetch('https://container.internal/audit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${req.token}`,
        },
        body: JSON.stringify({
          url: req.url,
          config: req.lighthouseConfig,
          flags: req.lighthouseFlags,
          device: req.device,
        }),
        signal: req.signal,
      })
      if (!res.ok) {
        let text = '<unreadable>'
        try {
          text = await res.text()
        }
        catch (_err) {
          // Diagnostic body read failed; preserve the HTTP status as the primary error.
        }
        throw new UnlighthouseError({
          code: 'INFRA_RETRYABLE',
          message: `LighthouseContainer audit failed: ${res.status} ${text}`,
          details: { status: res.status, body: text },
        })
      }
      const lhr = await res.json()
      if (!lhr || typeof lhr !== 'object' || !('categories' in (lhr as object))) {
        throw new UnlighthouseError({
          code: 'INFRA_RETRYABLE',
          message: 'LighthouseContainer returned an invalid LHR',
        })
      }
      return lhr as Awaited<ReturnType<Auditor['audit']>>
    },
  })
}
