export function isScoreBelowBudget(score: number | null | undefined, budget: number | undefined): boolean {
  return typeof score === 'number'
    && Number.isFinite(score)
    && typeof budget === 'number'
    && Number.isFinite(budget)
    && score * 100 < budget
}
