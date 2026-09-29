import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { cookieAppliesTo, resolveRequestHeaders, toBrowserCookies } from '../src/util/requestHeaders'

const site = 'https://example.com'

describe('resolveRequestHeaders', () => {
  it('sends auth and extra headers', () => {
    expect(resolveRequestHeaders({
      auth: { username: 'admin', password: 'pa:ss' },
      extraHeaders: { 'x-token': 'a=b' },
    })).toEqual({
      'x-token': 'a=b',
      'Authorization': `Basic ${Buffer.from('admin:pa:ss').toString('base64')}`,
    })
  })

  it('adds only the cookies that apply to the request url', () => {
    const cookies = [
      { name: 'sid', value: 'abc=def' },
      { name: 'sso', value: 'secret', domain: 'sso.example.com' },
      { name: 'shared', value: '1', domain: '.example.com' },
      { name: 'admin', value: '1', path: '/admin' },
    ]
    expect(resolveRequestHeaders({ cookies }, { url: 'https://example.com/blog', site }))
      .toEqual({ Cookie: 'sid=abc=def; shared=1' })
    expect(resolveRequestHeaders({ cookies }, { url: 'https://cdn.other.com/app.js', site })).toEqual({})
  })

  it('sends no cookies without a request url', () => {
    expect(resolveRequestHeaders({ cookies: [{ name: 'sid', value: 'abc' }] })).toEqual({})
  })

  it('lets explicit headers win over cookies and auth', () => {
    expect(resolveRequestHeaders({
      cookies: [{ name: 'sid', value: 'abc' }],
      auth: { username: 'admin', password: 'secret' },
      extraHeaders: { cookie: 'mine=1', authorization: 'Bearer token' },
    }, { url: site, site })).toEqual({ cookie: 'mine=1', authorization: 'Bearer token' })
  })
})

describe('cookieAppliesTo', () => {
  it('follows the domain rules', () => {
    expect(cookieAppliesTo({ name: 'a', value: '1' }, 'https://sub.example.com/', site)).toBe(false)
    expect(cookieAppliesTo({ name: 'a', value: '1', domain: '.example.com' }, 'https://sub.example.com/', site)).toBe(true)
    expect(cookieAppliesTo({ name: 'a', value: '1', domain: '.example.com' }, 'https://badexample.com/', site)).toBe(false)
    expect(cookieAppliesTo({ name: 'a', value: '1', domain: 'sub.example.com' }, 'https://example.com/', site)).toBe(false)
  })

  it('follows the path rules', () => {
    const cookie = { name: 'a', value: '1', path: '/admin' }
    expect(cookieAppliesTo(cookie, 'https://example.com/admin', site)).toBe(true)
    expect(cookieAppliesTo(cookie, 'https://example.com/admin/users', site)).toBe(true)
    expect(cookieAppliesTo(cookie, 'https://example.com/administrator', site)).toBe(false)
  })

  it('sends a secure cookie over https only', () => {
    const cookie = { name: 'a', value: '1', secure: 'true' }
    expect(cookieAppliesTo(cookie, 'https://example.com/', site)).toBe(true)
    expect(cookieAppliesTo(cookie, 'http://example.com/', 'http://example.com')).toBe(false)
  })
})

describe('toBrowserCookies', () => {
  it('scopes a cookie without a domain to the scanned site', () => {
    expect(toBrowserCookies([{ name: 'sid', value: 'abc' }], site)).toEqual([{ name: 'sid', value: 'abc', url: site }])
  })
})
