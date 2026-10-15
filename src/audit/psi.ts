import type { Result } from 'lighthouse'
import type { RunnerConfig } from '../config.ts'
import type { AuditJob } from '../contracts.ts'
import type { Category } from '../types.ts'
import type { FailureKind } from './protocol.ts'
import { classifyLighthouseError } from './protocol.ts'
import { psiLighthouseResult } from './reconcile.ts'

export type PsiRunner = Extract<RunnerConfig, { type: 'psi' }>

export type PsiOutcome =
  | { ok: true, lhr: Result }
  | { ok: false, kind: FailureKind, code: string, message: string }

export interface PsiOptions {
  apiKey: string
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export const MAX_BACKOFF_MS = 60_000

const PSI_CATEGORIES: Partial<Record<Category, string>> = {
  'performance': 'PERFORMANCE',
  'accessibility': 'ACCESSIBILITY',
  'best-practices': 'BEST_PRACTICES',
  'seo': 'SEO',
}

export function psiRequestUrl(job: Pick<AuditJob, 'url' | 'device' | 'categories'>, runner: PsiRunner, apiKey: string): string {
  const url = new URL(runner.endpoint)
  url.searchParams.set('url', job.url)
  url.searchParams.set('strategy', job.device === 'desktop' ? 'DESKTOP' : 'MOBILE')
  for (const category of job.categories) {
    const name = PSI_CATEGORIES[category]
    if (name)
      url.searchParams.append('category', name)
  }
  url.searchParams.set('key', apiKey)
  return url.toString()
}

function retryAfterMs(header: string | null): number | null {
  if (!header)
    return null
  const seconds = Number(header)
  if (Number.isFinite(seconds))
    return Math.max(0, seconds * 1000)
  const date = Date.parse(header)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown } }
    if (typeof body.error?.message === 'string')
      return body.error.message
  }
  catch {}
  return text.trim().slice(0, 300) || response.statusText
}

export async function runPsi(job: Pick<AuditJob, 'url' | 'device' | 'categories'>, runner: PsiRunner, options: PsiOptions): Promise<PsiOutcome> {
  const sleep = options.sleep ?? Bun.sleep
  const request = psiRequestUrl(job, runner, options.apiKey)
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(request, { headers: { accept: 'application/json' }, ...(options.signal ? { signal: options.signal } : {}) })
    }
    catch (error) {
      return { ok: false, kind: 'infra', code: 'PSI_UNREACHABLE', message: `PageSpeed Insights could not be reached: ${error instanceof Error ? error.message : String(error)}` }
    }
    if (response.status === 429) {
      const detail = await errorMessage(response)
      if (attempt >= runner.maxRetries)
        return { ok: false, kind: 'page', code: 'PSI_QUOTA', message: `PageSpeed Insights quota exceeded (HTTP 429) after ${attempt + 1} attempt(s): ${detail}. Lower concurrency, wait for the quota to reset, or raise it for your API key in the Google Cloud console.` }
      await sleep(Math.min(MAX_BACKOFF_MS, retryAfterMs(response.headers.get('retry-after')) ?? runner.backoffMs * 2 ** attempt))
      continue
    }
    if (!response.ok) {
      const detail = await errorMessage(response)
      const code = /Lighthouse returned error: ([A-Z_]+)/.exec(detail)?.[1]
      if (code)
        return { ok: false, kind: classifyLighthouseError(code), code, message: `PageSpeed Insights: ${detail}` }
      const kind: FailureKind = response.status >= 500 ? 'infra' : 'page'
      return { ok: false, kind, code: `PSI_HTTP_${response.status}`, message: `PageSpeed Insights answered HTTP ${response.status}: ${detail}` }
    }
    const lhr = psiLighthouseResult(await response.json().catch(() => null))
    if (!lhr)
      return { ok: false, kind: 'infra', code: 'PSI_NO_RESULT', message: 'PageSpeed Insights answered without a Lighthouse result' }
    return { ok: true, lhr }
  }
}
