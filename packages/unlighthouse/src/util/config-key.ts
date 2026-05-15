// Shared helper for the on-disk scan directory hash.
//
// The CLI host writes scans under `.unlighthouse/<hostname>/<configCacheKey>/`
// where `configCacheKey` is a 4-char `object-hash` of the userConfig plus the
// package version. Lifting the call into one function ensures the algorithm
// stays consistent — if it ever needs to change (different hash length,
// different version-mixing strategy), there's a single site to update.
//
// Note: the CLI hashes its *raw* userConfig (pre-c12 layering); MCP hashes
// the resolved config it has on hand. Those don't always agree, so MCP's
// auto-discover routine in cli/mcp.ts still has to scan the filesystem as a
// fallback. Unifying the input contract is a separate, larger refactor.

import objectHash from 'object-hash'

export function computeConfigCacheKey(userConfig: unknown, version: string): string {
  return objectHash({ ...(userConfig as object), version }).substring(0, 4)
}
