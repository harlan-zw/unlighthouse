import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../src/audit/chrome.ts'
import { runFlow } from '../src/audit/flow.ts'
import { reconcileFlow } from '../src/audit/reconcile.ts'
import { main } from '../src/cli.ts'
import { parseConfig } from '../src/config.ts'
import type { FlowJob, FlowRunResult, Store } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { UnlighthouseError } from '../src/errors.ts'
import { EventBus } from '../src/events.ts'
import { analyzeScan, budgetReport } from '../src/ops/analysis.ts'
import { operations } from '../src/ops/operations.ts'
import { invoke } from '../src/ops/registry.ts'
import type { Scanner } from '../src/scan/runner.ts'
import { createScanner } from '../src/scan/runner.ts'
import { createServer, renderFlowReport } from '../src/server/app.ts'
import { exportScan } from '../src/server/export.ts'
import { CATEGORIES } from '../src/types.ts'
import { createFakePool } from './fixtures/fake-pool.ts'
import { serveFlowApp } from './fixtures/flow-app.ts'
import type { OwnTmp } from './fixtures/own-tmp.ts'
import { ownTmp } from './fixtures/own-tmp.ts'
import { servePages } from './fixtures/pages.ts'

const hasChrome = (() => {
  try {
    findChrome()
    return true
  }
  catch {
    return false
  }
})()

const EXAMPLE = join(import.meta.dir, '../examples/flows/search.ts')
const HANG = join(import.meta.dir, 'fixtures/flows/hang.ts')
const BROKEN = join(import.meta.dir, 'fixtures/flows/broken.ts')
const RECORDED = new Uint8Array(readFileSync(join(import.meta.dir, 'fixtures/flow-result.json.gz')))
const NO_AUTH = { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} }

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  }
  catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

function recordedResult(name = 'search', device: FlowRunResult['device'] = 'mobile'): FlowRunResult {
  const flow = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(RECORDED)))
  return {
    name,
    device,
    startUrl: 'http://127.0.0.1/',
    lighthouseVersion: '13.5.0',
    steps: reconcileFlow(flow, { categories: [...CATEGORIES] }),
    report: RECORDED,
    durationMs: 1234,
  }
}

describe.skipIf(!hasChrome)('user flows with Chrome', () => {
  const app = serveFlowApp()
  let tmp: OwnTmp

  beforeAll(() => {
    tmp = ownTmp('unlighthouse-test-flow-')
  })

  afterAll(() => {
    app.stop()
    tmp.restore()
  })

  const flowChromeProcesses = () => tmp.chromeProcesses('unlighthouse-flow-')

  function job(module: string, overrides: Partial<FlowJob> = {}): FlowJob {
    return {
      name: 'search',
      module,
      url: `${app.origin}/`,
      device: 'mobile',
      categories: [...CATEGORIES],
      throttling: 'simulate',
      timeoutMs: 120_000,
      chromeFlags: [],
      auth: NO_AUTH,
      ...overrides,
    }
  }

  test('runs the example flow and reports every step', async () => {
    const result = await runFlow(job(EXAMPLE))
    expect(result.steps.map(step => [step.name, step.mode])).toEqual([
      ['Open the home page', 'navigation'],
      ['Type a search', 'timespan'],
      ['Submit the search', 'navigation'],
      ['Results', 'snapshot'],
    ])
    const [home, typing, submit, snapshot] = result.steps
    expect(home!.scores.performance).not.toBeNull()
    expect(home!.metrics.lcp).toBeGreaterThan(0)
    expect(typing!.metrics.inp).toBeGreaterThan(100)
    expect(typing!.metrics.tbt).not.toBeNull()
    expect(typing!.metrics.lcp).toBeNull()
    expect(typing!.scores.seo).toBeNull()
    expect(submit!.url).toBe(`${app.origin}/results?q=running+shoes`)
    expect(snapshot!.metrics.inp).toBeNull()
    expect(snapshot!.scores.accessibility).not.toBeNull()
    expect(result.lighthouseVersion).toBe('13.5.0')
    const report = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(new Uint8Array(result.report))))
    expect(report.steps).toHaveLength(4)
    expect(renderFlowReport(result.report)).toContain('<html')
  }, 180_000)

  test('a hung flow is killed with its Chrome at the timeout', async () => {
    const started = Date.now()
    const error = await rejection(runFlow(job(HANG, { timeoutMs: 15_000 })))
    expect(error).toBeInstanceOf(UnlighthouseError)
    expect((error as UnlighthouseError).details).toMatchObject({ code: 'TIMEOUT' })
    expect(Date.now() - started).toBeLessThan(25_000)
    await Bun.sleep(200)
    expect(flowChromeProcesses()).toBe(0)
  }, 60_000)

  test('a failing flow script is reported with its message', async () => {
    const error = await rejection(runFlow(job(BROKEN)))
    expect((error as UnlighthouseError).details).toMatchObject({ code: 'FLOW_SCRIPT_FAILED' })
    expect((error as Error).message).toContain('the checkout button is missing')
    expect(flowChromeProcesses()).toBe(0)
  }, 60_000)

  test('cancelling a flow kills its Chrome', async () => {
    const controller = new AbortController()
    const running = rejection(runFlow(job(HANG), controller.signal))
    await Bun.sleep(3_000)
    controller.abort()
    expect(await running).toBeInstanceOf(DOMException)
    await Bun.sleep(200)
    expect(flowChromeProcesses()).toBe(0)
  }, 60_000)
})

