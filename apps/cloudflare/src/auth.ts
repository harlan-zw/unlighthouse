export interface AuthenticatedPrincipal {
  principal: string
}

const MIN_TOKEN_LENGTH = 32
const encoder = new TextEncoder()

interface TimingSafeSubtleCrypto {
  timingSafeEqual: (left: ArrayBuffer | ArrayBufferView, right: ArrayBuffer | ArrayBufferView) => boolean
}

function readBasicPassword(value: string): string | null {
  try {
    const decoded = atob(value)
    const separator = decoded.indexOf(':')
    if (separator === -1 || decoded.slice(0, separator) !== 'unlighthouse')
      return null
    return decoded.slice(separator + 1)
  }
  catch (_error) {
    return null
  }
}

function readCredential(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization)
    return null

  const separator = authorization.indexOf(' ')
  if (separator === -1)
    return null

  const scheme = authorization.slice(0, separator).toLowerCase()
  const value = authorization.slice(separator + 1).trim()
  if (!value)
    return null
  if (scheme === 'bearer')
    return value
  if (scheme === 'basic')
    return readBasicPassword(value)
  return null
}

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', encoder.encode(value))
}

function digestPrefix(value: ArrayBuffer): string {
  return [...new Uint8Array(value).slice(0, 8)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Authenticate either an API Bearer token or browser-friendly HTTP Basic.
 * Basic uses the fixed username `unlighthouse` and the API token as password.
 */
export async function authenticateRequest(
  request: Request,
  expectedToken: string,
): Promise<AuthenticatedPrincipal | null> {
  if (expectedToken.length < MIN_TOKEN_LENGTH)
    throw new Error(`UNLIGHTHOUSE_API_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`)

  const credential = readCredential(request)
  if (!credential)
    return null

  const [actualDigest, expectedDigest] = await Promise.all([
    digest(credential),
    digest(expectedToken),
  ])
  // Wrangler's generated runtime includes Workers' timingSafeEqual extension.
  // lib.dom's overlapping SubtleCrypto declaration does not yet expose it.
  const subtle = crypto.subtle as SubtleCrypto & TimingSafeSubtleCrypto
  if (!subtle.timingSafeEqual(actualDigest, expectedDigest))
    return null

  // A stable, non-secret limiter key. Never pass the credential itself into
  // logs, Durable Object names, or storage keys.
  return { principal: `token:${digestPrefix(expectedDigest)}` }
}

export function unauthorizedResponse(): Response {
  const headers = new Headers({
    'cache-control': 'no-store',
    'content-type': 'application/json',
  })
  headers.append('www-authenticate', 'Basic realm="Unlighthouse", charset="UTF-8"')
  headers.append('www-authenticate', 'Bearer realm="Unlighthouse"')
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers,
  })
}
