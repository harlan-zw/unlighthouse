// Browser-portable base64 <-> bytes. atob/btoa are global in Node, Workers and
// browsers, so this carries no node:buffer and stays on the static read slice.

/** Decode a base64 string to raw bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++)
    bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Encode a UTF-8 string to base64 (matches `Buffer.from(str, 'utf8').toString('base64')`). */
export function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input)
  let bin = ''
  for (const b of bytes)
    bin += String.fromCharCode(b)
  return btoa(bin)
}
