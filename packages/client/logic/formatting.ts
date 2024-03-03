export function useHumanMs(ms: number): string {
  // need to convert it such < 1000 we say $x ms, otherwise we say $x s
  if (ms < 1000)
    return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
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
