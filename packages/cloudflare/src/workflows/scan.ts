import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { DeviceMatrix } from '@unlighthouse/contracts/types/atoms'
import type { EmitFn } from '@unlighthouse/core/runtime'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import { ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'
import { createScanLifecycle } from '@unlighthouse/core/runtime'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { d1R2Storage } from '../storage/d1-r2'
import {
  discoverCloudflarePageLinks,
  discoverCloudflareScanUrls,
  MAX_CLOUDFLARE_SCAN_QUEUE,
} from './discovery'

const LIFECYCLE_STEP_CONFIG = {
  retries: { limit: 3, delay: '1 second', backoff: 'exponential' },
  timeout: '1 minute',
} as const

const AUDIT_STEP_CONFIG = {
  retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
  timeout: '15 minutes',
} as const

const LINK_STEP_CONFIG = {
  retries: { limit: 2, delay: '1 second', backoff: 'exponential' },
  timeout: '1 minute',
} as const

const NOOP_EMIT: EmitFn = async () => {}

export interface ScanAuditInput {
  scanId: string
  url: string
  devices: DeviceMatrix
}

export interface ScanAuditResult {
  scanned: number
  failed: number
}

/** Structural WorkerEntrypoint binding consumed by the Workflow. */
export interface ScanAuditBinding {
  audit: (input: ScanAuditInput) => Promise<ScanAuditResult>
}

export interface ScanWorkflowParams {
  scanId: string
  site: string
  devices: DeviceMatrix
  mode: 'site' | 'page'
  config: UnlighthouseConfig
  startedAt: string
  startedAtMs: number
}

export interface ScanWorkflowResult {
  scanId: string
  discovered: number
  scanned: number
  failed: number
}

export interface ScanWorkflowInstance {
  id: string
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** Pass `{ rollback: true }` so the Workflow's lifecycle rollback marks D1 cancelled. */
  terminate: (options?: { rollback?: boolean }) => Promise<void>
  status: () => Promise<{
    status: 'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'waitingForPause' | 'unknown'
    error?: { name: string, message: string }
    output?: unknown
  }>
}

/** Structural Workflow binding for app hosts and generated Worker env types. */
export interface ScanWorkflowBinding {
  create: (options: {
    id: string
    params: ScanWorkflowParams
  }) => Promise<ScanWorkflowInstance>
  get: (id: string) => Promise<ScanWorkflowInstance>
}

export interface ScanWorkflowEnv {
  DB: D1Database
  BLOBS: R2Bucket
  AUDIT: ScanAuditBinding
}

function indexedStep(prefix: string, index: number): string {
  return `${prefix}:${String(index).padStart(3, '0')}`
}

function delegationFailure(error: unknown): UnlighthouseError {
  return error instanceof UnlighthouseError
    ? error
    : new UnlighthouseError({
        code: ErrorCodes.AUDIT_DELEGATION_FAILED,
        message: 'Audit RPC failed after Workflow retries.',
        cause: error,
        retryable: true,
      })
}

/**
 * Durable scan orchestration owned by Cloudflare Workflows. Step outputs are
 * deliberately small: Lighthouse artifacts stay in D1/R2 and audit steps only
 * persist counters.
 */
export class ScanWorkflow extends WorkflowEntrypoint<ScanWorkflowEnv, ScanWorkflowParams> {
  private runtimeEnv: ScanWorkflowEnv

  constructor(ctx: ExecutionContext, env: ScanWorkflowEnv) {
    super(ctx, env)
    this.runtimeEnv = env
  }

  private lifecycle(params: ScanWorkflowParams) {
    return createScanLifecycle({
      storage: d1R2Storage({ db: this.runtimeEnv.DB, bucket: this.runtimeEnv.BLOBS }),
      config: params.config,
      emit: NOOP_EMIT,
      scan: {
        scanId: parseScanId(params.scanId),
        site: params.site,
        devices: params.devices,
        mode: params.mode,
        startedAt: params.startedAt,
        startedAtMs: params.startedAtMs,
      },
    })
  }

  override async run(
    event: Readonly<WorkflowEvent<ScanWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<ScanWorkflowResult> {
    const params = event.payload
    const lifecycle = this.lifecycle(params)

    try {
      await step.do(
        'lifecycle:create',
        LIFECYCLE_STEP_CONFIG,
        async () => {
          await lifecycle.create()
          return null
        },
        {
          // App cancellation calls `terminate({ rollback: true })`; this is the
          // explicit bridge from native Workflow termination to the public scan
          // lifecycle stored in D1.
          rollback: async () => {
            await lifecycle.cancel('workflow terminated')
          },
          rollbackConfig: LIFECYCLE_STEP_CONFIG,
        },
      )

      const initial = await step.do(
        'discover:initial',
        LINK_STEP_CONFIG,
        () => discoverCloudflareScanUrls(params),
      )
      const urls = [...initial.urls]
      const known = new Set(urls)
      let scanned = 0
      let failed = 0

      await step.do('lifecycle:scanning', LIFECYCLE_STEP_CONFIG, async () => {
        await lifecycle.scanning(urls.length)
        return null
      })

      for (let index = 0; index < urls.length && index < MAX_CLOUDFLARE_SCAN_QUEUE; index++) {
        const url = urls[index]
        if (!url)
          continue

        let result: ScanAuditResult | null = null
        try {
          result = await step.do(indexedStep('audit', index), AUDIT_STEP_CONFIG, async () => {
            const audit = await this.runtimeEnv.AUDIT.audit({
              scanId: params.scanId,
              url,
              devices: params.devices,
            })
            if (
              !Number.isInteger(audit.scanned)
              || audit.scanned < 0
              || !Number.isInteger(audit.failed)
              || audit.failed < 0
              || audit.scanned + audit.failed !== params.devices.length
            ) {
              throw new UnlighthouseError({
                code: ErrorCodes.AUDIT_DELEGATION_FAILED,
                message: 'Audit RPC returned invalid counters.',
                details: { audit },
                retryable: true,
              })
            }
            return audit
          })
        }
        catch (error) {
          const failure = delegationFailure(error)
          await step.do(indexedStep('route-failed', index), LIFECYCLE_STEP_CONFIG, async () => {
            await lifecycle.routeFailed(url, failure)
            return null
          })
          failed += params.devices.length
        }

        if (result) {
          scanned += result.scanned
          failed += result.failed
        }

        if (initial.linkDiscovery && result?.scanned && urls.length < MAX_CLOUDFLARE_SCAN_QUEUE) {
          let links: string[] = []
          try {
            links = await step.do(indexedStep('links', index), LINK_STEP_CONFIG, () => {
              return discoverCloudflarePageLinks({
                pageUrl: url,
                site: params.site,
                config: params.config,
              })
            })
          }
          catch (error) {
            logOperationalWarn('cloudflare.link_discovery_failed', error, {
              scanId: params.scanId,
              url,
            })
          }

          for (const link of links) {
            if (urls.length >= MAX_CLOUDFLARE_SCAN_QUEUE)
              break
            if (known.has(link))
              continue
            known.add(link)
            urls.push(link)
          }
        }

        await step.do(indexedStep('progress', index), LIFECYCLE_STEP_CONFIG, async () => {
          await lifecycle.progress({
            discovered: urls.length,
            scanned,
            failed,
            total: urls.length,
          })
          return null
        })
      }

      const result: ScanWorkflowResult = {
        scanId: params.scanId,
        discovered: urls.length,
        scanned,
        failed,
      }
      await step.do('lifecycle:complete', LIFECYCLE_STEP_CONFIG, async () => {
        await lifecycle.complete(result)
        return null
      })
      return result
    }
    catch (error) {
      await step.do('lifecycle:fail', LIFECYCLE_STEP_CONFIG, async () => {
        await lifecycle.fail(error)
        return null
      })
      throw error instanceof Error ? error : new Error(String(error))
    }
  }
}
