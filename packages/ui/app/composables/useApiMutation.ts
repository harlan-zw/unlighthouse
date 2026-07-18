import type {
  CommandInput,
  CommandOutput,
  CommandRegistry,
  NonStreamingCommandName,
} from '@unlighthouse/contracts/commands'
import { callClientCommand } from '@unlighthouse/contracts/client'
import { useNuxtMutation } from 'nuxt-use-query/mutation'

type Input<K extends NonStreamingCommandName> = CommandInput<CommandRegistry[K]>
type Output<K extends NonStreamingCommandName> = CommandOutput<CommandRegistry[K]>

export interface UseApiMutationOptions<K extends NonStreamingCommandName, TContext = unknown> {
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
export function useApiMutation<K extends NonStreamingCommandName, TContext = unknown>(
  command: K,
  opts: UseApiMutationOptions<K, TContext> = {},
) {
  const api = useApi()
  return useNuxtMutation<Input<K>, Output<K>, TContext>({
    mutation: input => callClientCommand(api, command, input),
    invalidates: opts.invalidates,
    onMutate: opts.onMutate,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
    onSettled: opts.onSettled,
  })
}
