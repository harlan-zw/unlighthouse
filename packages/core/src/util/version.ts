function parseVersion(version: string) {
  const parts = version.replace(/^v/, '').split('.').map(Number)
  return parts.some(Number.isNaN) ? null : parts
}

export function isNewerVersion(latest: string, current: string) {
  const latestParts = parseVersion(latest)
  const currentParts = parseVersion(current)
  if (!latestParts || !currentParts)
    return false

  const length = Math.max(latestParts.length, currentParts.length)
  for (let i = 0; i < length; i++) {
    const latestPart = latestParts[i] ?? 0
    const currentPart = currentParts[i] ?? 0
    if (latestPart !== currentPart)
      return latestPart > currentPart
  }

  return false
}
