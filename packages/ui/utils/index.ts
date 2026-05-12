// Pure utility functions - no side effects

export function extractBgColor(str: string) {
  const regex = /background color: (.*?),/
  const m = regex.exec(str)
  return m?.[1]
}

export function extractFgColor(str: string) {
  const regex = /foreground color: (.*?),/
  const m = regex.exec(str)
  return m?.[1]
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0)
    return '0B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

export function useHumanMs(ms: number): string {
  if (ms < 1000)
    return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function useHumanFriendlyNumber(number: number, decimals?: number): string {
  let num = number
  if (typeof decimals !== 'undefined') {
    num = Number.parseFloat(num.toFixed(decimals))
  }
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(num)
}

// Semantic colour tokens used by CrUX visualisations. Hex values track
// @nuxt/ui's default green/amber/red palette so charts align with UI badges.
export const semanticColors = {
  success: { dot: 'bg-green-500', text: 'text-green-500', hex: '#22c55e' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-500', hex: '#f59e0b' },
  error: { dot: 'bg-red-500', text: 'text-red-500', hex: '#ef4444' },
  neutral: { dot: 'bg-gray-400', text: 'text-gray-400', hex: '#9ca3af' },
} as const

export const cwvMetricColors = {
  lcp: { hex: '#6366f1' }, // indigo
  inp: { hex: '#0ea5e9' }, // sky
  cls: { hex: '#a855f7' }, // purple
} as const

export function thresholdToSemantic(value: number, good: number, poor: number): 'success' | 'warning' | 'error' {
  if (value <= good)
    return 'success'
  if (value <= poor)
    return 'warning'
  return 'error'
}

export function thresholdHex(value: number, good: number, poor: number): string {
  return semanticColors[thresholdToSemantic(value, good, poor)].hex
}

export function calcTrendPercent(current: number, base: number): number {
  if (base === 0)
    return 0
  return ((current - base) / base) * 100
}
