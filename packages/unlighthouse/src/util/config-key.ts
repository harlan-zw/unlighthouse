// Shared helper for the on-disk scan directory hash.
//
// The CLI host writes scans under `.unlighthouse/<hostname>/<configCacheKey>/`
// where `configCacheKey` is a 4-char stable SHA-1 digest of the userConfig plus
// the package version. Lifting the call into one function ensures the algorithm
// stays consistent — if it ever needs to change (different hash length,
// different version-mixing strategy), there's a single site to update.
//
// Note: the CLI hashes its *raw* userConfig (pre-c12 layering); MCP hashes
// the resolved config it has on hand. Those don't always agree, so MCP's
// auto-discover routine in cli/mcp.ts still has to scan the filesystem as a
// fallback. Unifying the input contract is a separate, larger refactor.

import { createHash } from 'node:crypto'

function stableStringify(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null)
    return 'null'

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean')
    return JSON.stringify(value)
  if (type === 'bigint')
    return JSON.stringify(`${(value as bigint).toString()}n`)
  if (type === 'undefined')
    return '"[undefined]"'
  if (type === 'function') {
    const fn = value as { name?: string, toString: () => string }
    return JSON.stringify(`[function:${fn.name ?? ''}:${fn.toString()}]`)
  }
  if (type === 'symbol')
    return JSON.stringify(String(value))

  if (value instanceof Date)
    return JSON.stringify(value.toISOString())
  if (Array.isArray(value))
    return `[${value.map(item => stableStringify(item, seen)).join(',')}]`

  const object = value as Record<string, unknown>
  if (seen.has(object))
    return '"[circular]"'
  seen.add(object)
  const body = Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(object[key], seen)}`)
    .join(',')
  seen.delete(object)
  return `{${body}}`
}

export function computeConfigCacheKey(userConfig: unknown, version: string): string {
  return createHash('sha1')
    .update(stableStringify({ userConfig, version }))
    .digest('hex')
    .substring(0, 4)
}
