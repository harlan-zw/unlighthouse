import type { HookEvent } from '@unlighthouse/contracts'
import type { ScanId, Storage } from '@unlighthouse/contracts/ports'
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

/**
 * Buffers HookEvents in-memory and flushes a gzipped JSONL blob to
 * `scans/{scanId}/events.jsonl.gz` on terminal events (complete | cancelled | error).
 *
 * Returned `subscribe` is meant to be plugged into the core hook bus; it returns
 * an unsubscribe disposer so the session can clean up after settle.
 */
export function persistStableEvents(storage: Storage, scanId: ScanId): {
  push: (event: HookEvent) => void
  flush: () => Promise<void>
} {
  const buffer: HookEvent[] = []

  function push(event: HookEvent): void {
    buffer.push(event)
  }

  async function flush(): Promise<void> {
    if (buffer.length === 0)
      return
    const jsonl = buffer.map(e => JSON.stringify(e)).join('\n')
    const gz = gzipSync(Buffer.from(jsonl, 'utf8'))
    const bytes = new Uint8Array(gz.buffer, gz.byteOffset, gz.byteLength)
    await storage.blobs.put(`scans/${scanId}/events.jsonl.gz`, bytes, {
      contentType: 'application/gzip',
    })
  }

  return { push, flush }
}
