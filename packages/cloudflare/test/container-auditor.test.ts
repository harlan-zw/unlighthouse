import type { ContainerNamespaceLike, ContainerStubLike } from '@unlighthouse/cloudflare/auditors/container'
import { createContainerLighthouseAuditor } from '@unlighthouse/cloudflare/auditors/container'
import { describe, expect, it, vi } from 'vitest'

describe('container Lighthouse auditor', () => {
  it('maps an audit request onto the named Container stub', async () => {
    const fetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'container unavailable',
      json: async () => ({}),
    }))
    const stub: ContainerStubLike = { fetch }
    const getByName = vi.fn(() => stub)
    const container: ContainerNamespaceLike = {
      getByName,
      idFromName: () => {
        throw new Error('classic lookup should not run')
      },
      get: () => {
        throw new Error('classic lookup should not run')
      },
    }
    const auditor = createContainerLighthouseAuditor({
      container,
      token: 'shared-token',
      instanceName: 'scan-123',
      timeoutMs: 42_000,
    })

    await expect(auditor.audit('https://example.com/', undefined, {
      device: 'desktop',
      lighthouseConfig: { extends: 'lighthouse:default' },
      lighthouseFlags: { onlyCategories: ['seo'] },
    })).rejects.toMatchObject({
      code: 'INFRA_RETRYABLE',
      details: { status: 503, body: 'container unavailable' },
    })

    expect(getByName).toHaveBeenCalledWith('scan-123')
    expect(fetch).toHaveBeenCalledWith('https://container.internal/audit', expect.objectContaining({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer shared-token',
      },
      body: JSON.stringify({
        url: 'https://example.com/',
        config: { extends: 'lighthouse:default' },
        flags: { onlyCategories: ['seo'] },
        device: 'desktop',
      }),
    }))
  })

  it('supports the classic Durable Object namespace lookup', async () => {
    const stub: ContainerStubLike = {
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ invalid: true }),
      }),
    }
    const idFromName = vi.fn((name: string) => `id:${name}`)
    const get = vi.fn(() => stub)
    const auditor = createContainerLighthouseAuditor({
      container: { idFromName, get },
      token: 'shared-token',
    })

    await expect(auditor.audit('https://example.com/')).rejects.toMatchObject({
      code: 'INFRA_RETRYABLE',
      message: 'LighthouseContainer returned an invalid LHR',
    })
    expect(idFromName).toHaveBeenCalledWith('default')
    expect(get).toHaveBeenCalledWith('id:default')
  })
})
