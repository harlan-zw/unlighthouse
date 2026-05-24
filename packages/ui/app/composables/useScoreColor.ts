export function useScoreColor() {
  function scoreToColor(score: number | null): string {
    if (score === null) return 'text-muted-foreground'
    if (score >= 0.9) return 'text-green-500'
    if (score >= 0.5) return 'text-orange-500'
    return 'text-red-500'
  }

  function scoreToBg(score: number | null): string {
    if (score === null) return 'bg-muted'
    if (score >= 0.9) return 'bg-green-500/10'
    if (score >= 0.5) return 'bg-orange-500/10'
    return 'bg-red-500/10'
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
