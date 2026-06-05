import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { EjectChat, EjectLink, EjectMcp } from '../components/element/EjectMenu.vue'
import { computed, toValue } from 'vue'

/**
 * Schema-shaped description of a queryable endpoint.
 *
 * VISION principle 5: every feature is defined by a typed schema before it ships a UI.
 * `useEject` is the spine that turns that schema into the four eject payloads
 * (cURL, MCP, AI chat, API schema link) so consumers don't hand-roll each one.
 *
 * The composable is dumb plumbing. It does no fetching, no auth resolution, no
 * runtime config reading; the caller passes the API base + key surface, the
 * schema reference, and the entity/filter context. The result feeds directly
 * into `<EjectMenu />` props.
 */
export interface EjectQuery {
  /** MCP tool name. Required for MCP + AI chat ejection. */
  tool: string
  /** Tool arguments. Same shape passed to MCP and serialised into curl body. */
  args?: Record<string, unknown>
  /** Absolute or origin-relative endpoint path for cURL ejection. */
  endpoint?: string
  /** HTTP method for cURL. Defaults to POST when `args` is set, GET otherwise. */
  method?: 'GET' | 'POST'
  /** Origin for cURL (defaults to `window.location.origin` when omitted on client). */
  origin?: string
  /** Auth header surfaced in the copied cURL example. Use a placeholder, not a real key. */
  authHeader?: string
  /** Deep-link target for AI chat ejection (path + optional query base). */
  chatTo?: RouteLocationRaw
  /** Entity ID seeded into chat deep links (e.g. `site:abc`, `query:foo`). */
  entity?: string
  /** Filter state seeded into chat deep links. */
  filter?: Record<string, unknown>
  /** Question seed text for chat. */
  seed?: string
  /** Schema doc link. */
  schemaTo?: RouteLocationRaw
  /** Custom schema link label. */
  schemaLabel?: string
}

export interface EjectPayloads {
  curl: ComputedRef<string | undefined>
  mcp: ComputedRef<EjectMcp | undefined>
  chat: ComputedRef<EjectChat | undefined>
  schema: ComputedRef<EjectLink | undefined>
}

function buildCurl(q: EjectQuery): string | undefined {
  if (!q.endpoint)
    return undefined
  const origin = q.origin ?? (import.meta.client ? window.location.origin : '')
  const method = q.method ?? (q.args ? 'POST' : 'GET')
  const auth = q.authHeader ?? 'Authorization: Bearer YOUR_API_KEY'
  const url = `${origin}${q.endpoint.startsWith('/') ? '' : '/'}${q.endpoint}`
  const parts = [
    `curl -X ${method} '${url}'`,
    `  -H '${auth}'`,
  ]
  if (method !== 'GET' && q.args) {
    parts.push(`  -H 'Content-Type: application/json'`)
    parts.push(`  -d '${JSON.stringify(q.args)}'`)
  }
  return parts.join(' \\\n')
}

export function useEject(query: MaybeRefOrGetter<EjectQuery>): EjectPayloads {
  const q = computed(() => toValue(query))

  return {
    curl: computed(() => buildCurl(q.value)),
    mcp: computed(() =>
      q.value.tool
        ? { tool: q.value.tool, args: q.value.args }
        : undefined,
    ),
    chat: computed(() =>
      q.value.chatTo
        ? {
            to: q.value.chatTo,
            entity: q.value.entity,
            filter: q.value.filter,
            seed: q.value.seed,
          }
        : undefined,
    ),
    schema: computed(() =>
      q.value.schemaTo
        ? { to: q.value.schemaTo, label: q.value.schemaLabel }
        : undefined,
    ),
  }
}