describe('user flows in scans', () => {
  const site = servePages(['/', '/about'])
  let dir: string
  let store: Store
  let scanner: Scanner
  const jobs: FlowJob[] = []

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'unlighthouse-flow-test-'))
    store = openStore(join(dir, 'data'))
    jobs.length = 0
    scanner = createScanner({
      store,
      bus: new EventBus(),
      createPool: createFakePool().createPool,
      cpus: 12,
      cancelPollMs: 20,
      config: {
        devices: ['mobile', 'desktop'],
        flows: [
          { name: 'search', module: './flows/search.ts' },
          { name: 'checkout', module: '/abs/checkout.ts', url: '/cart', devices: ['mobile'] },
        ],
        budgets: { flows: { search: { steps: { metrics: { inp: 100 }, scores: { performance: 0.5 } } }, checkout: { steps: { metrics: { tbt: 10 } } } } },
      },
      async runFlow(job) {
        jobs.push(job)
        if (job.name === 'checkout')
          throw new UnlighthouseError('AUDIT_FAILED', 'the checkout button is missing', { code: 'FLOW_SCRIPT_FAILED' })
        return recordedResult(job.name, job.device)
      },
    })
  })

  afterEach(async () => {
    await scanner.close()
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  afterAll(() => site.stop())

  async function finishedScan(): Promise<string> {
    const scan = scanner.start({ site: site.origin })
    const done = await scanner.wait(scan.id, 10_000)
    expect(done.status).toBe('done')
    return scan.id
  }

  test('runs configured flows after the page audits and stores their steps', async () => {
    const scanId = await finishedScan()
    expect(jobs.map(job => [job.name, job.device, job.url])).toEqual([
      ['search', 'mobile', `${site.origin}/`],
      ['search', 'desktop', `${site.origin}/`],
      ['checkout', 'mobile', `${site.origin}/cart`],
    ])
    expect(jobs[0]!.module).toBe(join(process.cwd(), 'flows/search.ts'))
    const runs = store.listFlowRuns(scanId)
    expect(runs.map(run => [run.name, run.device, run.status])).toEqual([
      ['checkout', 'mobile', 'failed'],
      ['search', 'desktop', 'done'],
      ['search', 'mobile', 'done'],
    ])
    expect(runs[0]!.error).toContain('the checkout button is missing')
    expect(runs[2]!.steps.map(step => step.mode)).toEqual(['navigation', 'timespan', 'navigation', 'snapshot'])
    expect(runs[2]!.steps[1]!.metrics.inp).toBeGreaterThan(0)

    const detail = await invoke(operations, { store, scanner }, 'flows.get', { scanId, name: 'search', device: 'mobile' }) as NonNullable<ReturnType<Store['getFlowRun']>>
    const findings = detail.steps.flatMap(step => step.findings)
    expect(findings.length).toBe(runs[2]!.steps.reduce((sum, step) => sum + step.findings, 0))
    expect(findings.length).toBeGreaterThan(0)
    expect(await invoke(operations, { store, scanner }, 'flows.list', { scanId })).toEqual(runs)
    expect(await rejection(invoke(operations, { store, scanner }, 'flows.get', { scanId, name: 'nope', device: 'mobile' }))).toMatchObject({ code: 'NOT_FOUND' })
    expect(store.getFlowReport(scanId, 'search', 'mobile')).toEqual(RECORDED)
    expect(store.getFlowReport(scanId, 'checkout', 'mobile')).toBeNull()
  })

  test('summarizes flows and checks flow budgets', async () => {
    const scanId = await finishedScan()
    const analysis = analyzeScan(store, scanId)
    const brief = analysis.summary.flows!.find(flow => flow.name === 'search' && flow.device === 'mobile')!
    expect(brief.steps[1]).toMatchObject({ name: 'Type a search', mode: 'timespan' })
    expect(brief.steps[1]!.metrics.inp).toBeGreaterThan(0)
    expect(analysis.summary.flows!.find(flow => flow.name === 'checkout')).toMatchObject({ status: 'failed', error: expect.stringContaining('checkout') })

    const report = budgetReport(analysis, parseConfig({ budgets: { flows: { search: { steps: { metrics: { inp: 100 }, scores: { performance: 0.5 } } }, checkout: { steps: { metrics: { tbt: 10 } } }, missing: { steps: { metrics: { cls: 0.1 } } } } } }).budgets)
    expect(report.passed).toBe(false)
    const inp = report.results.filter(result => result.rule === 'flow:metric:inp')
    expect(inp.map(result => result.scope)).toEqual(['search · desktop · Type a search', 'search · mobile · Type a search'])
    expect(inp.every(result => result.passed === (result.actual! <= 100))).toBe(true)
    expect(report.results.find(result => result.rule === 'flow:run')).toMatchObject({ scope: 'checkout · mobile', passed: false })
    expect(report.results.find(result => result.scope === 'missing')).toMatchObject({ skipped: true, passed: true })
    const scores = report.results.filter(result => result.rule === 'flow:score:performance')
    expect(scores).toHaveLength(8)
  })

  test('scans.start ignores flow modules sent over the API', async () => {
    const bare = createScanner({ store, bus: new EventBus(), createPool: createFakePool().createPool, cpus: 12, runFlow: async () => {
      throw new Error('no flow should run')
    } })
    try {
      const started = await invoke(operations, { store, scanner: bare }, 'scans.start', {
        site: site.origin,
        flows: [{ name: 'evil', module: '/tmp/evil.ts' }],
      }) as { id: string, options: { flows: unknown[] } }
      expect(started.options.flows).toEqual([])
      expect((await bare.wait(started.id, 10_000)).status).toBe('done')
      expect(store.listFlowRuns(started.id)).toEqual([])
    }
    finally {
      await bare.close()
    }
  })

  test('without local Chrome a remote-runner scan still finishes and records each flow as failed', async () => {
    const noChrome = async () => {
      throw new UnlighthouseError('CHROME_NOT_FOUND', 'No Chrome or Chromium installation found.')
    }
    const flows = [{ name: 'search', module: '/abs/search.ts' }]
    const remote = createScanner({ store, bus: new EventBus(), createPool: createFakePool().createPool, cpus: 12, runFlow: noChrome, config: {
      devices: ['mobile'],
      flows,
      runner: { type: 'cdp', endpoint: 'ws://127.0.0.1:9/devtools/browser/x' },
    } })
    const local = createScanner({ store, bus: new EventBus(), createPool: createFakePool().createPool, cpus: 12, runFlow: noChrome, config: { devices: ['mobile'], flows } })
    try {
      const remoteScan = remote.start({ site: site.origin })
      expect((await remote.wait(remoteScan.id, 10_000)).status).toBe('done')
      const [run] = store.listFlowRuns(remoteScan.id)
      expect(run).toMatchObject({ name: 'search', status: 'failed' })
      expect(run!.error).toContain('User flows run in local Chrome even with the cdp runner')

      const localScan = local.start({ site: site.origin })
      const failed = await local.wait(localScan.id, 10_000)
      expect(failed.status).toBe('failed')
      expect(failed.error).toContain('No Chrome')
    }
    finally {
      await remote.close()
      await local.close()
    }
  })

  test('serves the flow report with auth and exports flows', async () => {
    const scanId = await finishedScan()
    const server = createServer({ store, scanner, bus: new EventBus(), port: 0, token: 'flow-token-0123456789' })
    try {
      const path = `${server.url}/flow-report/${scanId}/search/mobile`
      expect((await fetch(path)).status).toBe(401)
      const response = await fetch(path, { headers: { authorization: 'Bearer flow-token-0123456789' } })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-security-policy')).toContain('sandbox')
      expect(await response.text()).toContain('<html')
      expect((await fetch(`${server.url}/flow-report/${scanId}/checkout/mobile`, { headers: { authorization: 'Bearer flow-token-0123456789' } })).status).toBe(404)
    }
    finally {
      await server.stop()
    }

    const out = join(dir, 'export')
    const exported = await exportScan({ store, scanId, out, version: 'test' })
    expect(exported.flows).toBe(3)
    const flows = JSON.parse(readFileSync(join(out, 'flows.json'), 'utf8')) as Array<{ name: string, report: string | null, steps: Array<{ findings: unknown[] }> }>
    const search = flows.find(flow => flow.name === 'search')!
    expect(search.report).toMatch(/^flow-reports\//)
    expect(existsSync(join(out, search.report!))).toBe(true)
    expect(Array.isArray(search.steps[0]!.findings)).toBe(true)
    expect(flows.find(flow => flow.name === 'checkout')!.report).toBeNull()
  }, 60_000)
})

describe('unlighthouse flow', () => {
  test('runs one flow ad hoc and writes its report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'unlighthouse-flow-cli-'))
    let out = ''
    let err = ''
    const jobs: FlowJob[] = []
    try {
      const code = await main(['flow', 'flows/search.ts', '--url', 'https://shop.example/', '-d', 'mobile,desktop', '--report', 'out/flow.html'], {
        cwd: dir,
        env: {},
        handleSignals: false,
        stdout: { write: (text: string) => (out += text) },
        stderr: { write: (text: string) => (err += text) },
        runFlow: async (job) => {
          jobs.push(job)
          return recordedResult(job.name, job.device)
        },
      })
      expect(code).toBe(0)
      expect(jobs.map(job => [job.name, job.device, job.url, job.module])).toEqual([
        ['search', 'mobile', 'https://shop.example/', join(dir, 'flows/search.ts')],
        ['search', 'desktop', 'https://shop.example/', join(dir, 'flows/search.ts')],
      ])
      expect(out).toContain('Flow search (mobile) · 4 step(s)')
      expect(out).toMatch(/2\. timespan +Type a search .*INP \d+ ms/)
      expect(readFileSync(join(dir, 'out/flow-mobile.html'), 'utf8')).toContain('<html')
      expect(existsSync(join(dir, 'out/flow-desktop.html'))).toBe(true)
      expect(err).toContain('Flow report:')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('needs a start URL', async () => {
    let err = ''
    const cwd = mkdtempSync(join(tmpdir(), 'unlighthouse-flow-cli-'))
    try {
      const code = await main(['flow', 'search.ts'], { cwd, env: {}, handleSignals: false, stdout: { write: () => {} }, stderr: { write: (text: string) => (err += text) } })
      expect(code).toBe(2)
      expect(err).toContain('--url')
    }
    finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
