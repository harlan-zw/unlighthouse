import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { createPsiProvider } from '@unlighthouse/core/auditors/psi'
import { createRemoteLighthouseAuditor } from '@unlighthouse/core/auditors/remote-lighthouse'
import { describe, expect, it } from 'vitest'
import { WEBMCP_CHROME_FEATURE, withWebMcpChromeFlag } from '../src/auditors/categories'

describe('lighthouse 13 agentic browsing support helpers', () => {
  it('adds the DevTools WebMCP Chrome feature flag without dropping existing feature flags', () => {
    expect(withWebMcpChromeFlag(['--headless'])).toEqual([
      '--headless',
      `--enable-features=${WEBMCP_CHROME_FEATURE}`,
    ])

    expect(withWebMcpChromeFlag(['--enable-features=ExistingFeature'])).toEqual([
      `--enable-features=ExistingFeature,${WEBMCP_CHROME_FEATURE}`,
    ])
  })

  it('respects an explicit WebMCP disable flag', () => {
    expect(withWebMcpChromeFlag([
      `--disable-features=${WEBMCP_CHROME_FEATURE}`,
    ])).toEqual([
      `--disable-features=${WEBMCP_CHROME_FEATURE}`,
    ])
  })

  it('rejects agentic-browsing for PSI before calling the external API', async () => {
    const provider = createPsiProvider()
    await expect(provider('https://example.com', {
      lighthouseFlags: { onlyCategories: ['agentic-browsing'] },
    })).rejects.toThrow(/PSI does not support Lighthouse categories: agentic-browsing/)
  })

  it('lets generic remote Lighthouse callers narrow advertised capabilities', () => {
    const auditor = createRemoteLighthouseAuditor({
      endpoint: 'https://chrome.example.test/performance',
      capabilities: {
        categories: ['performance', 'accessibility', 'seo', 'best-practices'],
      },
    })

    expect(auditor.capabilities.categories).not.toContain('agentic-browsing')
  })

  it('keeps the default remote Lighthouse transport Browserless-compatible', async () => {
    let requestBody: unknown
    const server = createServer((req, res) => {
      let raw = ''
      req.setEncoding('utf8')
      req.on('data', chunk => raw += chunk)
      req.on('end', () => {
        requestBody = JSON.parse(raw)
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({
          lighthouseVersion: '13.0.0',
          categories: {
            performance: { id: 'performance', title: 'Performance', score: 1, auditRefs: [] },
          },
          audits: {},
        }))
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    try {
      const port = (server.address() as AddressInfo).port
      const auditor = createRemoteLighthouseAuditor({
        endpoint: `http://127.0.0.1:${port}/performance`,
        token: 'secret',
      })
      await auditor.audit('https://example.com', undefined, {
        device: 'desktop',
        lighthouseConfig: { settings: { throttlingMethod: 'provided' } },
        lighthouseFlags: { onlyCategories: ['agentic-browsing'] },
      })

      expect(requestBody).toEqual({
        url: 'https://example.com',
        config: { settings: { throttlingMethod: 'provided' } },
      })
    }
    finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err)
            reject(err)
          else
            resolve()
        })
      })
    }
  })
})
