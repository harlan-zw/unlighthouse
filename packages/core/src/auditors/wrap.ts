import type { AuditOpts, Auditor, LighthouseReport, Page } from '@unlighthouse/contracts/ports'

/**
 * Generic Auditor wrapper. Composes around any `Auditor` to add cross-cutting
 * behaviour (error mapping, retries, telemetry, rate-limiting, etc.) without
 * touching the underlying adapter.
 *
 * Each hook is optional. `onError` is the most common use: hosts catch
 * vendor-specific errors and rethrow as `UnlighthouseError` or domain errors
 * so handlers + HTTP projection can map them consistently.
 */
export interface AuditorHooks {
  /** Runs after a successful audit. May mutate or replace the report. */
  onSuccess?: (report: LighthouseReport, ctx: AuditCallContext) => LighthouseReport | Promise<LighthouseReport> | void | Promise<void>
  /**
   * Runs when the underlying audit throws. May:
   *  - return a `LighthouseReport` to swallow the error
   *  - return an `Error` (or `UnlighthouseError`) to replace the thrown error
   *  - return `undefined` / void to let the original error propagate
   */
  onError?: (error: unknown, ctx: AuditCallContext) => LighthouseReport | Error | void | Promise<LighthouseReport | Error | void>
}

export interface AuditCallContext {
  url: string
  opts: AuditOpts
}

export function wrapAuditor(base: Auditor, hooks: AuditorHooks): Auditor {
  return {
    capabilities: base.capabilities,
    async audit(url: string, page?: Page, opts: AuditOpts = {}): Promise<LighthouseReport> {
      const ctx: AuditCallContext = { url, opts }
      try {
        const report = await base.audit(url, page, opts)
        if (!hooks.onSuccess)
          return report
        const out = await hooks.onSuccess(report, ctx)
        return (out as LighthouseReport | undefined) ?? report
      }
      catch (err) {
        if (!hooks.onError)
          throw err
        const out = await hooks.onError(err, ctx)
        if (out instanceof Error)
          throw out
        if (out)
          return out as LighthouseReport
        throw err
      }
    },
  }
}
