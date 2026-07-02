// Browser-portable gzip over fflate (pure JS, sync, identical semantics in
// Node / Workers / browser). Replaces `node:zlib` on the read slice reachable
// from `api/static-client`, so the offline dashboard bundle carries no node:*.
//
// fflate emits a different gzip header/OS byte than node:zlib; round-trips are
// identical but the compressed bytes differ — never assert on compressed bytes,
// only on the gunzipped content (see ARCHITECTURE-PIVOT.md tripwire).
import { gunzipSync as fflateGunzip, gzipSync as fflateGzip, strToU8 } from 'fflate'

/** Gzip a UTF-8 string or raw bytes. Returns a Uint8Array (store as a blob). */
export function gzipSync(data: string | Uint8Array): Uint8Array {
  return fflateGzip(typeof data === 'string' ? strToU8(data) : data)
}

/** Gunzip to raw bytes. */
export function gunzipSync(data: Uint8Array): Uint8Array {
  return fflateGunzip(data)
}

/** Gunzip and UTF-8 decode to a string. */
export function gunzipToString(data: Uint8Array): string {
  return new TextDecoder().decode(fflateGunzip(data))
}
