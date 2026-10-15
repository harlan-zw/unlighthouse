import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome, launchChrome } from '../src/audit/chrome.ts'
import type { ChromeProcess } from '../src/audit/chrome.ts'
import { createAuditPool } from '../src/audit/pool.ts'
import { runPsi } from '../src/audit/psi.ts'
import type { PsiRunner } from '../src/audit/psi.ts'
import { parseConfig } from '../src/config.ts'
import type { AuditJob } from '../src/contracts.ts'
import { CATEGORIES } from '../src/types.ts'
import { writePlugin, PLUGIN_AUDIT, PLUGIN_NAME } from './fixtures/plugin.ts'
import { serveFixture } from './fixtures/site.ts'

const recordedLhr = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(await Bun.file(join(import.meta.dir, 'fixtures/lhr-mobile.json.gz')).bytes())))

const hasChrome = (() => {
  try {
    findChrome()
    return true
  }
  catch {
    return false
  }
})()

const KEY_ENV = 'UNLIGHTHOUSE_TEST_PSI_KEY'
process.env[KEY_ENV] = 'test-key'

function job(url: string, overrides: Partial<AuditJob> = {}): AuditJob {
  return {
    url,
    device: 'mobile',
    categories: [...CATEGORIES],
    throttling: 'simulate',
    samples: 1,
    timeoutMs: 90_000,
    concurrency: 1,
    chromeFlags: [],
    auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} },
    ...overrides,
  }
}

function isWebp(bytes: Uint8Array | null): boolean {
  if (!bytes)
    return false
  const text = new TextDecoder().decode(bytes.subarray(0, 12))
  return text.startsWith('RIFF') && text.endsWith('WEBP')
}

interface PsiCall {
  query: URLSearchParams
}

function fakePsi(respond: (call: PsiCall, index: number) => Response) {
  const calls: PsiCall[] = []
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const call = { query: new URL(request.url).searchParams }
      calls.push(call)
      return respond(call, calls.length - 1)
    },
  })
  return { endpoint: `http://127.0.0.1:${server.port}/pagespeedonline/v5/runPagespeed`, calls, stop: () => server.stop(true) }
}

function psiRunner(endpoint: string, overrides: Record<string, unknown> = {}): PsiRunner {
  return parseConfig({ runner: { type: 'psi', endpoint, apiKeyEnv: KEY_ENV, backoffMs: 10, ...overrides } }).runner as PsiRunner
}

const quota = () => Response.json({ error: { code: 429, message: 'Quota exceeded for quota metric \'Queries\'' } }, { status: 429 })
const ok = () => Response.json({ id: 'x', lighthouseResult: recordedLhr })

describe('PageSpeed Insights runner', () => {
  test('requests the device strategy and the categories PSI knows, with the API key', async () => {
    const psi = fakePsi(ok)
    try {
      const outcome = await runPsi(job('https://example.com/a', { device: 'desktop' }), psiRunner(psi.endpoint), { apiKey: 'k' })
      expect(outcome.ok).toBe(true)
      const query = psi.calls[0]!.query
      expect(query.get('url')).toBe('https://example.com/a')
      expect(query.get('strategy')).toBe('DESKTOP')
      expect(query.get('key')).toBe('k')
      expect(query.getAll('category')).toEqual(['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO'])
    }
    finally {
      psi.stop()
    }
  })

  test('backs off on HTTP 429, honouring Retry-After, then succeeds', async () => {
    const psi = fakePsi((_, index) => index === 0 ? new Response('{}', { status: 429, headers: { 'retry-after': '2' } }) : index === 1 ? quota() : ok())
    const waits: number[] = []
    try {
      const outcome = await runPsi(job('https://example.com/'), psiRunner(psi.endpoint), { apiKey: 'k', sleep: async (ms) => {
        waits.push(ms)
      } })
      expect(outcome.ok).toBe(true)
      expect(waits).toEqual([2000, 20])
    }
    finally {
      psi.stop()
    }
  })

  test('fails the page with a clear message once the quota retries are used up', async () => {
    const psi = fakePsi(quota)
    try {
      const outcome = await runPsi(job('https://example.com/'), psiRunner(psi.endpoint, { maxRetries: 2 }), { apiKey: 'k', sleep: async () => {} })
      expect(outcome).toMatchObject({ ok: false, kind: 'page', code: 'PSI_QUOTA' })
      expect(!outcome.ok && outcome.message).toContain('quota exceeded (HTTP 429) after 3 attempt(s)')
      expect(psi.calls).toHaveLength(3)
    }
    finally {
      psi.stop()
    }
  })

  test('maps Lighthouse page errors and server errors', async () => {
    const psi = fakePsi((_, index) => index === 0
      ? Response.json({ error: { code: 500, message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page you requested.' } }, { status: 500 })
      : index === 1
        ? Response.json({ error: { code: 503, message: 'Backend unavailable' } }, { status: 503 })
        : Response.json({ id: 'x' }))
    try {
      const runner = psiRunner(psi.endpoint)
      expect(await runPsi(job('https://example.com/'), runner, { apiKey: 'k' })).toMatchObject({ ok: false, kind: 'page', code: 'FAILED_DOCUMENT_REQUEST' })
      expect(await runPsi(job('https://example.com/'), runner, { apiKey: 'k' })).toMatchObject({ ok: false, kind: 'infra', code: 'PSI_HTTP_503' })
      expect(await runPsi(job('https://example.com/'), runner, { apiKey: 'k' })).toMatchObject({ ok: false, kind: 'infra', code: 'PSI_NO_RESULT' })
    }
    finally {
      psi.stop()
    }
  })

  test('runs through the audit pool without Chrome and reconciles the embedded report with remote provenance', async () => {
    const psi = fakePsi((call, index) => index === 0 ? new Response('{}', { status: 429, headers: { 'retry-after': '0' } }) : call.query.get('key') === 'test-key' ? ok() : new Response('bad key', { status: 400 }))
    const pool = createAuditPool({ concurrency: 1, retries: 0 })
    try {
      const result = await pool.run(job('https://example.com/', { chromePath: '/missing/chrome', runner: psiRunner(psi.endpoint) }))
      expect(result.scores.performance).toBe(recordedLhr.categories.performance.score)
      expect(result.findings.length).toBeGreaterThan(0)
      expect(result.provenance).toMatchObject({ runner: 'psi', throttling: 'simulate', lighthouseVersion: recordedLhr.lighthouseVersion })
      expect(isWebp(result.thumbnail)).toBe(true)
      expect(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(result.report)))).lighthouseVersion).toBe(recordedLhr.lighthouseVersion)
      expect(psi.calls).toHaveLength(2)
    }
    finally {
      await pool.close()
      psi.stop()
    }
  }, 60_000)

  test('a quota failure fails the page without the pool retrying it', async () => {
    const psi = fakePsi(quota)
    const pool = createAuditPool({ concurrency: 1, retries: 2 })
    try {
      const error = await pool.run(job('https://example.com/', { runner: psiRunner(psi.endpoint, { maxRetries: 1, backoffMs: 0 }) })).catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: 'AUDIT_FAILED', details: { code: 'PSI_QUOTA', attempts: 1 } })
      expect(psi.calls).toHaveLength(2)
    }
    finally {
      await pool.close()
      psi.stop()
    }
  }, 60_000)
})

