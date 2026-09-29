import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { resolveRequestHeaders } from '../src/util/requestHeaders'

describe('resolveRequestHeaders', () => {
  it('sends cookies, auth, and extra headers together', () => {
    expect(resolveRequestHeaders({
      cookies: [{ name: 'sid', value: 'abc=def' }, { name: 'theme', value: 'dark' }],
      auth: { username: 'admin', password: 'pa:ss' },
      extraHeaders: { 'x-token': 'a=b' },
    })).toEqual({
      'x-token': 'a=b',
      'Cookie': 'sid=abc=def; theme=dark',
      'Authorization': `Basic ${Buffer.from('admin:pa:ss').toString('base64')}`,
    })
  })

  it('lets explicit headers win over cookies and auth', () => {
    expect(resolveRequestHeaders({
      cookies: [{ name: 'sid', value: 'abc' }],
      auth: { username: 'admin', password: 'secret' },
      extraHeaders: { cookie: 'mine=1', authorization: 'Bearer token' },
    })).toEqual({ cookie: 'mine=1', authorization: 'Bearer token' })
  })

  it('returns no headers for an anonymous scan', () => {
    expect(resolveRequestHeaders({})).toEqual({})
  })
})
