import type { ScanWorkflowEnv, ScanWorkflowParams } from '../src/workflows/scan'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScanWorkflow } from '../src/workflows/scan'

const lifecycle = vi.hoisted(() => ({
  create: vi.fn(async () => {}),
  discovering: vi.fn(async () => {}),
  scanning: vi.fn(async () => {}),
  progress: vi.fn(async () => ({})),
  pause: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  routeFailed: vi.fn(async () => {}),
  complete: vi.fn(async () => ({})),
  fail: vi.fn(async () => {}),
}))

vi.mock('@unlighthouse/core/runtime', () => ({
  createScanLifecycle: vi.fn(() => lifecycle),
}))

interface StepConfig {
  retries?: { limit: number }
}

class FakeWorkflowStep {
  calls: string[] = []
  rollbacks = new Map<string, () => Promise<void>>()

  async do(name: string, ...args: unknown[]): Promise<unknown> {
    this.calls.push(name)
    const hasConfig = typeof args[0] !== 'function'
    const config = (hasConfig ? args[0] : undefined) as StepConfig | undefined
    const callback = (hasConfig ? args[1] : args[0]) as () => Promise<unknown>
    const rollbackOptions = (hasConfig ? args[2] : args[1]) as { rollback?: () => Promise<void> } | undefined
    if (rollbackOptions?.rollback)
      this.rollbacks.set(name, rollbackOptions.rollback)

    const attempts = (config?.retries?.limit ?? 0) + 1
    let failure: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await callback()
      }
      catch (error) {
        failure = error
      }
    }
    throw failure
  }
}

function params(): ScanWorkflowParams {
  return {
    scanId: 'scan-workflow-1',
    site: 'https://example.com/',
    devices: ['mobile'],
    mode: 'page',
    config: { scanner: { sitemap: false } },
    startedAt: '2026-01-01T00:00:00.000Z',
    startedAtMs: 1,
  }
}

function event(payload = params()) {
  return {
    payload,
    timestamp: new Date(payload.startedAt),
    instanceId: payload.scanId,
    workflowName: 'unlighthouse-scan',
  }
}

function createWorkflow(audit: ScanWorkflowEnv['AUDIT']['audit']): ScanWorkflow {
  return new ScanWorkflow({} as ExecutionContext, {
    DB: {} as D1Database,
    BLOBS: {} as R2Bucket,
    AUDIT: { audit },
  })
}

describe('scan Workflow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('runs one stable durable audit/progress sequence per URL', async () => {
    const audit = vi.fn(async () => ({ scanned: 1, failed: 0 }))
    const workflow = createWorkflow(audit)
    const step = new FakeWorkflowStep()

    await expect(workflow.run(event(), step as never)).resolves.toEqual({
      scanId: 'scan-workflow-1',
      discovered: 1,
      scanned: 1,
      failed: 0,
    })

    expect(step.calls).toEqual([
      'lifecycle:create',
      'discover:initial',
      'lifecycle:scanning',
      'audit:000',
      'progress:000',
      'lifecycle:complete',
    ])
    expect(audit).toHaveBeenCalledWith({
      scanId: 'scan-workflow-1',
      url: 'https://example.com/',
      devices: ['mobile'],
    })
    expect(lifecycle.complete).toHaveBeenCalledWith(expect.objectContaining({
      discovered: 1,
      scanned: 1,
      failed: 0,
    }))
  })

  it('uses Workflow retries, records an exhausted route, and continues', async () => {
    const audit = vi.fn(async () => { throw new Error('temporary RPC failure') })
    const workflow = createWorkflow(audit)
    const step = new FakeWorkflowStep()

    await expect(workflow.run(event(), step as never)).resolves.toMatchObject({
      scanned: 0,
      failed: 1,
    })

    expect(audit).toHaveBeenCalledTimes(4)
    expect(step.calls).toContain('route-failed:000')
    expect(lifecycle.routeFailed).toHaveBeenCalledTimes(1)
    expect(lifecycle.fail).not.toHaveBeenCalled()
  })

  it('registers explicit lifecycle cancellation for terminate rollback', async () => {
    const workflow = createWorkflow(vi.fn(async () => ({ scanned: 1, failed: 0 })))
    const step = new FakeWorkflowStep()
    await workflow.run(event(), step as never)

    await step.rollbacks.get('lifecycle:create')?.()

    expect(lifecycle.cancel).toHaveBeenCalledWith('workflow terminated')
  })
})
