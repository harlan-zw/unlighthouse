const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [0x00000000, 8],
  [0x0A000000, 8],
  [0x64400000, 10],
  [0x7F000000, 8],
  [0xA9FE0000, 16],
  [0xAC100000, 12],
  [0xC0A80000, 16],
  [0xC6120000, 15],
  [0xE0000000, 4],
]

function parseIpv4(hostname: string): number | null {
  const octets = hostname.split('.')
  if (octets.length !== 4)
    return null
  const values = octets.map(Number)
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 255))
    return null
  return values.reduce((address, value) => (address << 8) + value, 0) >>> 0
}

function isPrivateIpv4(hostname: string): boolean {
  const address = parseIpv4(hostname)
  if (address === null)
    return false
  return PRIVATE_IPV4_RANGES.some(([network, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0
    return (address & mask) === (network & mask)
  })
}

function isPrivateIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!value.includes(':'))
    return false
  return value === '::' || value === '::1' || value.startsWith('fc')
    || value.startsWith('fd') || /^fe[89ab]/.test(value)
    || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.')
    || value.startsWith('::ffff:192.168.') || /^::ffff:172\.(?:1[6-9]|2\d|3[01])\./.test(value)
}

function isPrivateHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/\.$/, '')
  return value === 'localhost' || value.endsWith('.localhost')
    || value.endsWith('.local') || value.endsWith('.internal')
    || isPrivateIpv4(value) || isPrivateIpv6(value)
}

function parseAllowedOrigins(value: string): Set<string> {
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean)
  if (entries.length === 0)
    throw new Error('UNLIGHTHOUSE_ALLOWED_ORIGINS must contain at least one origin.')

  const origins = new Set<string>()
  for (const entry of entries) {
    const url = new URL(entry)
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.pathname !== '/'
      || url.search || url.hash || isPrivateHostname(url.hostname)) {
      throw new Error(`Invalid public origin in UNLIGHTHOUSE_ALLOWED_ORIGINS: ${entry}`)
    }
    origins.add(url.origin)
  }
  return origins
}

/** Exact-origin allowlist with an additional fail-closed private-network deny. */
export function createAllowedTargetPolicy(value: string): (target: string) => boolean {
  const allowedOrigins = parseAllowedOrigins(value)
  return (target: string): boolean => {
    try {
      const url = new URL(target)
      return ['http:', 'https:'].includes(url.protocol)
        && !url.username
        && !url.password
        && !isPrivateHostname(url.hostname)
        && allowedOrigins.has(url.origin)
    }
    catch (_error) {
      return false
    }
  }
}