describe.skipIf(!hasChrome)('remote Chrome over CDP and plugins with Chrome', () => {
  const site = serveFixture()
  const pool = createAuditPool({ concurrency: 1, retries: 0 })
  let chrome: ChromeProcess
  let wsEndpoint: string

  beforeAll(async () => {
    chrome = await launchChrome({ chromePath: findChrome() })
    const version = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json() as { webSocketDebuggerUrl: string }
    wsEndpoint = version.webSocketDebuggerUrl
  })

  afterAll(async () => {
    await pool.close()
    await chrome?.kill()
    site.stop()
  })

  test('audits a page in a remote Chrome reached through its WebSocket endpoint', async () => {
    const runner = parseConfig({ runner: { type: 'cdp', endpoint: wsEndpoint } }).runner
    const result = await pool.run(job(`${site.origin}/`, { chromePath: '/missing/chrome', runner }))
    expect(result.statusCode).toBe(200)
    expect(result.scores.performance).not.toBeNull()
    expect(result.provenance.runner).toBe('cdp')
    expect(isWebp(result.thumbnail)).toBe(true)
    const targets = await (await fetch(`http://127.0.0.1:${chrome.port}/json/list`)).json() as Array<{ url: string }>
    expect(targets.some(target => target.url.startsWith(site.origin))).toBe(false)
  }, 120_000)

  test('fails the page with a clear message when the remote Chrome is unreachable', async () => {
    const runner = parseConfig({ runner: { type: 'cdp', endpoint: 'ws://127.0.0.1:9/devtools/browser/none' } }).runner
    const error = await pool.run(job(`${site.origin}/`, { runner })).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'AUDIT_FAILED', details: { code: 'CDP_CONNECT_FAILED' } })
  }, 60_000)

  test('loads a plugin from the project directory and reports its failing audits', async () => {
    const project = mkdtempSync(join(tmpdir(), 'unlighthouse-plugin-project-'))
    try {
      writePlugin(project)
      const result = await pool.run(job(`${site.origin}/`, {
        categories: ['seo'],
        cwd: project,
        lighthouse: { plugins: [PLUGIN_NAME], skipAudits: ['meta-description'] },
      }))
      const audits = new Set(result.findings.map(finding => finding.auditId))
      expect(audits.has(PLUGIN_AUDIT)).toBe(true)
      expect(audits.has('meta-description')).toBe(false)
      expect(result.findings.find(finding => finding.auditId === PLUGIN_AUDIT)!.category).toBeNull()
      const lhr = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(result.report))))
      expect(lhr.categories[PLUGIN_NAME].score).toBe(0)
    }
    finally {
      rmSync(project, { recursive: true, force: true })
    }
  }, 120_000)
})
