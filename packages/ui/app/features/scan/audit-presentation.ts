interface PresentedAudit {
  id: string
  score: number | null
  scoreDisplayMode: string
  severity: string | null
}

interface AuditReference { id: string, group?: string | null }

export function groupPageAudits<T extends PresentedAudit>(audits: Record<string, T>, references: AuditReference[]) {
  const groups = {
    failing: [] as T[],
    passing: [] as T[],
    informative: [] as T[],
    manual: [] as T[],
    notApplicable: [] as T[],
    errors: [] as T[],
    unknown: [] as T[],
  }
  for (const reference of references) {
    if (reference.group === 'hidden')
      continue
    const audit = audits[reference.id]
    if (!audit)
      continue
    switch (audit.scoreDisplayMode) {
      case 'manual': groups.manual.push(audit); break
      case 'notApplicable': groups.notApplicable.push(audit); break
      case 'informative': groups.informative.push(audit); break
      case 'error': groups.errors.push(audit); break
      case 'numeric':
      case 'binary':
      case 'metricSavings':
        if (audit.score === null)
          groups.unknown.push(audit)
        else if (audit.score >= 0.9)
          groups.passing.push(audit)
        else
          groups.failing.push(audit)
        break
      default: groups.unknown.push(audit)
    }
  }
  groups.failing.sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
  return groups
}
