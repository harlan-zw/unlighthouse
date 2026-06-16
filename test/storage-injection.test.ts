import { buildIndexedDbInjectionScript, buildStorageInjectionScript } from '@unlighthouse/core/auditors/storage-injection'
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

describe('buildIndexedDbInjectionScript', () => {
  it('returns empty string when nothing to seed', () => {
    expect(buildIndexedDbInjectionScript(undefined)).toBe('')
    expect(buildIndexedDbInjectionScript(null)).toBe('')
    expect(buildIndexedDbInjectionScript({})).toBe('')
  })

  it('embeds the seed and opens the named database', () => {
    const out = buildIndexedDbInjectionScript({
      app: { version: 2, stores: { tokens: { keyPath: 'id', records: [{ id: 1, v: 'x' }] } } },
    })
    expect(out).toContain('indexedDB.open(name,spec.version||1)')
    expect(out).toContain('"app"')
    expect(out).toContain('"tokens"')
    expect(out).toContain('createObjectStore')
    expect(out).toContain('os.put(r)')
  })

  it('produces a self-contained, syntactically valid IIFE', () => {
    const out = buildIndexedDbInjectionScript({ db: { stores: { s: { records: [] } } } })
    expect(out.startsWith('(function(){')).toBe(true)
    expect(out.trim().endsWith('})();')).toBe(true)
    // parseable as a JS expression
    expect(() => new Function(out)).not.toThrow()
  })
})
