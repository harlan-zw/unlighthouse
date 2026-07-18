import { describe, expect, it } from 'vitest'
import { McpUsageError, parseMcpFlags } from '../src/cli/mcp'

describe('mCP CLI flags', () => {
  it('parses long, short, equals, and boolean flags through citty', () => {
    expect(parseMcpFlags(['--site', 'https://example.com', '-r', 'reports', '-d'])).toEqual({
      site: 'https://example.com',
      root: 'reports',
      debug: true,
    })
    expect(parseMcpFlags(['--site=https://example.com', '--root=reports'])).toEqual({
      site: 'https://example.com',
      root: 'reports',
      debug: false,
    })
  })

  it.each(['site', 'root'] as const)('rejects a missing --%s value without exiting the process', (name) => {
    expect(() => parseMcpFlags([`--${name}`])).toThrow(McpUsageError)
    expect(() => parseMcpFlags([`--${name}=`])).toThrow(`missing value for --${name}`)
  })
})
