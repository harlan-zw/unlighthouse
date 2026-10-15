export const MIN_INTERVAL_MS = 15 * 60_000

const INTERVAL_PROBES = 1500

export function nextRun(cron: string, after: number): number | null {
  const next = Bun.cron.parse(cron, after)
  return next ? next.getTime() : null
}

export function cronError(cron: string, from = Date.now()): string | null {
  let previous: number | null
  try {
    previous = nextRun(cron, from)
  }
  catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (previous === null)
    return `The cron expression "${cron}" never matches`
  for (let i = 0; i < INTERVAL_PROBES; i++) {
    const next = nextRun(cron, previous)
    if (next === null)
      return null
    if (next - previous < MIN_INTERVAL_MS)
      return `The cron expression "${cron}" runs ${Math.round((next - previous) / 60_000)} minute(s) apart; scheduled scans must be at least 15 minutes apart`
    previous = next
  }
  return null
}
