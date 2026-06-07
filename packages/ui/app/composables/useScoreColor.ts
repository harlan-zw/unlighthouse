export function useScoreColor() {
  function scoreToColor(score: number | null): string {
    if (score === null) return 'text-muted-foreground'
    if (score >= 0.9) return 'text-success'
    if (score >= 0.5) return 'text-warning'
    return 'text-destructive'
  }

  function scoreToBg(score: number | null): string {
    if (score === null) return 'bg-muted'
    if (score >= 0.9) return 'bg-success/10'
    if (score >= 0.5) return 'bg-warning/10'
    return 'bg-destructive/10'
  }

  function scoreToRingColor(score: number | null): string {
    if (score === null) return '#9ca3af'
    if (score >= 0.9) return '#22c55e'
    if (score >= 0.5) return '#f97316'
    return '#ef4444'
  }

  function scoreToLabel(score: number | null): string {
    if (score === null) return '-'
    return String(Math.round(score * 100))
  }

  function scoreToBadgeVariant(score: number | null): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (score === null) return 'outline'
    if (score >= 0.9) return 'default'
    if (score >= 0.5) return 'secondary'
    return 'destructive'
  }

  return { scoreToColor, scoreToBg, scoreToRingColor, scoreToLabel, scoreToBadgeVariant }
}
