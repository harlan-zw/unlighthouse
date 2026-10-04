import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

export function verifyAuditArchive(archive: Uint8Array, sha256: string): Uint8Array {
  if (createHash('sha256').update(archive).digest('hex') !== sha256)
    throw new Error('Audit runtime integrity mismatch. Retry the download.')
  return archive
}

/** Read one fixed npm payload. Never extract tar paths or execute package scripts. */
export function readAuditArtifact(tarball: Uint8Array, sha256: string): Uint8Array {
  const tar = gunzipSync(tarball, { maxOutputLength: 25_000_000 })
  let archive: Uint8Array | undefined
  let terminated = false
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) {
      terminated = true
      break
    }
    const octal = (start: number, end: number) => {
      const value = header.subarray(start, end).toString('ascii').replace(/\0.*$/, '').trim()
      if (!/^[0-7]+$/.test(value))
        throw new Error('Invalid audit tarball.')
      return Number.parseInt(value, 8)
    }
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)
    const size = octal(124, 136)
    const end = offset + 512 + size
    if (checksum !== octal(148, 156) || !Number.isSafeInteger(size) || end > tar.length)
      throw new Error('Invalid audit tarball.')
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    const path = prefix ? `${prefix}/${name}` : name
    if (path === 'package/dist/runtime.zip') {
      if (archive || (header[156] !== 0 && header[156] !== 48))
        throw new Error('Invalid audit tarball.')
      archive = tar.subarray(offset + 512, end)
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (!terminated)
    throw new Error('Invalid audit tarball.')
  if (!archive)
    throw new Error('Audit runtime payload is missing.')
  return verifyAuditArchive(archive, sha256)
}

export async function fetchAuditArtifact(url: string, sha256: string, options: { fetch?: typeof fetch, signal?: AbortSignal, maxDownloadBytes?: number } = {}): Promise<Uint8Array> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:')
    throw new Error('Audit download URL must use HTTP or HTTPS.')
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000)
  signal.throwIfAborted()
  const response = await (options.fetch ?? fetch)(target, { signal })
  signal.throwIfAborted()
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Audit runtime download failed (${response.status}). Retry the download.`)
  }
  if (!response.body)
    throw new Error('Audit runtime download returned no data.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done)
        break
      bytes += chunk.value.byteLength
      if (bytes > (options.maxDownloadBytes ?? 15_000_000))
        throw new Error('Audit download exceeds the size limit.')
      chunks.push(chunk.value)
    }
    return readAuditArtifact(Buffer.concat(chunks), sha256)
  }
  finally {
    await reader.cancel()
  }
}
