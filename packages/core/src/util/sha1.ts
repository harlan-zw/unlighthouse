/**
 * Pure-JS SHA-1 (hex digest). Browser-safe drop-in for
 * `node:crypto createHash('sha1').update(input).digest('hex')` so the read-path
 * modules (memory storage, handlers) can be bundled into the static, offline
 * dashboard build — Node's `crypto` can't.
 *
 * Matches Node's output for UTF-8 string input (verified against node:crypto in
 * test/sha1.test.ts). Inputs here are short (URLs); the 64-bit length field only
 * fills its low word, which is all we need.
 */
export function sha1Hex(input: string): string {
  const rotl = (n: number, s: number): number => (n << s) | (n >>> (32 - s))

  const bytes = new TextEncoder().encode(input)
  const byteLen = bytes.length
  const totalWords = (((byteLen + 8) >> 6) + 1) * 16
  const words = new Uint32Array(totalWords)
  for (let i = 0; i < byteLen; i++)
    words[i >> 2] |= bytes[i]! << ((3 - (i & 3)) * 8)
  // append the '1' bit (0x80) after the message
  words[byteLen >> 2] |= 0x80 << ((3 - (byteLen & 3)) * 8)
  // 64-bit big-endian bit length in the final two words
  words[totalWords - 2] = Math.floor((byteLen * 8) / 0x1_0000_0000)
  words[totalWords - 1] = (byteLen * 8) >>> 0

  let h0 = 0x67452301
  let h1 = 0xEFCDAB89
  let h2 = 0x98BADCFE
  let h3 = 0x10325476
  let h4 = 0xC3D2E1F0

  const w = new Uint32Array(80)
  for (let i = 0; i < totalWords; i += 16) {
    for (let t = 0; t < 16; t++)
      w[t] = words[i + t]!
    for (let t = 16; t < 80; t++)
      w[t] = rotl(w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!, 1)

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let t = 0; t < 80; t++) {
      let f: number
      let k: number
      if (t < 20) {
        f = (b & c) | (~b & d)
        k = 0x5A827999
      }
      else if (t < 40) {
        f = b ^ c ^ d
        k = 0x6ED9EBA1
      }
      else if (t < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8F1BBCDC
      }
      else {
        f = b ^ c ^ d
        k = 0xCA62C1D6
      }
      const tmp = (rotl(a, 5) + f + e + k + w[t]!) | 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = tmp
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4)
}
