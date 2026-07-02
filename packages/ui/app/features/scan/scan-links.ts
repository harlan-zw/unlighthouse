// D-049: every scan link lands on the single scan landing tab, `/overview`,
// regardless of status — a live scan streams its progress there and
// transitions to the completed view in place when it finishes (no separate
// terminal-status destination). Centralised here so every list (sites home,
// site overview, scan redirect) stays consistent.

export function scanLinkPath(siteSlug: string, scanId: string): string {
  return `/sites/${siteSlug}/scans/${scanId}/overview`
}
