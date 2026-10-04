import type { AuditArtifact } from './audit-download-config'
import type { RuntimeDownloadOptions } from './runtime-download'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import { fetchAuditArtifact, verifyAuditArchive } from './audit-artifact'
import { auditArtifactPin, hasNpmDownloadConfig, parseAuditArtifact } from './audit-download-config'
import { downloadRuntimePackages, prepareRuntimeCache, runtimeCacheDirectory, withRuntimeDownloadLock } from './runtime-download'

/** Bounded, atomic extraction protects shared caches from interrupted or invalid downloads. */
export async function extractAuditRuntime(destination: string, readArchive: () => Promise<Uint8Array>, options: { signal?: AbortSignal, maxBytes?: number } = {}): Promise<(specifier: string) => string> {
  const ready = join(destination, 'ready')
  const resolver = () => {
    const require = createRequire(join(destination, 'package.json'))
    return (specifier: string) => pathToFileURL(require.resolve(specifier)).href
  }
  options.signal?.throwIfAborted()
  await prepareRuntimeCache(dirname(destination))
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
          const invalidPart = file.name.split('/').some(part => !part || /[. ]$/.test(part) || /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part))
          const invalidCharacters = /[\\:<>"|?*]/.test(file.name) || [...file.name].some(character => character.charCodeAt(0) < 32)
          if (!file.name.startsWith('node_modules/') || invalidPart || invalidCharacters)
            throw new Error(`Invalid audit archive path: ${file.name}`)
          total += file.originalSize
          if (total > (options.maxBytes ?? 100_000_000) || ++count > 10_000)
            throw new Error('Audit archive exceeds extraction limits.')
          return true
        },
      })
      await mkdir(staging, { mode: 0o700 })
      const entries = Object.entries(files)
      for (let start = 0; start < entries.length; start += 32) {
        options.signal?.throwIfAborted()
        const batch = await Promise.allSettled(entries.slice(start, start + 32).map(async ([path, data]) => {
          const target = join(staging, path)
          await mkdir(dirname(target), { recursive: true, mode: 0o700 })
          await writeFile(target, data, { mode: 0o600 })
        }))
        const failure = batch.find(result => result.status === 'rejected')
        if (failure?.status === 'rejected')
          throw failure.reason
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
  const artifact = parseAuditArtifact(options.artifact ?? auditArtifactPin())
  const env = { ...process.env, ...options.env }
  const url = options.url ?? env.UNLIGHTHOUSE_RUNTIME_URL
  const destination = join(options.cacheDir ?? runtimeCacheDirectory(env), `audit-${artifact.sha256}`)
  return extractAuditRuntime(destination, async () => {
    if (!url && (options.install || hasNpmDownloadConfig(env))) {
      const resolve = await downloadRuntimePackages({ '@unlighthouse/lighthouse-runtime': artifact.version }, {
        ...options,
        validate: async (resolve) => {
          const archive = await (async () => {
            try {
              const path = fileURLToPath(resolve('@unlighthouse/lighthouse-runtime'))
              if ((await stat(path)).size > 15_000_000)
                return undefined
              return await readFile(path)
            }
            catch (error) {
              if (['ENOENT', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes((error as NodeJS.ErrnoException).code ?? ''))
                return undefined // A missing payload is a recoverable cache validation failure.
              throw error
            }
          })()
          return archive && createHash('sha256').update(archive).digest('hex') === artifact.sha256
            ? { _tag: 'Valid' }
            : { _tag: 'Invalid', reason: 'Audit runtime integrity mismatch.' }
        },
      })
      return verifyAuditArchive(await readFile(fileURLToPath(resolve('@unlighthouse/lighthouse-runtime'))), artifact.sha256)
    }
    options.logger?.info?.(`Downloading audit runtime ${artifact.version}`)
    return fetchAuditArtifact(url ?? `https://registry.npmjs.org/@unlighthouse/lighthouse-runtime/-/lighthouse-runtime-${artifact.version}.tgz`, artifact.sha256, options)
  }, options)
}
