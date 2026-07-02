// Formatting helpers — single source of truth across the dashboard.
//
// Before this helper, five-ish near-identical implementations of
// fmtScore / fmtMs / fmtDelta / formatBytes lived in compare/[id].vue,
// overview.vue, routes.vue, route/[path].vue, performance.vue. They
// drifted in subtle ways (some returned `—`, some returned `-`, some
// rounded at 2 decimals, others at 1). The shared helper
// homogenises the dashboard's number rendering and gives a single
// place to bump (e.g. swap to Intl.NumberFormat for i18n later).

export function createFormatters() {
  // Lighthouse score (0..1) → integer percentage. Null when the audit
  // couldn't produce a score (notApplicable / manual / error path).
  function fmtScore(v: number | null | undefined): string {
    if (v == null)
      return '—'
    return String(Math.round(v * 100))
  }

  // Millisecond metric. Switches to seconds at 1000ms so e.g. LCP
  // reads "2.4s" rather than "2400ms" in tables. Pure rule lives in
  // ~/utils/format so the .ts feature tables share it without the composable.
  function fmtMs(v: number | null | undefined): string {
    return formatMs(v)
  }

  // Delta of a score (-1..1) or a ms metric. `isScore` switches
  // between percentage-point and ms/s rendering. Sign is always
  // included so the cell shows direction at a glance.
  function fmtDelta(v: number | null | undefined, isScore: boolean): string {
    if (v == null)
      return '—'
    if (isScore) {
      const n = (v * 100).toFixed(1)
      return v > 0 ? `+${n}` : n
    }
    if (Math.abs(v) >= 1000)
      return `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}s`
    return `${v > 0 ? '+' : ''}${Math.round(v)}ms`
  }

  // Picks between score and ms format based on metric kind. Used by
  // the per-route detail tables that mix categories + CWV.
  function fmtMetric(v: number | null | undefined, isScore: boolean): string {
    return isScore ? fmtScore(v) : fmtMs(v)
  }

  // Byte sizes used by pack reports (wasted bytes) and the asset
  // tables. KB/MB cutoffs match the convention browsers and devtools
  // use; B as the base for sub-1KB so we don't render "0KB" for
  // genuinely small responses.
  function fmtBytes(v: number | null | undefined): string {
    if (v == null)
      return '—'
    if (v >= 1024 * 1024)
      return `${(v / (1024 * 1024)).toFixed(1)}MB`
    if (v >= 1024)
      return `${(v / 1024).toFixed(1)}KB`
    return `${Math.round(v)}B`
  }

  // Human-readable relative time. Used by the recent-scans list and
  // the live events feed. Falls back to absolute date for >24h so we
  // don't render meaningless "8327h ago".
  function fmtRelTime(iso: string | number | null | undefined): string {
    if (iso == null)
      return '—'
    const ms = typeof iso === 'number' ? iso : Date.parse(iso)
    if (Number.isNaN(ms))
      return '—'
    const diff = Date.now() - ms
    if (diff < 0)
      return 'just now'
    const sec = Math.round(diff / 1000)
    if (sec < 60)
      return `${sec}s ago`
    const m = Math.floor(sec / 60)
    if (m < 60)
      return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24)
      return `${h}h ago`
    return new Date(ms).toLocaleDateString()
  }

  // Long-form duration for scan progress / ETA. 12345ms → "12s",
  // 90000ms → "1m 30s", 3700000ms → "1h 1m". Days uncovered because
  // a single scan shouldn't take that long; if one does, "Nd" would
  // surface a different problem worth flagging.
  function fmtDuration(ms: number | null | undefined): string {
    if (ms == null || ms < 0)
      return '—'
    if (ms < 60_000)
      return `${Math.round(ms / 1000)}s`
    const m = Math.floor(ms / 60_000)
    const s = Math.round((ms % 60_000) / 1000)
    if (m < 60)
      return s ? `${m}m ${s}s` : `${m}m`
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }

  // Absolute timestamp for the "this scan ran at..." labels. Uses
  // local time + locale-aware date so the dashboard reads naturally
  // wherever the operator is. Default ('long') for headers; 'short'
  // strips seconds for table rows where space is tight.
  function fmtTimestamp(iso: string | number | null | undefined, style: 'long' | 'short' = 'long'): string {
    if (iso == null)
      return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime()))
      return '—'
    if (style === 'short')
      return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    return d.toLocaleString()
  }

  function fmtClockTime(value: string | number | null | undefined, fractional = false): string {
    if (value == null)
      return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime()))
      return '—'
    return d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: fractional ? 3 : undefined,
    })
  }

  return {
    fmtScore,
    fmtMs,
    fmtDelta,
    fmtMetric,
    fmtBytes,
    fmtRelTime,
    fmtDuration,
    fmtTimestamp,
    fmtClockTime,
  }
}
