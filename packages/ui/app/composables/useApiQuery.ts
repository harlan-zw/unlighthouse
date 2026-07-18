import type {
  CommandInput,
  CommandOutput,
  CommandRegistry,
  NonStreamingCommandName,
} from '@unlighthouse/contracts/commands'
import type { MaybeRefOrGetter } from 'vue'
import type { ApiError } from './useApiError'
import { callClientCommand } from '@unlighthouse/contracts/client'
import { commands } from '@unlighthouse/contracts/commands'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { useNuxtAsyncQuery } from 'nuxt-use-query/async-query'
import { computed, toValue } from 'vue'
import { normalizeApiError } from './useApiError'

// "Parse, don't validate" at the read boundary. The server validates command
// *input* but never *output* (no transport runs `cmd.output.parse`), so the UI
// otherwise trusts response shapes blindly. The command schemas are already
// bundled in the client, so checking the payload against `commands[cmd].output`
// is nearly free. Dev-only + pass-through: a mismatch is surfaced as a console
// warning (contract-drift detector) but the raw data still flows, so tightening
// a schema can never break a working page. Loose `z.unknown()` outputs
// (pack.run, …) parse trivially and are no-ops here.
function validateResponse<K extends NonStreamingCommandName>(command: K, data: unknown): void {
  if (!import.meta.dev)
    return
  const result = commands[command].output.safeParse(data)
  if (!result.success)
    logOperationalWarn('ui.output_contract_mismatch', result.error, { command }, console)
}

export interface UseApiQueryOptions {
  /** Disable until truthy — no fetch fires while `false`. */
  enabled?: MaybeRefOrGetter<boolean>
  /** Override the derived cache key (defaults to `command:<input>`). */
  key?: MaybeRefOrGetter<string>
  staleTime?: number | 'static'
  gcTime?: number
  keepPreviousData?: boolean
  /** Polling interval (ms). `false`/`null` disables. Reactive. */
  refetchInterval?: MaybeRefOrGetter<number | false | null | undefined>
  refetchOnWindowFocus?: boolean | 'always'
  refetchOnReconnect?: boolean | 'always'
  refetchOnMount?: boolean | 'always'
}

/**
 * Deterministic cache key for a command + input. Sorts object keys so two
 * structurally-equal inputs hash identically regardless of property order.
 */
function stableInputKey(input: unknown): string {
  if (input == null || typeof input !== 'object')
    return input == null ? '' : String(input)
  const entries = Object.entries(input)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(entries)
}

/**
 * Read a backend command as a query with real loading + error states.
 *
 * Replaces the old query pattern that swallowed command failures: errors now
 * land in `error` (normalized to {@link ApiError}) instead
 * of masquerading as empty data, and the result is SWR-cached + invalidatable
 * by command-name prefix.
 */
export function useApiQuery<K extends NonStreamingCommandName>(
  command: K,
  input: MaybeRefOrGetter<CommandInput<CommandRegistry[K]>>,
  opts: UseApiQueryOptions = {},
) {
  const api = useApi()
  const key = computed(() =>
    opts.key != null ? toValue(opts.key) : `${command}:${stableInputKey(toValue(input))}`,
  )

  const query = useNuxtAsyncQuery<CommandOutput<CommandRegistry[K]>>(
    async () => {
      const data = await callClientCommand(api, command, toValue(input))
      validateResponse(command, data)
      return data
    },
    {
      key,
      enabled: opts.enabled,
      // The package default is 0 (refetch on every remount) — a footgun
      // nuxtseo.com sidesteps by always setting one. Default to 30s here so
      // navigation between routes doesn't re-hit the backend; callers that
      // need fresher data pass `staleTime` / `refetchInterval` explicitly.
      staleTime: opts.staleTime ?? 30_000,
      gcTime: opts.gcTime,
      keepPreviousData: opts.keepPreviousData,
      refetchInterval: opts.refetchInterval,
      refetchOnWindowFocus: opts.refetchOnWindowFocus,
      refetchOnReconnect: opts.refetchOnReconnect,
      refetchOnMount: opts.refetchOnMount,
    },
  )

  const error = computed<ApiError | null>(() =>
    query.error.value ? normalizeApiError(query.error.value) : null,
  )

  return {
    ...query,
    /** SWR display value: keeps the previous result visible while refetching. */
    data: query.displayData,
    /** Normalized failure, or `null`. Use `_tag === 'offline'` for a banner. */
    error,
  }
}
