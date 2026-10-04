import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createLighthouseLoader } from '../src/lighthouse-download'

vi.mock('../src/compact-runtime', () => ({
  downloadAuditRuntime: vi.fn(async () => () => 'file:///unused-runtime.mjs'),
}))

it.skipIf(process.platform === 'win32')('rejects a writable Chrome cache before loading browser tooling', async () => {
  const cache = await mkdtemp(join(tmpdir(), 'unlighthouse-chrome-cache-'))
  try {
    await chmod(cache, 0o777)
    const load = createLighthouseLoader({ local: true, env: { CHROME_PATH: '' }, chrome: { useSystem: false, downloadFallbackCacheDir: cache } })
    await expect(load()).rejects.toThrow('Runtime cache is not protected')
  }
  finally { await rm(cache, { recursive: true, force: true }) }
})
