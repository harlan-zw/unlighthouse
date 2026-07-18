import type { UnlighthouseRouteReport } from '../types'
import { reportJsonSimple } from './jsonSimple'

const CATEGORY_ORDER = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'] as const

function pct(score: unknown): string {
  return typeof score === 'number' ? String(Math.round(score * 100)) : '—'
}

/**
 * D-033: terse Markdown summary auto-selected under `--agent`. A compact table
 * of route -> overall + per-category scores, plus an averages footer, so an
 * agent gets the whole scan at a glance without parsing NDJSON.
 */
export function reportAgentSummary(reports: UnlighthouseRouteReport[]): string {
  const rows = reportJsonSimple(reports)
  const present = CATEGORY_ORDER.filter(cat => rows.some(r => r[cat] != null))
  const header = ['Route', 'Device', 'Score', ...present]
  const lines: string[] = []
  lines.push(`| ${header.join(' | ')} |`)
  lines.push(`| ${header.map(() => '---').join(' | ')} |`)

  const sums: Record<string, number> = {}
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const cells = [
      String(r.path ?? ''),
      String(r.device ?? ''),
      pct(r.score),
      ...present.map((cat) => {
        const v = r[cat]
        if (typeof v === 'number') {
          sums[cat] = (sums[cat] ?? 0) + v
          counts[cat] = (counts[cat] ?? 0) + 1
        }
        return pct(v)
      }),
    ]
    lines.push(`| ${cells.join(' | ')} |`)
  }

  const avg = present.map((cat) => {
    const count = counts[cat] ?? 0
    return count > 0 ? pct((sums[cat] ?? 0) / count) : '—'
  })
  lines.push(`| **Average** |  |  | ${avg.join(' | ')} |`)
  return `${lines.join('\n')}\n`
}
