import type { ScanSummary } from '../../analysis/summary.ts'
import type { TemplateCount } from '../../contracts.ts'
import type { Category, Issue, Severity } from '../../types.ts'
import { CATEGORY_LABELS, reliabilityText } from '../format.ts'

const SEVERITY: Record<Severity, { label: string, bars: [string, string, string] }> = {
  fail: { label: 'High', bars: ['var(--sev-high)', 'var(--sev-high)', 'var(--sev-high)'] },
  warn: { label: 'Medium', bars: ['var(--sev-medium)', 'var(--sev-medium)', 'var(--sev-off)'] },
}

export function severityLabel(severity: Severity): string {
  return SEVERITY[severity].label
}

export function SeverityIcon({ severity }: { severity: Severity }) {
  const { label, bars } = SEVERITY[severity]
  return (
    <svg className="severity-icon" width="16" height="16" viewBox="0 0 16 16" role="img" aria-label={`${label} severity`}>
      <rect x="1" y="9" width="3" height="5" rx="1" fill={bars[0]} />
      <rect x="6.5" y="5" width="3" height="9" rx="1" fill={bars[1]} />
      <rect x="12" y="1" width="3" height="13" rx="1" fill={bars[2]} />
    </svg>
  )
}

export function CategoryPill({ category }: { category: Category | null }) {
  return <span className="pill">{category ? CATEGORY_LABELS[category] : '—'}</span>
}

export function TemplateTag({ children }: { children: string }) {
  return <span className="tpl-tag" title={children}>{children}</span>
}

export const LAB_TITLE = 'Lab score, measured locally under parallel load'

export function LabTag({ summary }: { summary: ScanSummary | undefined }) {
  const title = [LAB_TITLE, ...(summary?.warnings.map(reliabilityText) ?? [])].join('\n')
  return <span className="lab-tag" title={title} aria-label={title} tabIndex={0}>lab</span>
}

export function itemSummary(issue: Issue): string {
  const top = issue.topItems[0]
  const label = top ? (top.label ?? top.key) : null
  if (issue.items === 0)
    return ''
  if (issue.items === 1)
    return label ?? '1 element'
  return label ? `${label} · ${issue.items - 1} more` : `${issue.items} elements`
}

export function coversAll(names: string[], templates: TemplateCount[] | undefined): boolean {
  const audited = templates?.filter(t => t.audited > 0) ?? []
  return names.length > 1 && audited.length > 0 && audited.every(t => names.includes(t.template))
}

export function firstTemplate(issue: Issue, templates: TemplateCount[] | undefined): string {
  if (coversAll(issue.templates, templates))
    return 'all templates'
  const rank = (name: string) => {
    const index = templates?.findIndex(t => t.template === name) ?? -1
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
  }
  return issue.templates.toSorted((a, b) => rank(a) - rank(b))[0] ?? 'all templates'
}
