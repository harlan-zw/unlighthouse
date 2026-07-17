import type { Auditor, LighthouseReport } from '@unlighthouse/contracts/ports'
import { createLighthouseContainerServer } from '@unlighthouse/lighthouse-container/server'
import { toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'

function createAuditor() {
  const report = {
    finalUrl: 'https://example.com/',
    categories: { performance: { score: 1 } },
  } as unknown as LighthouseReport
  const audit = vi.fn(async () => report)
  const auditor: Auditor = {
    capabilities: {
      reliablePerfScores: true,
      reliableFieldData: false,
      supportsThrottling: true,
      categories: ['performance'],
    },
    audit,
  }
  return { audit, auditor, report }
}

describe('lighthouse container server', () => {
  it('serves health without loading the auditor', async () => {
    const getAuditor = vi.fn(async () => createAuditor().auditor)
    const handler = toWebHandler(createLighthouseContainerServer({
      token: 'shared-token',
      auditorConfigured: false,
      getAuditor,
      nodeVersion: '24.test',
    }))

    const response = await handler(new Request('http://container.test/health'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'unlighthouse-lighthouse',
      node: '24.test',
    })
    expect(getAuditor).not.toHaveBeenCalled()
  })

  it('rejects audit requests when the runtime is not configured', async () => {
    const getAuditor = vi.fn(async () => createAuditor().auditor)
    const handler = toWebHandler(createLighthouseContainerServer({
      token: '',
      auditorConfigured: false,
      getAuditor,
      nodeVersion: '24.test',
    }))

    const response = await handler(new Request('http://container.test/audit', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/' }),
      headers: { 'content-type': 'application/json' },
    }))

    expect(response.status).toBe(503)
    expect(getAuditor).not.toHaveBeenCalled()
  })

  it('authenticates and forwards audit options', async () => {
    const { audit, auditor, report } = createAuditor()
    const getAuditor = vi.fn(async () => auditor)
    const handler = toWebHandler(createLighthouseContainerServer({
      token: 'shared-token',
      auditorConfigured: true,
      getAuditor,
      nodeVersion: '24.test',
    }))

    const response = await handler(new Request('http://container.test/audit', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer shared-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://example.com/',
        device: 'desktop',
        config: { extends: 'lighthouse:default' },
        flags: { onlyCategories: ['performance'] },
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(report)
    expect(getAuditor).toHaveBeenCalledOnce()
    expect(audit).toHaveBeenCalledWith('https://example.com/', undefined, {
      device: 'desktop',
      lighthouseConfig: { extends: 'lighthouse:default' },
      lighthouseFlags: { onlyCategories: ['performance'] },
    })
  })

  it('rejects an invalid bearer token before loading the auditor', async () => {
    const getAuditor = vi.fn(async () => createAuditor().auditor)
    const handler = toWebHandler(createLighthouseContainerServer({
      token: 'shared-token',
      auditorConfigured: true,
      getAuditor,
      nodeVersion: '24.test',
    }))

    const response = await handler(new Request('http://container.test/audit', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer wrong-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: 'https://example.com/' }),
    }))

    expect(response.status).toBe(401)
    expect(getAuditor).not.toHaveBeenCalled()
  })
})
