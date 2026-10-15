import { z } from 'zod'
import type { Store } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import type { Notifier } from '../scan/notify.ts'
import type { Scanner } from '../scan/runner.ts'
import type { Scheduler } from '../scan/scheduler.ts'

export interface OperationContext {
  store: Store
  scanner: Scanner
  signal?: AbortSignal
  scheduler?: Pick<Scheduler, 'wake'>
  notifier?: Notifier
}

export interface Operation<Input extends z.ZodType = z.ZodType, Output = unknown> {
  name: string
  description: string
  kind: 'read' | 'write'
  input: Input
  output?: z.ZodType
  handler(ctx: OperationContext, input: z.output<Input>): Output | Promise<Output>
}

export type AnyOperation = Operation<z.ZodType, unknown>

export function defineOperation<Input extends z.ZodType, Output>(operation: Operation<Input, Output>): Operation<Input, Output> {
  return operation
}

export function parseInput<Input extends z.ZodType>(operation: Operation<Input, unknown>, raw: unknown): z.output<Input> {
  const result = operation.input.safeParse(raw ?? {})
  if (!result.success)
    throw new UnlighthouseError('INVALID_INPUT', `Invalid input for ${operation.name}: ${z.prettifyError(result.error)}`, result.error.issues)
  return result.data
}

export async function invoke(operations: readonly AnyOperation[], ctx: OperationContext, name: string, raw: unknown): Promise<unknown> {
  const operation = operations.find(candidate => candidate.name === name)
  if (!operation)
    throw new UnlighthouseError('NOT_FOUND', `Unknown operation: ${name}`)
  return operation.handler(ctx, parseInput(operation, raw))
}
