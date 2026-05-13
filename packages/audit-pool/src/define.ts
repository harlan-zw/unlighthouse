import type { AuditPoolOptions, WorkerTask } from './types'

/** Identity helper. Carries types through for editor autocomplete. */
export function defineAuditPool(options: AuditPoolOptions): AuditPoolOptions {
  return options
}

/** Identity helper that pins task payload/result types for editor inference. */
export function defineTask<TPayload = unknown, TResult = unknown>(
  task: WorkerTask<TPayload, TResult>,
): WorkerTask<TPayload, TResult> {
  return task
}
