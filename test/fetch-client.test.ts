import type { ResolvedUserConfig } from '@unlighthouse/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFetchClient } from '@unlighthouse/core/util/fetch'

function config(username: string, cookie: string): ResolvedUserConfig {
  return {
    auth: { username, password: 'secret' },
    cookies: [{ name: 'session', value: cookie }],
    extraHeaders: { 'X-Client': username },
    lighthouseOptions: {},
  } as ResolvedUserConfig
}

describe('createFetchClient', () => {
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
