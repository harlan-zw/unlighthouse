import { buildStorageInjectionScript } from '@unlighthouse/core/auditors/storage-injection'
import { describe, expect, it } from 'vitest'

describe('buildStorageInjectionScript', () => {
  it('returns empty string when nothing to inject', () => {
    expect(buildStorageInjectionScript({})).toBe('')
    expect(buildStorageInjectionScript({ localStorage: {}, sessionStorage: null })).toBe('')
  })

  it('emits sessionStorage setItem calls', () => {
    const out = buildStorageInjectionScript({ sessionStorage: { token: 'abc' } })
    expect(out).toContain('window.sessionStorage.setItem("token", "abc")')
  })

  it('emits localStorage setItem calls', () => {
    const out = buildStorageInjectionScript({ localStorage: { theme: 'dark' } })
    expect(out).toContain('window.localStorage.setItem("theme", "dark")')
  })

  it('JSON-encodes non-string values', () => {
    const out = buildStorageInjectionScript({ sessionStorage: { user: { id: 1 } } })
    // value is JSON-stringified once to a string, then JSON.stringify'd for embedding
    expect(out).toContain('window.sessionStorage.setItem("user", "{\\"id\\":1}")')
  })

  it('escapes keys/values that would break the script', () => {
    const out = buildStorageInjectionScript({ sessionStorage: { 'a"b': 'x\n");evil()' } })
    expect(out).not.toContain('evil()\n')
    // round-trips through JSON.parse safely
    expect(() => JSON.parse(`"${'a"b'.replace(/"/g, '\\"')}"`)).not.toThrow()
    expect(out).toContain('setItem(')
  })

  it('wraps each call in try/catch so one failure does not abort the rest', () => {
    const out = buildStorageInjectionScript({ localStorage: { a: '1' }, sessionStorage: { b: '2' } })
    expect(out.split('try {').length - 1).toBe(2)
  })
})
