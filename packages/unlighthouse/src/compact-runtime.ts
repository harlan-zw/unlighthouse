import type { AuditArtifact } from './audit-download-config'
import type { RuntimeDownloadOptions } from './runtime-download'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import { fetchAuditArtifact, verifyAuditArchive } from './audit-artifact'
import { auditArtifactPin, hasNpmDownloadConfig } from './audit-download-config'
import { downloadRuntimePackages, runtimeCacheDirectory, withRuntimeDownloadLock } from './runtime-download'

/** Bounded, atomic extraction protects shared caches from interrupted or invalid downloads. */
export async function extractAuditRuntime(destination: string, readArchive: () => Promise<Uint8Array>, options: { signal?: AbortSignal, maxBytes?: number } = {}): Promise<(specifier: string) => string> {
  const ready = join(destination, 'ready')
  const resolver = () => {
    const require = createRequire(join(destination, 'package.json'))
    return (specifier: string) => pathToFileURL(require.resolve(specifier)).href
  }
  options.signal?.throwIfAborted()
  if (existsSync(ready))
    return resolver()
  return withRuntimeDownloadLock(`${destination}.lock`, async () => {
    if (existsSync(ready))
      return resolver()
    const staging = `${destination}.${randomUUID()}.tmp`
    try {
      const archive = await readArchive()
      options.signal?.throwIfAborted()
      let total = 0
      let count = 0
      const files = unzipSync(archive, {
        filter: (file) => {
          if (!file.name.startsWith('node_modules/') || file.name.split('/').some(part => !part || part === '.' || part === '..') || /[\\:\0]/.test(file.name))
            throw new Error(`Invalid audit archive path: ${file.name}`)
          total += file.originalSize
          if (total > (options.maxBytes ?? 100_000_000) || ++count > 10_000)
            throw new Error('Audit archive exceeds extraction limits.')
          return true
        },
      })
      await mkdir(staging)
      const entries = Object.entries(files)
      for (let start = 0; start < entries.length; start += 32) {
        options.signal?.throwIfAborted()
        await Promise.all(entries.slice(start, start + 32).map(async ([path, data]) => {
          const target = join(staging, path)
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, data)
        }))
      }
      options.signal?.throwIfAborted()
      await writeFile(join(staging, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
      await writeFile(join(staging, 'ready'), '1')
      // Recover an incomplete cache left by a killed process before atomic publication.
      await rm(destination, { recursive: true, force: true })
      await rename(staging, destination)
      return resolver()
    }
    finally {
      await rm(staging, { recursive: true, force: true })
    }
  }, options.signal)
}

export interface AuditRuntimeDownloadOptions extends RuntimeDownloadOptions {
  artifact?: AuditArtifact
  url?: string
  fetch?: typeof fetch
  maxDownloadBytes?: number
}

export async function downloadAuditRuntime(options: AuditRuntimeDownloadOptions = {}): Promise<(specifier: string) => string> {
  const artifact = options.artifact ?? auditArtifactPin()
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(artifact.version) || !/^[a-f0-9]{64}$/.test(artifact.sha256))
    throw new Error('Invalid audit runtime pin.')
  const env = { ...process.env, ...options.env }
  const url = options.url ?? env.UNLIGHTHOUSE_RUNTIME_URL
  const destination = join(options.cacheDir ?? runtimeCacheDirectory(env), `audit-${artifact.sha256}`)
  return extractAuditRuntime(destination, async () => {
    if (!url && (options.install || hasNpmDownloadConfig(env))) {
      const resolve = await downloadRuntimePackages({ '@unlighthouse/lighthouse-runtime': artifact.version }, options)
      return verifyAuditArchive(await readFile(fileURLToPath(resolve('@unlighthouse/lighthouse-runtime'))), artifact.sha256)
    }
    options.logger?.info?.(`Downloading audit runtime ${artifact.version}`)
    return fetchAuditArtifact(url ?? `https://registry.npmjs.org/@unlighthouse/lighthouse-runtime/-/lighthouse-runtime-${artifact.version}.tgz`, artifact.sha256, options)
  }, options)
}
