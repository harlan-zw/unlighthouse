import { createHash } from 'node:crypto'
import { sha1Hex } from '@unlighthouse/core/util/sha1'
import { describe, expect, it } from 'vitest'

const nodeSha1 = (s: string) => createHash('sha1').update(s).digest('hex')

describe('sha1Hex', () => {
  it('matches known vectors', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('matches node:crypto for a range of URLs and strings', () => {
    const inputs = [
      'https://example.com/',
      'https://example.com/products/12345?utm=abc',
      'a',
      'a'.repeat(55), // one byte short of a block boundary
      'a'.repeat(56), // forces an extra padding block
      'a'.repeat(64),
      'a'.repeat(120),
      'ünïcödé/path/é',
      '/de/page#frag',
    ]
    for (const i of inputs)
      expect(sha1Hex(i), `sha1 mismatch for "${i.slice(0, 20)}…"`).toBe(nodeSha1(i))
  })
})
