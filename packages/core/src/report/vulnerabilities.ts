/**
 * Bundled vulnerability data for libraries commonly detected by Lighthouse's
 * `js-libraries` audit. This is intentionally minimal — it covers the well-known
 * long-tail of vulnerable versions that still show up in real audits.
 *
 * Each entry lists versions **strictly less than** `lessThan`. If that holds,
 * the library is flagged with the given severity + CVE list.
 */

export interface VulnRule {
  name: string
  lessThan: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cves: string[]
  description: string
  recommendation: string
}

export const VULN_DB: VulnRule[] = [
  {
    name: 'jquery',
    lessThan: '3.5.0',
    severity: 'medium',
    cves: ['CVE-2020-11022', 'CVE-2020-11023'],
    description: 'XSS via passing untrusted HTML to jQuery.html() and related methods.',
    recommendation: 'Upgrade jQuery to 3.5.0 or later.',
  },
  {
    name: 'jquery',
    lessThan: '1.9.0',
    severity: 'high',
    cves: ['CVE-2012-6708'],
    description: 'Older jQuery versions contain multiple XSS vulnerabilities in selectors and parseHTML.',
    recommendation: 'Upgrade jQuery to 3.5.0 or later.',
  },
  {
    name: 'jquery-ui',
    lessThan: '1.13.2',
    severity: 'medium',
    cves: ['CVE-2022-31160'],
    description: 'XSS in jQuery UI checkboxradio widget.',
    recommendation: 'Upgrade jQuery UI to 1.13.2 or later.',
  },
  {
    name: 'lodash',
    lessThan: '4.17.21',
    severity: 'high',
    cves: ['CVE-2021-23337', 'CVE-2020-28500', 'CVE-2020-8203'],
    description: 'Command injection via template, ReDoS in toNumber/trim/trimEnd, and prototype pollution in zipObjectDeep.',
    recommendation: 'Upgrade lodash to 4.17.21 or later.',
  },
  {
    name: 'moment.js',
    lessThan: '2.29.4',
    severity: 'high',
    cves: ['CVE-2022-31129'],
    description: 'Inefficient regex causes ReDoS when parsing crafted date strings.',
    recommendation: 'Upgrade moment to 2.29.4 or later (or migrate to date-fns / Temporal).',
  },
  {
    name: 'handlebars',
    lessThan: '4.7.7',
    severity: 'high',
    cves: ['CVE-2021-23369', 'CVE-2021-23383'],
    description: 'Prototype pollution and RCE via crafted templates when using strict:false.',
    recommendation: 'Upgrade handlebars to 4.7.7 or later.',
  },
  {
    name: 'angularjs',
    lessThan: '1.8.0',
    severity: 'medium',
    cves: ['CVE-2020-7676'],
    description: 'XSS in ng-prop-* directives via crafted attribute values.',
    recommendation: 'AngularJS is end-of-life. Migrate to Angular or another framework.',
  },
  {
    name: 'angular',
    lessThan: '1.8.0',
    severity: 'medium',
    cves: ['CVE-2020-7676'],
    description: 'AngularJS 1.x is end-of-life and has known XSS vulnerabilities.',
    recommendation: 'Migrate to modern Angular or another framework.',
  },
  {
    name: 'bootstrap',
    lessThan: '4.3.1',
    severity: 'medium',
    cves: ['CVE-2019-8331'],
    description: 'XSS via crafted tooltip or popover data-template attribute.',
    recommendation: 'Upgrade Bootstrap to 4.3.1 or later (ideally 5.x).',
  },
  {
    name: 'axios',
    lessThan: '0.21.2',
    severity: 'high',
    cves: ['CVE-2021-3749'],
    description: 'ReDoS in trim function when handling crafted proxy authentication.',
    recommendation: 'Upgrade axios to 1.x.',
  },
  {
    name: 'dompurify',
    lessThan: '2.4.0',
    severity: 'medium',
    cves: ['CVE-2022-39262'],
    description: 'Mutation XSS bypass in specific parsing paths.',
    recommendation: 'Upgrade DOMPurify to 2.4.0 or later.',
  },
  {
    name: 'marked',
    lessThan: '4.0.10',
    severity: 'high',
    cves: ['CVE-2022-21680', 'CVE-2022-21681'],
    description: 'ReDoS via crafted inline.reflinkSearch patterns.',
    recommendation: 'Upgrade marked to 4.0.10 or later.',
  },
]

/**
 * Parse a version string into comparable components.
 * Handles common Lighthouse formats: "3.4.1", "1.12.4-foo", "v2.0".
 * Non-numeric characters are stripped from each segment.
 */
function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.-]/)
    .slice(0, 4)
    .map((seg) => {
      const match = seg.match(/^(\d+)/)
      return match ? Number.parseInt(match[1], 10) : 0
    })
}

/**
 * Returns true if `version` is strictly less than `target`. Returns false for
 * unparseable inputs (conservative — avoids false positives).
 */
export function versionLessThan(version: string | undefined | null, target: string): boolean {
  if (!version)
    return false
  const a = parseVersion(version)
  const b = parseVersion(target)
  if (a.every(n => n === 0))
    return false
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av < bv)
      return true
    if (av > bv)
      return false
  }
  return false
}

/**
 * Normalise library names from Lighthouse for matching. LH uses display names
 * like "jQuery", "Moment.js", "AngularJS"; the DB uses lowercase slugs.
 */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.js$/, '.js')
    .replace(/\s+/g, '-')
}

export interface DetectedLibrary {
  name: string
  version?: string
}

export interface VulnerabilityMatch {
  name: string
  version: string
  severity: VulnRule['severity']
  cves: string[]
  description: string
  recommendation: string
}

/**
 * Match a list of detected libraries against the bundled vulnerability DB.
 * Returns the most severe matching rule per library (a library can match
 * multiple rules if both cover the same version — we keep the worst).
 */
export function findVulnerabilities(libs: DetectedLibrary[]): VulnerabilityMatch[] {
  const severityRank = { critical: 4, high: 3, medium: 2, low: 1 } as const
  const worst = new Map<string, VulnerabilityMatch>()

  for (const lib of libs) {
    if (!lib.version)
      continue
    const key = normaliseName(lib.name)
    for (const rule of VULN_DB) {
      if (normaliseName(rule.name) !== key)
        continue
      if (!versionLessThan(lib.version, rule.lessThan))
        continue

      const candidate: VulnerabilityMatch = {
        name: lib.name,
        version: lib.version,
        severity: rule.severity,
        cves: rule.cves,
        description: rule.description,
        recommendation: rule.recommendation,
      }
      const dedupKey = `${key}@${lib.version}`
      const existing = worst.get(dedupKey)
      if (!existing || severityRank[rule.severity] > severityRank[existing.severity]) {
        worst.set(dedupKey, candidate)
      }
      else if (existing && severityRank[rule.severity] === severityRank[existing.severity]) {
        // Merge CVEs at same severity
        existing.cves = [...new Set([...existing.cves, ...rule.cves])]
      }
    }
  }

  return [...worst.values()]
}
