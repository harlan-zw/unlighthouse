export const extractBgColor = (str: string) => {
  const regex = /background color: (.*?),/gm
  const m = regex.exec(str)
  // eslint-disable-next-line no-cond-assign
  if (m !== null) {
    // The result can be accessed through the `m`-variable.
    return m[1]
  }
}

export const extractFgColor = (str: string) => {
  const regex = /foreground color: (.*?),/gm
  const m = regex.exec(str)
  // eslint-disable-next-line no-cond-assign
  if (m !== null) {
    // The result can be accessed through the `m`-variable.
    return m[1]
  }
}

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
