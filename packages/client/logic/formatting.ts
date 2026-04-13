export function useHumanMs(ms: number): string {
  // need to convert it such < 1000 we say $x ms, otherwise we say $x s
  if (ms < 1000)
    return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function useHumanDate(input: string | number | Date): string {
  // Parse YYYY-MM-DD as a local date to avoid UTC offset shifting the displayed day.
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split('-').map(Number)
    return dateFormatter.format(new Date(y, m - 1, d))
  }
  return dateFormatter.format(new Date(input as any))
}

export function useHumanDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60)
    return seconds === 1 ? '1 second' : `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60)
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hour' : `${hours} hours`
}

function useHumanFriendlyNumber(number: Ref<number>, decimals?: number): ComputedRef<string>
function useHumanFriendlyNumber(number: number, decimals?: number): string
export function useHumanFriendlyNumber(number: MaybeRef<number>, decimals?: number) {
  const format = (number: number) => {
    // apply decimals if defined
    if (typeof decimals !== 'undefined')
      number = Number.parseFloat(number.toFixed(decimals))
    return new Intl.NumberFormat('en', { notation: 'compact' }).format(number)
  }
  if (isRef(number)) {
    return computed(() => {
      return format(number.value)
    })
  }
  // use intl to format the number, should have `k` or `m` suffix if needed
  return format(number)
}
