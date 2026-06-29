// Where a scan link should land depends on whether the scan is still running.
// In-progress scans open on the live `/overview` (the ScanProgress view) so the
// user watches it finish; terminal scans jump straight to the `/routes` table.
// Centralised here so every list (dashboard recent, site history, global
// history) routes consistently — previously they all hardcoded `/routes`, so
// clicking a still-scanning row dropped you into an empty results panel.

const TERMINAL_STATUSES = new Set(['complete', 'failed', 'cancelled', 'error'])

export function scanIsActive(status?: string | null): boolean {
  return !!status && !TERMINAL_STATUSES.has(status)
}

export function scanLinkPath(siteSlug: string, scanId: string, status?: string | null): string {
  const base = `/sites/${siteSlug}/scans/${scanId}`
  return scanIsActive(status) ? `${base}/overview` : `${base}/routes`
}
