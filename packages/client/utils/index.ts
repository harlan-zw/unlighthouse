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
