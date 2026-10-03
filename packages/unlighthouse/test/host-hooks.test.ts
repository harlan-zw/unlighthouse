import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUnlighthouseHost } from 'unlighthouse'
import { expect, it, vi } from 'vitest'

it('registers completion hooks before the first scan', async () => {
  const root = mkdtempSync(join(tmpdir(), 'unl-host-hooks-'))
  const host = await createUnlighthouseHost({
    userConfig: { root, site: 'https://example.com', urls: ['/'], auditor: { name: 'mock' }, scanner: { sitemap: false, robotsTxt: false } },
    behavior: { ws: null },
    env: {},
  })
  const complete = vi.fn()
  try {
    host.hooks.hook('scan:complete', complete)
    const session = await host.start()
    await session.done
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ scanId: session.scanId }))
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('prepares resolved config before deriving the scan directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'unl-host-config-'))
  try {
    const host = await createUnlighthouseHost({
      userConfig: { root, site: 'https://example.com' },
      behavior: { ws: null },
      env: {},
      onResolvedConfig: async (config) => { config.site = 'https://www.example.com' },
    })
    expect(host.resolvedConfig.site).toBe('https://www.example.com')
    expect(host.runtimeSettings.siteUrl.hostname).toBe('www.example.com')
    expect(host.runtimeSettings.outputPath).toContain('www.example.com')
  }
  finally {
    rmSync(root, { recursive: true, force: true })
  }
})
