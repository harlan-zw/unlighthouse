import type { WorkerTask } from './types'

/** Identity helper that pins task payload/result types for editor inference. */
export function defineTask<TPayload = unknown, TResult = unknown>(
  task: WorkerTask<TPayload, TResult>,
): WorkerTask<TPayload, TResult> {
  return task
}
