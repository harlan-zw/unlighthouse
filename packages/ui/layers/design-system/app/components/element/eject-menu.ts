import type { RouteLocationRaw } from 'vue-router'

/**
 * Eject-to-code / eject-to-chat payload shapes shared by `<UiEjectMenu>` and any
 * primitive that embeds it (e.g. `<UiCard chat>`). The URL contract for the chat
 * deep-link is owned by `layers/chat/app/internal/schemas/chat-deep-link.ts`; keep
 * the `entity` / `filter` / `seed` fields in sync with that schema.
 */
export interface EjectChat {
  /**
   * Navigation target. **Default (omit `to`): open the contextual chat
   * slide-over in place** on the current route — <ProChatPanel> self-opens on
   * the `?seed=&entity=&filter=` query everywhere except `/chat` routes. This is
   * the rule for every data-surface eject (card / row / section): stay in
   * context. Only set `to: '/pro/dashboard/chat'` (full-page chat) in the two
   * cases where an in-place slide-over can't or shouldn't open: (1) the eject
   * lives inside another open overlay/modal, where a slide-over would stack; (2)
   * a global launcher (command palette) where chat IS the destination.
   */
  to?: RouteLocationRaw
  entity?: string
  filter?: Record<string, unknown>
  seed?: string
  // When true, the chat fires `sendMessage(seed)` automatically once hydrate
  // resolves. Convention: eject seeds are complete, self-contained questions
  // built from real card/row state, so they auto-send (`true`) — the user gets
  // an answer on open, not a half-typed box. Leave unset only when the seed is a
  // deliberate starting point the user is expected to edit before sending.
  autoSend?: boolean
}

export interface EjectLink {
  to: RouteLocationRaw
  label?: string
}

export interface EjectMcp {
  tool: string
  args?: Record<string, unknown>
}

/**
 * A first-class operation (not an eject-to-code copy), e.g. "Run checks now".
 * Rendered as a leading group above the cURL/MCP/schema items so a row can carry
 * its own actions through the menu it already has, instead of an extra button.
 */
export interface EjectAction {
  label: string
  icon?: string
  onSelect: () => void | Promise<void>
  disabled?: boolean
}
