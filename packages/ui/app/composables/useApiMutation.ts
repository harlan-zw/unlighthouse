import type {
  CommandInput,
  CommandName,
  CommandOutput,
  CommandRegistry,
} from '@unlighthouse/contracts/commands'
import { useNuxtMutation } from 'nuxt-use-query/mutation'

type Input<K extends CommandName> = CommandInput<CommandRegistry[K]>
type Output<K extends CommandName> = CommandOutput<CommandRegistry[K]>

export interface UseApiMutationOptions<K extends CommandName, TContext = unknown> {
  /**
   * Command-name prefixes whose {@link useApiQuery} reads should refetch once
   * the mutation succeeds — e.g. `['scan.results', 'scan.summary']`. Matches
   * the `command:<input>` key scheme, so a bare command name invalidates all
   * its inputs.
   */
  invalidates?: string[] | ((input: Input<K>, result: Output<K>) => string[])
  onMutate?: (input: Input<K>) => TContext | Promise<TContext>
  onSuccess?: (result: Output<K>, input: Input<K>, context: TContext | undefined) => void
  onError?: (error: unknown, input: Input<K>, context: TContext | undefined) => void
  onSettled?: (result: Output<K> | undefined, error: unknown, input: Input<K>, context: TContext | undefined) => void
}

/**
 * Write a backend command as a mutation that auto-invalidates the reads it
 * affects. Prefer `mutateSafe` at call sites: it returns a tagged
 * `{ _tag: 'ok' | 'err' }` outcome (run the error through `normalizeApiError`)
 * rather than throwing.
 */
export function useApiMutation<K extends CommandName, TContext = unknown>(
  command: K,
  opts: UseApiMutationOptions<K, TContext> = {},
) {
  const api = useApi()
  return useNuxtMutation<Input<K>, Output<K>, TContext>({
    mutation: input => api[command](input as CommandInput<CommandRegistry[K]>) as Promise<Output<K>>,
    invalidates: opts.invalidates,
    onMutate: opts.onMutate,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
    onSettled: opts.onSettled,
  })
}
