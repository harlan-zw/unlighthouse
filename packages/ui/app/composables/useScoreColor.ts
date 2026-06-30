export function createScoreColorHelpers() {
  function scoreToColor(score: number | null): string {
    switch (scoreBand(score)) {
      case 'good': return 'text-success'
      case 'average': return 'text-warning'
      case 'poor': return 'text-error'
      default: return 'text-muted'
    }
  }

  function scoreToBg(score: number | null): string {
    switch (scoreBand(score)) {
      case 'good': return 'bg-success/10'
      case 'average': return 'bg-warning/10'
      case 'poor': return 'bg-error/10'
      default: return 'bg-muted'
    }
  }

  function scoreToRingColor(score: number | null): string {
    return bandHex(scoreBand(score))
  }

  function scoreToLabel(score: number | null): string {
    if (score === null)
      return '-'
    return String(Math.round(score * 100))
  }

  function scoreToBadgeVariant(score: number | null): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (scoreBand(score)) {
      case 'good': return 'default'
      case 'average': return 'secondary'
      case 'poor': return 'destructive'
      default: return 'outline'
    }
  }

  return { scoreToColor, scoreToBg, scoreToRingColor, scoreToLabel, scoreToBadgeVariant }
}
