export function extractBgColor(str: string) {
  const regex = /background color: (.*?),/gm
  const m = regex.exec(str)

  if (m !== null) {
    // The result can be accessed through the `m`-variable.
    return m[1]
  }
}

export function extractFgColor(str: string) {
  const regex = /foreground color: (.*?),/gm
  const m = regex.exec(str)

  if (m !== null) {
    // The result can be accessed through the `m`-variable.
    return m[1]
  }
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
