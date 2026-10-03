import type { ResolvedUserConfig } from '@unlighthouse/contracts'
import { createFetchClient, fetchUrlRaw } from '@unlighthouse/core/util/fetch'
import { afterEach, describe, expect, it, vi } from 'vitest'

function config(username: string, cookie: string): ResolvedUserConfig {
  return {
    auth: { username, password: 'secret' },
    cookies: [{ name: 'session', value: cookie }],
    extraHeaders: { 'X-Client': username },
    lighthouseOptions: {},
  } as ResolvedUserConfig
}

describe('createFetchClient', () => {
  it.each([
    ['https://example.com', 'https://example.com/', {}],
    ['https://example.com/', 'https://example.com/?token=value', { defaultQueryParams: { token: 'value' } }],
    ['https://example.com', 'https://example.com/?token=value', { defaultQueryParams: { token: 'value' } }],
    ['https://example.com/about', 'https://example.com/about/?token=value', { defaultQueryParams: { token: 'value' } }],
  ])('does not treat URL normalization as a redirect: %s', async (url, responseUrl, config) => {
    const result = await fetchUrlRaw(url, config, { client: {
      get: async () => ({ status: 200, data: 'ok', headers: new Headers(), url: responseUrl, request: { res: { responseUrl } } }),
    } })
    expect(result.valid).toBe(true)
    expect(result.redirected).toBe(false)
  })
  it('keeps explicit authorization and cookie headers', async () => {
    const requests: Headers[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Headers(init?.headers))
      return new Response('ok')
    }))
    await createFetchClient({ ...config('alice', 'a'), extraHeaders: { authorization: 'Bearer token', cookie: 'session=explicit' } }).get('https://example.com')
    expect(requests[0]?.get('authorization')).toBe('Bearer token')
    expect(requests[0]?.get('cookie')).toBe('session=explicit')
  })

  it('rejects a redirect that ends in an HTTP error', async () => {
    const result = await fetchUrlRaw('https://example.com', {}, { client: {
      get: async () => ({ status: 404, data: '', headers: new Headers(), url: 'https://example.com/missing', request: { res: { responseUrl: 'https://example.com/missing' } } }),
    } })
    expect(result.valid).toBe(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps credentials scoped to each client instance', async () => {
    const requests: Headers[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Headers(input instanceof Request ? input.headers : init?.headers))
      return new Response('ok', { status: 200 })
    }))

    const alice = createFetchClient(config('alice', 'a'))
    const bob = createFetchClient(config('bob', 'b'))

    await alice.get('https://example.com/alice')
    await bob.get('https://example.com/bob')

    expect(requests).toHaveLength(2)
    expect(requests[0]?.get('x-client')).toBe('alice')
    expect(requests[0]?.get('cookie')).toBe('session=a')
    expect(requests[1]?.get('x-client')).toBe('bob')
    expect(requests[1]?.get('cookie')).toBe('session=b')
    expect(requests[0]?.get('authorization')).not.toBe(requests[1]?.get('authorization'))
  })
})
